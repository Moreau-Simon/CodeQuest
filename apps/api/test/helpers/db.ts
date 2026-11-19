import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

const execFileAsync = promisify(execFile);

/** Racine du paquet `apps/api` (le binaire Prisma y est lié par pnpm). */
const API_ROOT = path.resolve(__dirname, '../..');

export interface TestInfrastructure {
  readonly postgres: StartedPostgreSqlContainer;
  readonly redis: StartedRedisContainer;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  /** Arrête les conteneurs. Toujours appeler dans `afterAll`. */
  stop(): Promise<void>;
}

export interface StartOptions {
  /** Applique les migrations Prisma avec `migrate deploy` (défaut : true). */
  migrate?: boolean;
}

/**
 * Harnais d'intégration (T041) : PostgreSQL 16 et Redis 7 éphémères, isolés
 * par suite de tests. Les migrations sont appliquées telles qu'elles seraient
 * déployées en production (`prisma migrate deploy`), ce qui vérifie aussi le
 * SQL des migrations.
 */
export async function startTestInfrastructure(
  options: StartOptions = {}
): Promise<TestInfrastructure> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start()
  ]);

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = redis.getConnectionUrl();

  try {
    if (options.migrate !== false) {
      await runMigrations(databaseUrl);
    }
  } catch (error) {
    await Promise.allSettled([postgres.stop(), redis.stop()]);
    throw error;
  }

  return {
    postgres,
    redis,
    databaseUrl,
    redisUrl,
    async stop() {
      // Les tests peuvent avoir laissé des connexions ouvertes côté Prisma :
      // Testcontainers tue le conteneur, le client devra se reconnecter.
      await Promise.allSettled([postgres.stop(), redis.stop()]);
    }
  };
}

/** Applique `prisma migrate deploy` sur une base donnée. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  await execFileAsync(path.join(API_ROOT, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 120_000
  });
}

/** Exécute une commande SQL et renvoie la sortie standard (diagnostic). */
export async function psql(postgres: StartedPostgreSqlContainer, sql: string): Promise<string> {
  const result = await postgres.exec([
    'psql',
    '-U',
    postgres.getUsername(),
    '-d',
    postgres.getDatabase(),
    '-tAc',
    sql
  ]);
  return result.output;
}
