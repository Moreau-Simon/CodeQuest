import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import {
  createInvitation,
  createTeam,
  createTestPlayer,
  type TeamView,
  type TestPlayer
} from '../helpers/teams';

/**
 * T149 [P] [US8] Équipes : taille 2–5, un seul engagement actif par joueur,
 * invitations nominatives ou par lien, départ et transfert de capitainerie (FR-055, FR-056).
 *
 * Écrit avant l'implémentation (TDD). Les comptes sont créés par le vrai
 * parcours d'inscription afin d'exercer les guards RBAC et les cookies.
 */
describe('équipes — taille, engagement unique et capitainerie (T149)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let players: TestPlayer[];

  let teamA: TeamView;
  let teamB: TeamView;

  async function refresh(teamId: string): Promise<TeamView> {
    const response = await api.anonymous.get(`/api/v1/teams/${teamId}`);
    expect(response.status).toBe(200);
    return response.body as TeamView;
  }

  async function join(teamId: string, token: string, player: TestPlayer): Promise<void> {
    const response = await player.agent.post(`/api/v1/teams/${teamId}/members`).send({ token });
    expect(response.status).toBe(201);
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    players = [];
    for (const pseudonym of [
      'capitaine',
      'deuxieme',
      'troisieme',
      'quatrieme',
      'cinquieme',
      'sixieme',
      'septieme'
    ]) {
      players.push(await createTestPlayer(api, prisma, pseudonym));
    }

    teamA = await createTeam(players[0]!.agent, 'Les Trieurs', 'TRI');
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('crée une équipe avec le créateur comme capitaine et refuse nom/tag dupliqués', async () => {
    expect(teamA).toMatchObject({ name: 'Les Trieurs', tag: 'TRI', disbandedAt: null });
    expect(teamA.captainId).toBe(players[0]!.id);
    expect(teamA.members).toHaveLength(1);
    expect(teamA.members[0]).toMatchObject({
      userId: players[0]!.id,
      pseudonym: 'capitaine',
      role: 'captain'
    });

    const sameName = await players[6]!.agent
      .post('/api/v1/teams')
      .send({ name: 'Les Trieurs', tag: 'AUT' });
    expect(sameName.status).toBe(409);
    expect(sameName.body.code).toBe('TEAM_NAME_TAKEN');

    const sameTag = await players[6]!.agent
      .post('/api/v1/teams')
      .send({ name: 'Les Débogueurs', tag: 'TRI' });
    expect(sameTag.status).toBe(409);
    expect(sameTag.body.code).toBe('TEAM_TAG_TAKEN');
  });

  it('invite par pseudonyme ou par lien et refuse un second engagement actif', async () => {
    const token = await createInvitation(players[0]!.agent, teamA.id, players[1]!.pseudonym);
    await join(teamA.id, token, players[1]!);

    let current = await refresh(teamA.id);
    expect(current.members).toHaveLength(2);
    expect(current.members.find((m) => m.userId === players[1]!.id)).toMatchObject({
      role: 'member'
    });

    teamB = await createTeam(players[5]!.agent, 'Les Débogueurs', 'DBG');
    const rivalToken = await createInvitation(
      players[5]!.agent,
      teamB.id,
      players[1]!.pseudonym
    );
    const refused = await players[1]!.agent
      .post(`/api/v1/teams/${teamB.id}/members`)
      .send({ token: rivalToken });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('ALREADY_IN_TEAM');

    // Un lien sans destinataire peut être accepté par n'importe quel joueur libre.
    const linkToken = await createInvitation(players[0]!.agent, teamA.id);
    await join(teamA.id, linkToken, players[2]!);
    current = await refresh(teamA.id);
    expect(current.members).toHaveLength(3);
  });

  it('limite l’équipe à 5 membres actifs et affiche la limite', async () => {
    for (const player of [players[3]!, players[4]!]) {
      const token = await createInvitation(players[0]!.agent, teamA.id, player.pseudonym);
      await join(teamA.id, token, player);
    }
    expect((await refresh(teamA.id)).members).toHaveLength(5);

    const token = await createInvitation(players[0]!.agent, teamA.id, players[6]!.pseudonym);
    const full = await players[6]!.agent.post(`/api/v1/teams/${teamA.id}/members`).send({ token });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('TEAM_FULL');
    expect(full.body.details).toMatchObject({ limit: 5 });
  });

  it('transfère la capitainerie au départ du capitaine puis explicitement', async () => {
    const left = await players[0]!.agent.delete(
      `/api/v1/teams/${teamA.id}/members/${players[0]!.id}`
    );
    expect(left.status).toBe(204);

    // Le membre le plus ancien encore actif prend la capitainerie (FR-014).
    let current = await refresh(teamA.id);
    expect(current.captainId).toBe(players[1]!.id);
    expect(current.members).toHaveLength(4);
    expect(current.members.some((m) => m.userId === players[0]!.id)).toBe(false);

    // L'ancien capitaine peut s'engager ailleurs, la place s'est libérée.
    const teamBToken = await createInvitation(players[5]!.agent, teamB.id, players[0]!.pseudonym);
    await join(teamB.id, teamBToken, players[0]!);

    const stillAllowed = await players[1]!.agent
      .post(`/api/v1/teams/${teamA.id}/invitations`)
      .send({ pseudonym: players[6]!.pseudonym });
    expect(stillAllowed.status).toBe(201);

    const transferred = await players[1]!.agent
      .patch(`/api/v1/teams/${teamA.id}/captain`)
      .send({ userId: players[2]!.id });
    expect(transferred.status).toBe(200);
    expect((transferred.body as TeamView).captainId).toBe(players[2]!.id);

    const revoked = await players[1]!.agent
      .post(`/api/v1/teams/${teamA.id}/invitations`)
      .send({ pseudonym: players[6]!.pseudonym });
    expect(revoked.status).toBe(403);
    expect(revoked.body.code).toBe('NOT_CAPTAIN');

    const removed = await players[2]!.agent.delete(
      `/api/v1/teams/${teamA.id}/members/${players[1]!.id}`
    );
    expect(removed.status).toBe(204);
    current = await refresh(teamA.id);
    expect(current.members).toHaveLength(3);
    expect(current.captainId).toBe(players[2]!.id);
  });
});
