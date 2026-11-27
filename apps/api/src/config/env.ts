import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

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

/**
 * Validation d'environnement — échec au démarrage si une variable manque
 * ou est invalide (principe II : configuration sûre par défaut).
 */
const booleanish = z
  .string()
  .transform((value) => value === 'true')
  .pipe(z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_PREFIX: z.string().default('codequest'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  REFRESH_TOKEN_SLIDING_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanish.default('false'),

  AES_KEY_BASE64: z.string().min(1),
  AES_KEY_ID: z.string().min(1).default('v1'),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: booleanish.default('false'),
  MINIO_ACCESS_KEY: z.string().default('codequest'),
  MINIO_SECRET_KEY: z.string().default('codequest123'),
  MINIO_BUCKET_ASSETS: z.string().default('codequest-assets'),
  MINIO_BUCKET_AVATARS: z.string().default('codequest-avatars'),
  MINIO_BUCKET_SECRETS: z.string().default('codequest-secrets'),

  // US7 (FR-040) : clé HMAC partagée avec le service assets pour dériver une
  // graine unique par joueur, et URL interne de ce service (jamais exposée).
  ASSETS_SEED_KEY: z.string().min(16).default('codequest-dev-seed-key-000000000000'),
  ASSETS_SERVICE_URL: z.string().url().default('http://localhost:8001'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('CodeQuest <no-reply@codequest.local>'),

  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().min(1),
  // US15 (FR-095) : jeton vocal court, renouvelé à l'explicitation du micro.
  LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  // US8 (FR-057) : persistance périodique des documents Yjs et limite de taille.
  YJS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  YJS_MAX_DOC_BYTES: z.coerce.number().int().positive().default(65_536),

  QUEUE_SUBMISSIONS: z.string().default('submissions'),
  QUEUE_EMAILS: z.string().default('emails'),
  QUEUE_ASSETS: z.string().default('assets'),
  LEADERBOARD_REBUILD_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // US9 (FR-062) : fréquence du job qui consomme les essais abandonnés à la clôture.
  EVENT_ATTEMPT_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  // US14 (FR-097) : fréquence du balayage des manches (diffusion < 2 s).
  BATTLE_ROUND_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  METRICS_PORT: z.coerce.number().int().positive().default(9464)
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(racine)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration d'environnement invalide :\n${details}`);
  }
  return parsed.data;
}

export const env: Env = load();
