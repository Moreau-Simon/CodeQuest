import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { contractValidator } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedPlayer, seedScore, seedTheme } from '../helpers/leaderboard';

/**
 * T093 — contrat des classements : `/leaderboards/players`, `/teams` et
 * `/events/{eventId}` conformes à `contracts/openapi.yaml`.
 *
 * Écrit avant l'implémentation (TDD).
 */
describe('contrat /leaderboards/* (T093)', () => {
  const validator = contractValidator();
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let teamId: string;
  let eventId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    const theme = await seedTheme(prisma, 'contrat-classement');
    const challenge = await seedChallenge(prisma, theme.id);

    const alice = await seedPlayer(prisma, 'alice-contract');
    const bob = await seedPlayer(prisma, 'bob-contract');

    const now = Date.now();
    await seedScore(prisma, {
      playerId: alice.id,
      challenge,
      score: 300,
      achievedAt: new Date(now - 120_000)
    });
    await seedScore(prisma, {
      playerId: bob.id,
      challenge,
      score: 200,
      achievedAt: new Date(now - 60_000)
    });

    teamId = uuidv7();
    const teamSubmission = await prisma.submission.create({
      data: {
        id: uuidv7(),
        challengeId: challenge.id,
        challengeVersionId: challenge.versionId,
        userId: alice.id,
        teamId,
        language: 'python',
        code: 'def solve(x): return sorted(x)',
        status: 'passed',
        cpuTimesMs: [100],
        cpuTimeMedianMs: 100,
        testsPassed: 1,
        testsTotal: 1,
        score: '250.00',
        createdAt: new Date(now - 90_000),
        finishedAt: new Date(now - 90_000)
      }
    });
    await prisma.bestScore.create({
      data: {
        id: uuidv7(),
        challengeId: challenge.id,
        subjectType: 'team',
        subjectId: teamId,
        score: '250.00',
        submissionId: teamSubmission.id,
        achievedAt: new Date(now - 90_000)
      }
    });

    eventId = uuidv7();
    await seedScore(prisma, {
      playerId: bob.id,
      challenge,
      score: 180,
      achievedAt: new Date(now - 30_000),
      eventId
    });

    const { LeaderboardService } =
      await import('../../src/modules/leaderboards/leaderboard.service');
    await api.app.get(LeaderboardService).rebuildAll();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  function expectContract(
    operation: { method: 'get'; path: string },
    status: number,
    body: unknown
  ): void {
    const result = validator.validateResponse(operation, status, body);
    if (!result.valid) throw new Error(result.errors.join('\n'));
  }

  it('renvoie le classement des joueurs conforme au contrat', async () => {
    const response = await api.anonymous.get('/api/v1/leaderboards/players?scope=global');
    expect(response.status).toBe(200);
    expectContract({ method: 'get', path: '/leaderboards/players' }, 200, response.body);

    const items = (response.body as { items: unknown[] }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(validator.validateNamedSchema('LeaderboardEntry', item).valid).toBe(true);
    }
  });

  it('renvoie le classement des équipes conforme au contrat', async () => {
    const response = await api.anonymous.get('/api/v1/leaderboards/teams');
    expect(response.status).toBe(200);
    expectContract({ method: 'get', path: '/leaderboards/teams' }, 200, response.body);

    const items = (response.body as { items: Array<{ subjectId: string; score: number }> }).items;
    expect(items).toEqual(
      expect.arrayContaining([expect.objectContaining({ subjectId: teamId, score: 250 })])
    );
  });

  it('renvoie le classement d’un événement conforme au contrat', async () => {
    const response = await api.anonymous.get(`/api/v1/leaderboards/events/${eventId}`);
    expect(response.status).toBe(200);
    expectContract({ method: 'get', path: '/leaderboards/events/{eventId}' }, 200, response.body);

    const items = (response.body as { items: Array<{ displayName: string; score: number }> }).items;
    expect(items).toEqual([expect.objectContaining({ displayName: 'bob-contract', score: 180 })]);
  });

  it('renvoie une enveloppe d’erreur conforme sur une portée invalide', async () => {
    const response = await api.anonymous.get('/api/v1/leaderboards/players?scope=inconnue');
    expect(response.status).toBe(400);
    const result = validator.validateNamedSchema('Error', response.body);
    if (!result.valid) throw new Error(result.errors.join('\n'));
  });
});
