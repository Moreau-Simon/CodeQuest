import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import {
  seedChallenge,
  seedPlayer,
  seedScore,
  seedTheme,
  type SeedChallenge
} from '../helpers/leaderboard';

interface LeaderboardResponse {
  scope: string;
  scopeId: string | null;
  period: string;
  items: Array<{
    rank: number;
    subjectId: string;
    displayName: string;
    score: number;
    achievedAt: string;
  }>;
  nextCursor: string | null;
}

/**
 * T091 — classement des joueurs : ordre décroissant, départage par la
 * soumission retenue la plus ancienne, filtres de portée et de période,
 * pagination par curseur.
 *
 * Écrit avant l'implémentation (TDD).
 */
describe('classements — ordre, départage et filtres (T091)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let themeA: { id: string; slug: string };
  let themeB: { id: string; slug: string };
  let challengeA: SeedChallenge;
  let challengeB: SeedChallenge;
  let seasonId: string;

  const players: Record<string, string> = {};

  const now = Date.now();
  const minutesAgo = (minutes: number): Date => new Date(now - minutes * 60_000);

  async function createUser(pseudonym: string): Promise<string> {
    const player = await seedPlayer(prisma, pseudonym);
    players[pseudonym] = player.id;
    return player.id;
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    themeA = await seedTheme(prisma, 'tri');
    themeB = await seedTheme(prisma, 'crypto');
    challengeA = await seedChallenge(prisma, themeA.id, 'Tri A');
    challengeB = await seedChallenge(prisma, themeB.id, 'Crypto B');

    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const carol = await createUser('carol');
    const dave = await createUser('dave');
    const old = await createUser('ancien');

    // Deux scores pour alice et carol : le total doit être additionné et le
    // départage utiliser la plus ancienne soumission retenue.
    await seedScore(prisma, {
      playerId: alice,
      challenge: challengeA,
      score: 300,
      achievedAt: minutesAgo(10)
    });
    await seedScore(prisma, {
      playerId: alice,
      challenge: challengeB,
      score: 50,
      achievedAt: minutesAgo(20)
    });

    await seedScore(prisma, {
      playerId: bob,
      challenge: challengeA,
      score: 300,
      achievedAt: minutesAgo(30)
    });

    await seedScore(prisma, {
      playerId: carol,
      challenge: challengeA,
      score: 200,
      achievedAt: minutesAgo(40)
    });
    await seedScore(prisma, {
      playerId: carol,
      challenge: challengeB,
      score: 100,
      achievedAt: minutesAgo(50)
    });

    await seedScore(prisma, {
      playerId: dave,
      challenge: challengeA,
      score: 100,
      achievedAt: minutesAgo(60)
    });

    // Hors des fenêtres semaine / mois / saison.
    await seedScore(prisma, {
      playerId: old,
      challenge: challengeA,
      score: 500,
      achievedAt: new Date(now - 40 * 24 * 60 * 60_000)
    });

    seasonId = crypto.randomUUID();
    await prisma.season.create({
      data: {
        id: seasonId,
        name: 'Saison de test',
        slug: 'saison-test',
        startsAt: new Date(now - 3 * 24 * 60 * 60_000),
        endsAt: new Date(now + 27 * 24 * 60 * 60_000)
      }
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

  async function fetchPlayers(query: string): Promise<LeaderboardResponse> {
    const response = await api.anonymous.get(`/api/v1/leaderboards/players?${query}`);
    expect(response.status).toBe(200);
    return response.body as LeaderboardResponse;
  }

  it('classe par score décroissant et départage par la soumission la plus ancienne', async () => {
    const body = await fetchPlayers('scope=global&period=all');

    expect(body.items.map((item) => item.displayName)).toEqual([
      'ancien',
      'alice',
      'carol',
      'bob',
      'dave'
    ]);
    expect(body.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(body.items[0]).toMatchObject({ score: 500 });
    expect(body.items[1]).toMatchObject({ score: 350 });
  });

  it('départage deux scores égaux par la plus ancienne soumission retenue', async () => {
    const body = await fetchPlayers(`scope=theme&scopeId=${themeA.id}&period=all`);

    // bob (300, il y a 30 min) passe devant alice (300, il y a 10 min).
    expect(body.items.map((item) => item.displayName)).toEqual([
      'ancien',
      'bob',
      'alice',
      'carol',
      'dave'
    ]);
    expect(body.items[1]?.score).toBe(body.items[2]?.score);
    expect(new Date(body.items[1]!.achievedAt).getTime()).toBeLessThan(
      new Date(body.items[2]!.achievedAt).getTime()
    );
  });

  it('filtre par thématique', async () => {
    const body = await fetchPlayers(`scope=theme&scopeId=${themeB.id}&period=all`);

    expect(body.items.map((item) => item.displayName)).toEqual(['carol', 'alice']);
    expect(body.items.map((item) => item.score)).toEqual([100, 50]);
  });

  it('filtre par période semaine et exclut les scores trop anciens', async () => {
    const body = await fetchPlayers('scope=global&period=week');

    expect(body.items.map((item) => item.displayName)).toEqual(['alice', 'carol', 'bob', 'dave']);
  });

  it('filtre par période mois et exclut les scores trop anciens', async () => {
    const body = await fetchPlayers('scope=global&period=month');

    expect(body.items.map((item) => item.displayName)).not.toContain('ancien');
    expect(body.items[0]?.displayName).toBe('alice');
  });

  it('filtre par saison (portée et période)', async () => {
    const byScope = await fetchPlayers(`scope=season&scopeId=${seasonId}&period=all`);
    const byPeriod = await fetchPlayers('scope=global&period=season');

    expect(byScope.items.map((item) => item.displayName)).toEqual([
      'alice',
      'carol',
      'bob',
      'dave'
    ]);
    expect(byPeriod.items.map((item) => item.displayName)).toEqual([
      'alice',
      'carol',
      'bob',
      'dave'
    ]);
  });

  it('pagine par curseur sans doublon ni trou', async () => {
    const first = await fetchPlayers('scope=global&period=all&limit=2');
    expect(first.items.map((item) => item.displayName)).toEqual(['ancien', 'alice']);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await fetchPlayers(
      `scope=global&period=all&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`
    );
    expect(second.items.map((item) => item.displayName)).toEqual(['carol', 'bob']);
    expect(second.items.map((item) => item.rank)).toEqual([3, 4]);
    expect(second.nextCursor).toEqual(expect.any(String));
  });

  it('refuse une portée sans identifiant avec 400', async () => {
    const response = await api.anonymous.get('/api/v1/leaderboards/players?scope=theme');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'INVALID_SCOPE' });
  });
});
