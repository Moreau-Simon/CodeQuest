import { HealthService } from './health.service';

describe('HealthService', () => {
  function deps(
    overrides: {
      db?: () => Promise<unknown>;
      redis?: () => Promise<unknown>;
      storage?: () => Promise<void>;
    } = {}
  ) {
    return {
      prisma: {
        $executeRawUnsafe: jest.fn(overrides.db ?? (async () => 1))
      },
      redis: { ping: jest.fn(overrides.redis ?? (async () => 'PONG')) },
      storage: { checkHealth: jest.fn(overrides.storage ?? (async () => undefined)) }
    };
  }

  it('déclare readiness OK quand toutes les dépendances répondent', async () => {
    const { prisma, redis, storage } = deps();
    const service = new HealthService(prisma as never, redis as never, storage as never);

    const report = await service.readiness();

    expect(report.status).toBe('ready');
    expect(report.checks.postgres.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
    expect(report.checks.minio.status).toBe('up');
  });

  it('déclare readiness en échec si une dépendance tombe', async () => {
    const { prisma, redis, storage } = deps({
      redis: async () => {
        throw new Error('connexion refusée');
      }
    });
    const service = new HealthService(prisma as never, redis as never, storage as never);

    const report = await service.readiness();

    expect(report.status).toBe('not_ready');
    expect(report.checks.redis.status).toBe('down');
    expect(report.checks.postgres.status).toBe('up');
  });

  it('expose une liveness sans dépendance externe', () => {
    const { prisma, redis, storage } = deps();
    const service = new HealthService(prisma as never, redis as never, storage as never);

    const live = service.liveness();

    expect(live.status).toBe('ok');
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
