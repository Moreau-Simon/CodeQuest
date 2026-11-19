import { createServer } from 'node:http';
import { Queue, type ConnectionOptions } from 'bullmq';
import { config, logger } from './config';
import { createSubmissionWorker, defaultDependencies } from './queue/consumer';
import { BullResultPublisher } from './queue/types';

function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null
  };
}

/**
 * Amorçage du runner (T080) : worker BullMQ, publication des verdicts,
 * file de rebut et petit endpoint de métriques. Aucun code utilisateur n'est
 * exécuté hors du bac à sable gVisor.
 */
async function bootstrap(): Promise<void> {
  const connection = redisConnection(config.REDIS_URL);
  const results = new Queue(config.RESULTS_QUEUE, {
    connection,
    prefix: config.REDIS_PREFIX,
    defaultJobOptions: { removeOnComplete: { age: 3_600, count: 10_000 } }
  });
  const deadLetter = new Queue(config.DLQ, {
    connection,
    prefix: config.REDIS_PREFIX,
    defaultJobOptions: { removeOnComplete: { age: 86_400, count: 5_000 } }
  });

  const publisher = new BullResultPublisher(results);
  const worker = createSubmissionWorker(connection, defaultDependencies(publisher));

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'échec d’infrastructure — DLQ');
    void deadLetter.add('failed', {
      jobId: job?.id,
      data: job?.data,
      failure: { kind: 'infrastructure', message: error.message }
    });
  });

  const metrics = createServer((request, response) => {
    if (request.url === '/metrics') {
      response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
      response.end(
        `# HELP runner_jobs_active Jobs en cours\n# TYPE runner_jobs_active gauge\nrunner_jobs_active ${worker.concurrency ?? 0}\n`
      );
      return;
    }
    response.writeHead(request.url === '/health' ? 200 : 404).end();
  });
  metrics.listen(config.RUNNER_METRICS_PORT);

  logger.info(
    {
      queue: config.QUEUE_SUBMISSIONS,
      results: config.RESULTS_QUEUE,
      runnerId: config.RUNNER_ID,
      concurrency: config.RUNNER_CONCURRENCY
    },
    'runner démarré'
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'arrêt du runner');
    await Promise.allSettled([worker.close(), results.close(), deadLetter.close()]);
    metrics.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
