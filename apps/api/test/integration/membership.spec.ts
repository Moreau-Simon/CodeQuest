import { PrismaClient } from '@prisma/client';
import type { MembershipService } from '../../src/modules/teams/membership.service';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedScore, seedTheme, type SeedChallenge } from '../helpers/leaderboard';
import { createInvitation, createTeam, createTestPlayer } from '../helpers/teams';

/**
 * T158 [P] [US8] Conservation des scores au départ d'un membre (FR-060) :
 * les scores déjà acquis restent intacts, mais l'ancien membre ne peut plus
 * contribuer à un défi au titre de l'équipe.
 *
 * Écrit avant l'implémentation (constitution IV).
 */
describe('membership — scores conservés et contribution révoquée (T158)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let captain: Awaited<ReturnType<typeof createTestPlayer>>;
  let member: Awaited<ReturnType<typeof createTestPlayer>>;
  let outsider: Awaited<ReturnType<typeof createTestPlayer>>;
  let teamId: string;
  let challengeId: string;
  let challenge: SeedChallenge;
  let membership: MembershipService;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    const { MembershipService } = await import('../../src/modules/teams/membership.service');
    membership = api.app.get(MembershipService);

    captain = await createTestPlayer(api, prisma, 'capitaine-membership');
    member = await createTestPlayer(api, prisma, 'membre-membership');
    outsider = await createTestPlayer(api, prisma, 'outsider-membership');

    teamId = (await createTeam(captain.agent, 'Les Conservés', 'CONS')).id;
    const token = await createInvitation(captain.agent, teamId, member.pseudonym);
    const joined = await member.agent
      .post(`/api/v1/teams/${teamId}/members`)
      .send({ token });
    expect(joined.status).toBe(201);

    const theme = await seedTheme(prisma, 'membership-us8');
    challenge = await seedChallenge(prisma, theme.id, 'Défi conservé');
    challengeId = challenge.id;
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await api.close();
    await infra.stop();
  });

  it('conserve les scores individuels et d’équipe après le départ du membre', async () => {
    const submissionId = await seedScore(prisma, {
      playerId: member.id,
      challenge,
      score: 240,
      achievedAt: new Date(),
      teamId
    });
    await prisma.bestScore.create({
      data: {
        id: submissionId,
        challengeId,
        subjectType: 'team',
        subjectId: teamId,
        score: '240.00',
        submissionId,
        achievedAt: new Date()
      }
    });

    const before = await prisma.bestScore.findMany({
      where: { challengeId, subjectId: { in: [member.id, teamId] } },
      select: { subjectType: true, score: true }
    });
    expect(before).toHaveLength(2);

    const left = await member.agent.delete(`/api/v1/teams/${teamId}/members/${member.id}`);
    expect(left.status).toBe(204);

    const after = await prisma.bestScore.findMany({
      where: { challengeId, subjectId: { in: [member.id, teamId] } },
      select: { subjectType: true, score: true }
    });
    expect(after).toEqual(before);

    const retained = await membership.retainedScores(teamId, member.id);
    expect(retained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectType: 'team', subjectId: teamId, score: 240 })
      ])
    );
    expect(retained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectType: 'player', subjectId: member.id, score: 240 })
      ])
    );
  });

  it('refuse une soumission au titre de l’équipe pour un ancien membre', async () => {
    const submission = await member.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'def solve(x): return x', teamId });
    expect(submission.status).toBe(403);
    expect(submission.body.code).toBe('NOT_TEAM_MEMBER');
  });

  it('refuse une soumission au titre d’une équipe dont le joueur n’a jamais fait partie', async () => {
    const submission = await outsider.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'def solve(x): return x', teamId });
    expect(submission.status).toBe(403);
    expect(submission.body.code).toBe('NOT_TEAM_MEMBER');
  });
});
