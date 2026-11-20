import { PrismaClient } from '@prisma/client';
import type { ContributionService } from '../../src/modules/teams/contribution.service';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createInvitation, createTeam, createTestPlayer } from '../helpers/teams';

/**
 * T159 [P] [US8] Score de contribution individuelle (FR-059) : lignes conservées,
 * réussites et assistance, agrégées avec un coefficient réduit de 0,5, sans
 * écraser le meilleur score individuel du classement des joueurs.
 *
 * Écrit avant l'implémentation (constitution IV).
 */
describe('contribution — score individuel à coefficient réduit (T159)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let captain: Awaited<ReturnType<typeof createTestPlayer>>;
  let member: Awaited<ReturnType<typeof createTestPlayer>>;
  let teamId: string;
  let challengeId: string;
  let contribution: ContributionService;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    const { ContributionService } = await import('../../src/modules/teams/contribution.service');
    contribution = api.app.get(ContributionService);

    // `RegisterDto.pseudonym` plafonne à 20 caractères : au-delà, l'inscription
    // est refusée (400) et aucun e-mail de confirmation n'est mis en file.
    captain = await createTestPlayer(api, prisma, 'capitaine-contrib');
    member = await createTestPlayer(api, prisma, 'membre-contrib');
    teamId = (await createTeam(captain.agent, 'Les Contributeurs', 'TRIB')).id;
    const token = await createInvitation(captain.agent, teamId, member.pseudonym);
    const joined = await member.agent.post(`/api/v1/teams/${teamId}/members`).send({ token });
    expect(joined.status).toBe(201);

    const theme = await seedTheme(prisma, 'contribution-us8');
    challengeId = (await seedChallenge(prisma, theme.id, 'Défi de contribution')).id;
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await api.close();
    await infra.stop();
  });

  it('agrège les événements et applique le coefficient réduit de 0,5', async () => {
    await contribution.record({ teamId, challengeId, userId: member.id, kind: 'kept_line', weight: 2 });
    await contribution.record({ teamId, challengeId, userId: member.id, kind: 'success', weight: 1 });
    await contribution.record({ teamId, challengeId, userId: member.id, kind: 'assistance', weight: 1 });

    // (2 lignes × 1) + (1 réussite × 10) + (1 assistance × 2) = 14 → 14 × 0,5 = 7
    const score = await contribution.scoreFor(teamId, member.id);
    expect(score).toMatchObject({
      teamId,
      userId: member.id,
      keptLines: 2,
      successes: 1,
      assistance: 1,
      coefficient: 0.5,
      score: 7
    });

    const persisted = await prisma.contributionScore.findUniqueOrThrow({
      where: { teamId_userId: { teamId, userId: member.id } }
    });
    expect(persisted.score).toBe(7);
    expect(Number(persisted.coefficient)).toBe(0.5);
  });

  it('calcule séparément la contribution de chaque membre', async () => {
    await contribution.record({ teamId, challengeId, userId: captain.id, kind: 'success', weight: 1 });

    const captainScore = await contribution.scoreFor(teamId, captain.id);
    expect(captainScore).toMatchObject({ successes: 1, score: 5 });

    const board = await contribution.leaderboard(teamId);
    expect(board).toHaveLength(2);
    expect(board.find((row) => row.userId === member.id)?.score).toBe(7);
    expect(board.find((row) => row.userId === captain.id)?.score).toBe(5);
  });

  it('expose le classement de contribution via GET /teams/:teamId/contributions', async () => {
    const response = await api.anonymous.get(`/api/v1/teams/${teamId}/contributions`);
    expect(response.status).toBe(200);
    const rows = response.body as Array<{ userId: string; score: number }>;
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ userId: member.id, score: 7 })]));
  });

  it('ne modifie pas le meilleur score individuel du classement des joueurs', async () => {
    const best = await prisma.bestScore.findFirst({
      where: { challengeId, subjectType: 'player', subjectId: member.id }
    });
    expect(best).toBeNull();
    const contribution = await prisma.contributionScore.findUniqueOrThrow({
      where: { teamId_userId: { teamId, userId: member.id } }
    });
    expect(contribution.score).toBe(7);
  });
});
