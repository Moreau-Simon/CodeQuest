import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedPlayer, seedScore, seedTheme } from '../helpers/leaderboard';
import type { RedisService } from '../../src/redis/redis.module';
import {
  GLOBAL_SCOPE_ID,
  leaderboardKey
} from '../../src/modules/leaderboards/leaderboard.constants';
import type { LeaderboardService } from '../../src/modules/leaderboards/leaderboard.service';

/**
 * T092 — la reconstruction périodique depuis `best_scores` doit produire
 * exactement le même classement que le ZSET temps réel (SC-009).
 *
 * Écrit avant l'implémentation (TDD).
 */
describe('classements — reconstruction identique au temps réel (T092)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let service: LeaderboardService;
  let redis: RedisService;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    const theme = await seedTheme(prisma, 'reconstruction');
    const challenge = await seedChallenge(prisma, theme.id);

    const alice = await seedPlayer(prisma, 'alice');
    const bob = await seedPlayer(prisma, 'bob');
    const carol = await seedPlayer(prisma, 'carol');

    const now = Date.now();
    await seedScore(prisma, {
      playerId: alice.id,
      challenge,
      score: 120,
      achievedAt: new Date(now - 60_000)
    });
    await seedScore(prisma, {
      playerId: bob.id,
      challenge,
      score: 300,
      achievedAt: new Date(now - 120_000)
    });
    await seedScore(prisma, {
      playerId: carol.id,
      challenge,
      score: 300,
      achievedAt: new Date(now - 180_000)
    });

    const { LeaderboardService } =
      await import('../../src/modules/leaderboards/leaderboard.service');
    const { RedisService } = await import('../../src/redis/redis.module');
    service = api.app.get(LeaderboardService);
    redis = api.app.get(RedisService);
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('reconstruit le ZSET global à l’identique du temps réel', async () => {
    await service.rebuildAll();
    const key = leaderboardKey('global', GLOBAL_SCOPE_ID);
    const first = await redis.client.zrevrange(key, 0, -1, 'WITHSCORES');

    await service.rebuildAll();
    const second = await redis.client.zrevrange(key, 0, -1, 'WITHSCORES');

    expect(second).toEqual(first);
    expect(first).toHaveLength(6); // 3 membres × (membre, score)

    // Ordre décodé : carol (300, plus ancienne) puis bob (300) puis alice.
    const members = first.filter((_, index) => index % 2 === 0);
    expect(members).toEqual([expect.any(String), expect.any(String), expect.any(String)]);
    const scores = first.filter((_, index) => index % 2 === 1).map(Number);
    expect(scores[0]).toBeGreaterThan(scores[1]!);
    expect(scores[1]).toBeGreaterThan(scores[2]!);
  });

  it('répare un ZSET corrompu et vérifie l’identité avec PostgreSQL', async () => {
    await service.rebuildAll();
    const key = leaderboardKey('global', GLOBAL_SCOPE_ID);
    const snapshot = await redis.client.zrevrange(key, 0, -1, 'WITHSCORES');

    await redis.client.zadd(key, 1, 'fantome');

    const report = await service.rebuildAll();

    expect(report.mismatches).toBe(0);
    expect(await redis.client.zrevrange(key, 0, -1, 'WITHSCORES')).toEqual(snapshot);
    expect(await redis.client.zscore(key, 'fantome')).toBeNull();
  });

  it('reconstruit un ZSET absent depuis `best_scores`', async () => {
    const key = leaderboardKey('global', GLOBAL_SCOPE_ID);
    await service.rebuildAll();
    const expected = await redis.client.zrevrange(key, 0, -1, 'WITHSCORES');

    await redis.client.del(key);
    await service.rebuildAll();

    expect(await redis.client.zrevrange(key, 0, -1, 'WITHSCORES')).toEqual(expected);
  });

  it('conserve le miroir durable `leaderboard_entries` cohérent avec le ZSET', async () => {
    await service.rebuildAll();

    const entries = await prisma.leaderboardEntry.findMany({
      where: { scopeType: 'global', scopeId: GLOBAL_SCOPE_ID, subjectType: 'player' },
      orderBy: [{ score: 'desc' }, { tiebreakAt: 'asc' }]
    });

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(entries[0]!.score.toNumber()).toBe(300);

    const verification = await service.verifyIdentity();
    expect(verification.mismatches).toBe(0);
  });
});
