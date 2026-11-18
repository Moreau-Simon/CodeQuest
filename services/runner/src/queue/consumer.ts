import { Worker, type ConnectionOptions } from 'bullmq';
import { config, logger } from '../config';
import { detectAbuse } from '../measure/abuse';
import { measureCpu } from '../measure/cpu';
import { normalizeLimits } from '../measure/limits';
import { DockerSandbox } from '../sandbox/sandbox';
import { loadTestsFromJob } from '../sandbox/tests-loader';
import { JobLedger } from './ledger';
import type { ResultPublisher, RunnerResult, SubmissionJob, SubmissionJobData } from './types';

export interface SandboxLike {
  run(job: {
    submissionId: string;
    language: 'python' | 'javascript';
    code: string;
    limits: SubmissionJobData['limits'];
    tests: Array<{ input: unknown; expected: unknown }>;
  }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    cpuTimeMs: number;
    harness: {
      status: 'passed' | 'failed' | 'error';
      passed?: number;
      total?: number;
      reason?: string | null;
    } | null;
  }>;
}

export interface ProcessorDependencies {
  sandbox: SandboxLike;
  publisher: ResultPublisher;
  ledger?: JobLedger;
  runnerId?: string;
}

/**
 * Traite un job de soumission (T080) :
 * 1. acquitte un doublon sans réexécution ;
 * 2. publie `started` ;
 * 3. déchiffre les tests, exécute 5 runs mesurés ;
 * 4. détecte les abus et publie le verdict brut (aucun score calculé ici).
 */
export async function processSubmission(
  job: SubmissionJobData,
  dependencies: ProcessorDependencies
): Promise<RunnerResult> {
  const ledger = dependencies.ledger ?? new JobLedger();
  const submissionId = job.submissionId ?? job.jobId;

  if (!ledger.claim(submissionId)) {
    logger.info({ submissionId }, 'job déjà traité — acquitté sans réexécution');
    return { submissionId };
  }

  try {
    await dependencies.publisher.publish({
      kind: 'started',
      submissionId,
      userId: job.context.subjectId
    });

    const tests = loadTestsFromJob(job.testsRef, job.challengeVersionId, config.AES_KEY_BASE64);
    const sandboxJob = {
      submissionId,
      language: job.language,
      code: job.code,
      limits: job.limits,
      tests: tests.cases
    };

    const first = await dependencies.sandbox.run(sandboxJob);
    const measurement = await measureCpu(
      async () => (await dependencies.sandbox.run(sandboxJob)).cpuTimeMs,
      5,
      7,
      [first.cpuTimeMs]
    );

    const limits = normalizeLimits(job.limits);
    const abuse = detectAbuse({
      exitCode: first.exitCode,
      stderr: first.stderr,
      networkAttempts: /network is unreachable|connect: permission denied/i.test(first.stderr)
        ? 1
        : 0,
      outputBytes: Buffer.byteLength(first.stdout) + Buffer.byteLength(first.stderr),
      maxOutputBytes: limits.outputBytes
    });

    let status: RunnerResult['status'];
    if (abuse.rejected) status = 'rejected';
    else if (first.timedOut) status = 'timeout';
    else if (!first.harness || first.harness.status === 'error') status = 'error';
    else if (first.harness.status === 'passed') status = 'passed';
    else status = 'failed';

    const verdictReason =
      status === 'rejected'
        ? `Exécution refusée : ${abuse.reasons.join(', ')}`
        : status === 'timeout'
          ? 'Dépassement du temps d’exécution'
          : status === 'error'
            ? 'Erreur pendant l’exécution du code'
            : (first.harness?.reason ?? null);

    const result: RunnerResult = {
      kind: 'verdict',
      submissionId,
      userId: job.context.subjectId,
      status,
      cpuTimesMs: measurement.cpuTimesMs,
      cpuTimeMedianMs: measurement.cpuTimeMedianMs,
      cpuTimeStdDevMs: measurement.cpuTimeStdDevMs,
      testsPassed: first.harness?.passed ?? 0,
      testsTotal: first.harness?.total ?? tests.cases.length,
      verdictReason,
      failure: null,
      sandbox: {
        runtime: 'gvisor',
        image: job.language === 'python' ? config.PYTHON_IMAGE : config.NODE_IMAGE,
        exitCode: first.exitCode,
        oomKilled: false,
        seccompViolations: abuse.rejected ? abuse.reasons.length : 0,
        networkAttempts: 0
      },
      measuredAt: new Date().toISOString(),
      runnerId: dependencies.runnerId ?? config.RUNNER_ID
    };

    await dependencies.publisher.publish(result);
    ledger.complete(submissionId);
    return result;
  } catch (error) {
    // Échec d'infrastructure : le job part en DLQ, jamais en verdict joueur.
    ledger.release(submissionId);
    throw error;
  }
}

export function createSubmissionWorker(
  connection: ConnectionOptions,
  dependencies: ProcessorDependencies
): Worker<SubmissionJobData> {
  const ledger = dependencies.ledger ?? new JobLedger();
  return new Worker<SubmissionJobData>(
    config.QUEUE_SUBMISSIONS,
    async (job: SubmissionJob) => {
      await processSubmission(job.data, { ...dependencies, ledger });
    },
    {
      connection,
      concurrency: config.RUNNER_CONCURRENCY,
      prefix: config.REDIS_PREFIX
    }
  );
}

export function defaultDependencies(publisher: ResultPublisher): ProcessorDependencies {
  return { sandbox: new DockerSandbox(), publisher, ledger: new JobLedger() };
}
