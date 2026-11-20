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
import {
  createInvitation,
  createTeam,
  createTestPlayer,
  type TeamView,
  type TestPlayer
} from '../helpers/teams';

interface LeaderboardResponse {
  items: Array<{ rank: number; subjectId: string; displayName: string; score: number }>;
}

interface OfficialSubmissionView {
  id: string;
  teamId: string;
  challengeId: string;
  submissionId: string;
  score: number;
  designatedBy: string;
  designatedAt: string;
}

/**
 * T150 [P] [US8] Soumission officielle unique (FR-046, FR-058, FR-060, SC-009) :
 * seul le dernier résultat désigné par le capitaine compte, sans agrégation ni
 * moyenne des scores individuels ; le classement d'équipe est réécrit à la
 * désignation, au remplacement et à la révocation. Écrit avant l'implémentation (TDD).
 */
describe('soumission officielle d’équipe (T150)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let captain: TestPlayer;
  let memberA: TestPlayer;
  let memberB: TestPlayer;
  let team: TeamView;
  let challenge: SeedChallenge;

  let submissionA: string;
  let submissionB: string;
  let submissionReplacement: string;
  const achievedA = new Date('2026-11-20T10:00:00.000Z');
  const achievedB = new Date('2026-11-20T10:05:00.000Z');
  const achievedReplacement = new Date('2026-11-20T10:10:00.000Z');

  async function teamLeaderboard(): Promise<LeaderboardResponse> {
    const response = await api.anonymous.get('/api/v1/leaderboards/teams?period=all');
    expect(response.status).toBe(200);
    return response.body as LeaderboardResponse;
  }

  async function playerLeaderboard(): Promise<LeaderboardResponse> {
    const response = await api.anonymous.get('/api/v1/leaderboards/players?period=all');
    expect(response.status).toBe(200);
    return response.body as LeaderboardResponse;
  }

  async function designate(submissionId: string) {
    return captain.agent.post(`/api/v1/teams/${team.id}/official-submission`).send({
      challengeId: challenge.id,
      submissionId
    });
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    captain = await createTestPlayer(api, prisma, 'capitaine-officiel');
    memberA = await createTestPlayer(api, prisma, 'membre-officiel-a');
    memberB = await createTestPlayer(api, prisma, 'membre-officiel-b');
    await createTestPlayer(api, prisma, 'outsider-officiel');

    team = await createTeam(captain.agent, 'Les Officiels', 'OFF');

    // Les auteurs des soumissions doivent être membres de l'équipe : le
    // service refuse une désignation faite sur une soumission externe.
    for (const member of [memberA, memberB]) {
      const token = await createInvitation(captain.agent, team.id, member.pseudonym);
      const joined = await member.agent.post(`/api/v1/teams/${team.id}/members`).send({ token });
      expect(joined.status).toBe(201);
    }

    const theme = await seedTheme(prisma, 'officiel-us8');
    challenge = await seedChallenge(prisma, theme.id, 'Tri officiel');

    submissionA = await seedScore(prisma, {
      playerId: memberA.id,
      challenge,
      score: 100,
      achievedAt: achievedA,
      teamId: team.id
    });
    submissionB = await seedScore(prisma, {
      playerId: memberB.id,
      challenge,
      score: 200,
      achievedAt: achievedB,
      teamId: team.id
    });
    submissionReplacement = await seedScore(prisma, {
      playerId: memberB.id,
      challenge,
      score: 300,
      achievedAt: achievedReplacement,
      teamId: team.id
    });

    // Un score individuel « fantôme » d'un joueur hors équipe sert de repère :
    // le classement d'équipe ne doit jamais l'inclure.
    const outsider = await seedPlayer(prisma, 'outsider-score');
    await seedScore(prisma, {
      playerId: outsider.id,
      challenge,
      score: 999,
      achievedAt: achievedA
    });

    const { LeaderboardService } = await import('../../src/modules/leaderboards/leaderboard.service');
    await api.app.get(LeaderboardService).rebuildAll();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('refuse la désignation à un membre qui n’est pas capitaine', async () => {
    const response = await memberA.agent.post(`/api/v1/teams/${team.id}/official-submission`).send({
      challengeId: challenge.id,
      submissionId: submissionA
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('NOT_CAPTAIN');
  });

  it('ne retient que la soumission désignée, sans additionner les scores des membres', async () => {
    const response = await designate(submissionA);
    expect(response.status).toBe(200);
    const official = response.body as OfficialSubmissionView;
    expect(official).toMatchObject({
      teamId: team.id,
      challengeId: challenge.id,
      submissionId: submissionA,
      score: 100,
      designatedBy: captain.id
    });

    const teams = await teamLeaderboard();
    const entry = teams.items.find((item) => item.subjectId === team.id);
    expect(entry).toBeDefined();
    expect(entry!.score).toBe(100); // pas 100 + 200, ni 300
    expect(entry!.displayName).toMatch(/^Équipe /);

    const players = await playerLeaderboard();
    expect(players.items.find((item) => item.subjectId === memberA.id)?.score).toBe(100);
    expect(players.items.find((item) => item.subjectId === memberB.id)?.score).toBe(300);

    const designated = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionA },
      select: { isOfficial: true }
    });
    expect(designated.isOfficial).toBe(true);
  });

  it('remplace la désignation et réécrit le classement d’équipe', async () => {
    const response = await designate(submissionReplacement);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      submissionId: submissionReplacement,
      score: 300
    });

    const entry = (await teamLeaderboard()).items.find((item) => item.subjectId === team.id);
    expect(entry?.score).toBe(300); // le dernier désigné gagne

    const [old, current] = await Promise.all([
      prisma.submission.findUniqueOrThrow({
        where: { id: submissionA },
        select: { isOfficial: true }
      }),
      prisma.submission.findUniqueOrThrow({
        where: { id: submissionReplacement },
        select: { isOfficial: true }
      })
    ]);
    expect(old.isOfficial).toBe(false);
    expect(current.isOfficial).toBe(true);

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM team_official_submissions
      WHERE team_id = ${team.id}::uuid AND challenge_id = ${challenge.id}::uuid
    `;
    expect(Number(rows[0]!.count)).toBe(1);
    expect(submissionB).not.toBe(submissionReplacement);
  });

  it('révoque la désignation sans toucher aux scores individuels', async () => {
    const response = await captain.agent.delete(
      `/api/v1/teams/${team.id}/official-submission/${challenge.id}`
    );
    expect(response.status).toBe(204);

    expect((await teamLeaderboard()).items.some((item) => item.subjectId === team.id)).toBe(false);
    expect((await playerLeaderboard()).items.find((item) => item.subjectId === memberB.id)?.score).toBe(
      300
    );
  });

  it('conserve le score de l’équipe après le départ du membre désigné', async () => {
    const restored = await designate(submissionReplacement);
    expect(restored.status).toBe(200);

    const left = await memberB.agent.delete(`/api/v1/teams/${team.id}/members/${memberB.id}`);
    expect(left.status).toBe(204);

    const entry = (await teamLeaderboard()).items.find((item) => item.subjectId === team.id);
    expect(entry?.score).toBe(300);
    expect((await playerLeaderboard()).items.find((item) => item.subjectId === memberB.id)?.score).toBe(
      300
    );
  });
});
