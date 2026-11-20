import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';
import type { YjsProvider } from '../../src/realtime/yjs.provider';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createInvitation, createTeam, createTestPlayer } from '../helpers/teams';

/**
 * T151 [P] [US8] Convergence Yjs (FR-057) : deux clients appliquent des deltas
 * concurrents, convergent vers le même état, et l'état est persisté en
 * PostgreSQL après flush. Un joueur hors équipe est refusé.
 *
 * Écrit avant l'implémentation (constitution IV).
 */
describe('Yjs — convergence, persistance et autorisation (T151)', () => {
  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let provider: YjsProvider;
  let captain: Awaited<ReturnType<typeof createTestPlayer>>;
  let member: Awaited<ReturnType<typeof createTestPlayer>>;
  let outsider: Awaited<ReturnType<typeof createTestPlayer>>;
  let teamId: string;
  let challengeId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    const { YjsProvider } = await import('../../src/realtime/yjs.provider');
    provider = api.app.get(YjsProvider);

    captain = await createTestPlayer(api, prisma, 'capitaine-yjs');
    member = await createTestPlayer(api, prisma, 'membre-yjs');
    outsider = await createTestPlayer(api, prisma, 'outsider-yjs');
    teamId = (await createTeam(captain.agent, 'Les Scripteurs', 'SCRIPT')).id;
    const token = await createInvitation(captain.agent, teamId, member.pseudonym);
    const joined = await member.agent.post(`/api/v1/teams/${teamId}/members`).send({ token });
    expect(joined.status).toBe(201);

    const theme = await seedTheme(prisma, 'yjs-us8');
    challengeId = (await seedChallenge(prisma, theme.id, 'Édition concurrente')).id;
  }, 180_000);

  afterAll(async () => {
    await provider.flushAll();
    await prisma.$disconnect();
    await api.close();
    await infra.stop();
  });

  it('fait converger deux deltas concurrents et persiste l’état après flush', async () => {
    const clientA = new Y.Doc();
    const clientB = new Y.Doc();
    clientA.getText('code').insert(0, 'ab');
    clientB.getText('code').insert(0, 'XY');

    const updateA = Buffer.from(Y.encodeStateAsUpdate(clientA)).toString('base64');
    const updateB = Buffer.from(Y.encodeStateAsUpdate(clientB)).toString('base64');

    const first = await provider.applyUpdate(teamId, challengeId, captain.id, updateA);
    const second = await provider.applyUpdate(teamId, challengeId, member.id, updateB);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.version).toBeGreaterThan(first.version);

    Y.applyUpdate(clientA, Buffer.from(second.update, 'base64'));
    Y.applyUpdate(clientB, Buffer.from(first.update, 'base64'));
    expect(clientA.getText('code').toString()).toBe(clientB.getText('code').toString());

    const flushed = await provider.flushAll();
    expect(flushed).toBeGreaterThanOrEqual(1);

    const snapshot = await provider.snapshot(teamId, challengeId);
    expect(snapshot).not.toBeNull();
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Buffer.from(snapshot!.state, 'base64'));
    expect(restored.getText('code').toString()).toBe(clientA.getText('code').toString());

    const row = await prisma.collaborativeDocument.findUniqueOrThrow({
      where: { teamId_challengeId: { teamId, challengeId } }
    });
    expect(row.version).toBeGreaterThanOrEqual(2);
    expect(row.state.length).toBeGreaterThan(0);
  });

  it('publie la présence des curseurs dans la room du document', async () => {
    const presence = provider.setAwareness(teamId, challengeId, captain.id, { line: 12, ch: 4 });
    expect(presence.clients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: captain.id, cursor: { line: 12, ch: 4 } })
      ])
    );
  });

  it('refuse une mise à jour d’un joueur qui n’est pas membre de l’équipe', async () => {
    const doc = new Y.Doc();
    doc.getText('code').insert(0, 'hors équipe');
    const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    await expect(
      provider.applyUpdate(teamId, challengeId, outsider.id, update)
    ).rejects.toMatchObject({ code: 'NOT_TEAM_MEMBER' });
  });

  it('refuse une mise à jour qui dépasse la taille maximale du document', async () => {
    const oversized = Buffer.from('A'.repeat(70 * 1024)).toString('base64');
    await expect(
      provider.applyUpdate(teamId, challengeId, captain.id, oversized)
    ).rejects.toMatchObject({ code: 'DOC_TOO_LARGE' });
  });
});
