import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import pino from 'pino';

if (typeof process.loadEnvFile === 'function') {
  for (const candidate of ['.env', '../.env', '../../.env']) {
    const fullPath = resolve(process.cwd(), candidate);
    if (existsSync(fullPath)) {
      try {
        process.loadEnvFile(fullPath);
        break;
      } catch {
        // Ignorer si déjà chargé ou inaccessible
      }
    }
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().min(1),
  REDIS_PREFIX: z.string().default('codequest'),
  QUEUE_SUBMISSIONS: z.string().default('submissions'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RUNNER_ID: z.string().default('runner-1'),
  RUNNER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  RESULTS_QUEUE: z.string().default('submissions-results'),
  DLQ: z.string().default('submissions-dlq'),
  RUNSC_PATH: z.string().default('runsc'),
  PYTHON_IMAGE: z.string().default('codequest/py312-runner:1.4.0'),
  NODE_IMAGE: z.string().default('codequest/node20-runner:1.4.0'),
  AES_KEY_BASE64: z.string().min(1),
  AES_KEY_ID: z.string().default('v1'),
  RUNNER_METRICS_PORT: z.coerce.number().int().positive().default(9464)
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
  const details = env.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuration runner invalide :\n${details}`);
}

export const config = env.data;

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'runner', runnerId: config.RUNNER_ID }
});
