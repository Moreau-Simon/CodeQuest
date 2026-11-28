import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import type { MailMessage } from '../../src/mail/mail.service';
import type { TestInfrastructure } from './db';

export interface CreateTestAppOptions {
  /** Remplace l'horloge serveur (scénarios temporels US9, FR-061/FR-062). */
  readonly clock?: import('../../src/common/clock').Clock;
  /** Remplace l'appel au service d'assets (US13, sans démarrer FastAPI). */
  readonly assetsFetch?: typeof globalThis.fetch;
  /** Remplace un provider (ex. transport Web Push) dans le module de test. */
  readonly overrides?: ReadonlyArray<{ token: unknown; useValue: unknown }>;
}

export interface TestApp {
  readonly app: NestExpressApplication;
  /** Agent supertest conservant les cookies de session. */
  readonly agent: TestAgent;
  /** Agent sans cookie, pour les routes anonymes. */
  readonly anonymous: TestAgent;
  /** Ferme l'application Nest (les conteneurs restent gérés par `db.ts`). */
  close(): Promise<void>;
  /** Attend qu'un e-mail soit mis en file (ou livré) et le renvoie. */
  waitForEmail(
    name: 'confirmation' | 'password-reset',
    predicate?: (message: MailMessage) => boolean,
    timeoutMs?: number
  ): Promise<MailMessage>;
}

/**
 * Démarre l'application Nest avec exactement le pipeline HTTP de production
 * (`configureApp`) sur l'infrastructure éphémère.
 *
 * Les modules `src/` sont importés dynamiquement : `env` est validé à
 * l'import, et les URLs des conteneurs ne sont connues qu'à l'exécution.
 */
export async function createTestApp(
  infra: TestInfrastructure,
  options: CreateTestAppOptions = {}
): Promise<TestApp> {
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.LOG_LEVEL = 'silent';

  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/bootstrap');

  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) {
    const { Clock } = await import('../../src/common/clock');
    builder.overrideProvider(Clock).useValue(options.clock);
  }
  if (options.assetsFetch) {
    const { ASSETS_FETCH } = await import('../../src/modules/challenges/instance.service');
    builder.overrideProvider(ASSETS_FETCH).useValue(options.assetsFetch);
  }
  for (const override of options.overrides ?? []) {
    builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();

  // Rôles et permissions disponibles pour les comptes créés par les tests.
  const { PrismaService } = await import('../../src/prisma/prisma.service');
  const { seedRbac } = await import('../../prisma/seed/rbac');
  await seedRbac(app.get(PrismaService));

  const server = app.getHttpServer() as Parameters<typeof request.agent>[0];

  return {
    app,
    agent: request.agent(server),
    anonymous: request.agent(server),
    async close() {
      await app.close();
    },
    async waitForEmail(name, predicate, timeoutMs = 5_000) {
      const { QueueService } = await import('../../src/queue/queue.module');
      const queueService = app.get(QueueService);
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        // Le worker mail consomme la file dès que l'application démarre : le
        // message passe donc rapidement en `completed`. Lire aussi cet état
        // évite une course entre l'émission et la livraison (T036).
        const jobs = await queueService.emails.getJobs([
          'waiting',
          'delayed',
          'paused',
          'active',
          'completed'
        ]);
        const found = jobs
          .filter((job: { name: string }) => job.name === name)
          .map((job: { data: unknown }) => job.data as MailMessage)
          .find((message: MailMessage) => (predicate ? predicate(message) : true));
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      throw new Error(`Aucun e-mail « ${name} » reçu en ${timeoutMs} ms`);
    }
  };
}

/** Extrait le paramètre `token` d'un lien envoyé par e-mail. */
export function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error(`Lien sans jeton : ${link}`);
  return token;
}
