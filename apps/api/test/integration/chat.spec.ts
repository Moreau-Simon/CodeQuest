import { PrismaClient } from '@prisma/client';
import type { Socket } from 'socket.io-client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { seedChatFixture, type ChatFixture } from '../helpers/chat';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import {
  connectPlayer,
  expectEnvelope,
  listenOnce,
  waitForEvent
} from '../helpers/realtime-socket';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T226 [P] [US15] — écrit avant l'implémentation (constitution IV).
 *
 * Contrats : `websocket-events.md` §2/§3.4/§4 (rooms `channel:<id>`,
 * `chat.message`, `chat.deleted`, `chat.sanction`) et `data-model.md` §8
 * (anonymisation des messages à la suppression de compte).
 */
describe('Chat textuel et modération (T226)', () => {
  const NOW = new Date('2031-06-03T10:00:00.000Z');
  const PASSWORD = 'correct-horse-battery-staple';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let players: TestPlayer[];
  let fixture: ChatFixture;
  let port: number;
  let sockets: Socket[];
  let ModerationService: typeof import('../../src/modules/chat/moderation.service').ModerationService;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    port = await listenOnce(api);

    ModerationService = (await import('../../src/modules/chat/moderation.service'))
      .ModerationService;

    players = [
      await createTestPlayer(api, prisma, 'chat-mod'),
      await createTestPlayer(api, prisma, 'chat-author'),
      await createTestPlayer(api, prisma, 'chat-reporter'),
      await createTestPlayer(api, prisma, 'chat-outsider')
    ];
    const theme = await seedTheme(prisma, 'theme-chat');
    const challenge = await seedChallenge(prisma, theme.id, 'Défi chat');
    fixture = await seedChatFixture({
      prisma,
      slug: `chat-${uuidv7()}`,
      players,
      challengeId: challenge.id,
      now: NOW
    });

    const moderatorRole = await prisma.role.findUniqueOrThrow({ where: { key: 'moderator' } });
    await prisma.userRole.create({
      data: { userId: players[0]!.id, roleId: moderatorRole.id }
    });
  }, 180_000);

  afterAll(async () => {
    for (const socket of sockets ?? []) socket.disconnect();
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(() => {
    clock.set(NOW);
    sockets = [];
  });

  afterEach(async () => {
    for (const socket of sockets ?? []) socket.disconnect();
    await prisma.chatMessage.deleteMany({ where: { channelId: fixture.globalId } });
    await prisma.chatReport.deleteMany();
    await prisma.chatSanction.deleteMany();
    // Les entrées d'audit sont append-only : elles restent en base et sont
    // vérifiées par cible (identifiant de message unique par test).
  });

  async function connect(player: TestPlayer): Promise<Socket> {
    const socket = await connectPlayer(api, player, port);
    sockets.push(socket);
    return socket;
  }

  it('diffuse un message global en moins d’une seconde, de façon idempotente', async () => {
    const sender = await connect(players[0]!);
    const receiver = await connect(players[1]!);
    expect(await sender.emitWithAck('room.join', { room: `channel:${fixture.globalId}` })).toEqual({
      ok: true,
      room: `channel:${fixture.globalId}`
    });
    await receiver.emitWithAck('room.join', { room: `channel:${fixture.globalId}` });

    const payload = {
      channelId: fixture.globalId,
      body: 'Bonjour la communauté',
      clientMessageId: uuidv7()
    };
    const received = waitForEvent(receiver, 'chat.message');
    const sentAt = performance.now();
    const ack = (await sender.emitWithAck('chat.send', payload)) as {
      ok: boolean;
      messageId?: string;
    };
    expect(ack).toMatchObject({ ok: true, messageId: expect.any(String) });

    const data = expectEnvelope(await received, 'chat.message');
    expect(performance.now() - sentAt).toBeLessThan(1_000);
    expect(data).toMatchObject({
      channelId: fixture.globalId,
      messageId: ack.messageId,
      authorName: players[0]!.pseudonym,
      body: payload.body
    });

    const replay = (await sender.emitWithAck('chat.send', payload)) as {
      ok: boolean;
      messageId?: string;
    };
    expect(replay.messageId).toBe(ack.messageId);
    expect(await prisma.chatMessage.count({ where: { channelId: fixture.globalId } })).toBe(1);

    const history = await players[0]!.agent.get(`/api/v1/channels/${fixture.globalId}/messages`);
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0]).toMatchObject({ id: ack.messageId, body: payload.body });
  });

  it('refuse l’écriture dans un canal dont le compte n’est pas membre', async () => {
    const outsider = await connect(players[3]!);

    expect(await outsider.emitWithAck('room.join', { room: `channel:${fixture.teamId}` })).toEqual({
      ok: false,
      code: 'FORBIDDEN_ROOM'
    });
    expect(
      await outsider.emitWithAck('chat.send', {
        channelId: fixture.teamId,
        body: 'Intrus',
        clientMessageId: uuidv7()
      })
    ).toEqual({ ok: false, code: 'FORBIDDEN_ROOM' });
    expect(await prisma.chatMessage.count({ where: { channelId: fixture.teamId } })).toBe(0);

    // Un spectateur ne peut pas écrire dans le canal des participants.
    expect(
      await outsider.emitWithAck('chat.send', {
        channelId: fixture.eventId,
        body: 'Intrus',
        clientMessageId: uuidv7()
      })
    ).toEqual({ ok: false, code: 'FORBIDDEN_ROOM' });
  });

  it('ne liste que les canaux de l’audience du compte', async () => {
    const outsiderChannels = await players[3]!.agent.get('/api/v1/channels');
    expect(outsiderChannels.status).toBe(200);
    expect(outsiderChannels.body.map((channel: { id: string }) => channel.id)).toEqual([
      fixture.globalId
    ]);

    const spectatorChannels = await players[2]!.agent.get('/api/v1/channels');
    expect(spectatorChannels.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.globalId, canWrite: true }),
        expect.objectContaining({ id: fixture.spectatorId, canWrite: false })
      ])
    );
    expect(spectatorChannels.body.map((channel: { id: string }) => channel.id)).not.toContain(
      fixture.teamId
    );
  });

  it('autorise les spectateurs uniquement dans leur canal en lecture', async () => {
    const spectator = await connect(players[2]!);
    expect(
      await spectator.emitWithAck('room.join', { room: `channel:${fixture.spectatorId}` })
    ).toMatchObject({ ok: true });
    expect(
      await spectator.emitWithAck('chat.send', {
        channelId: fixture.spectatorId,
        body: 'Lecture seule',
        clientMessageId: uuidv7()
      })
    ).toEqual({ ok: false, code: 'FORBIDDEN_ROOM' });
  });

  it('refuse un signalement dont le canal ne correspond pas au message', async () => {
    const author = await connect(players[1]!);
    const sent = (await author.emitWithAck('chat.send', {
      channelId: fixture.globalId,
      body: 'Message global à signaler',
      clientMessageId: uuidv7()
    })) as { messageId: string };

    // Le reporter est membre de l'équipe : seul le couple (canal, message)
    // doit être refusé, pas l'accès au canal lui-même.
    const mismatch = await players[0]!
      .agent.post(`/api/v1/channels/${fixture.teamId}/messages/${sent.messageId}/reports`)
      .send({ reason: 'spam' });
    expect(mismatch.status).toBe(404);
    expect(await prisma.chatReport.count({ where: { messageId: sent.messageId } })).toBe(0);
  });

  it('signale un message, le supprime, mute l’auteur et journalise la sanction', async () => {
    const author = await connect(players[1]!);
    const moderator = await connect(players[0]!);
    await Promise.all([
      author.emitWithAck('room.join', { room: `channel:${fixture.globalId}` }),
      moderator.emitWithAck('room.join', { room: `channel:${fixture.globalId}` })
    ]);

    const sent = (await author.emitWithAck('chat.send', {
      channelId: fixture.globalId,
      body: 'Message abusif',
      clientMessageId: uuidv7()
    })) as { messageId: string };
    const reportResponse = await players[2]!
      .agent.post(`/api/v1/channels/${fixture.globalId}/messages/${sent.messageId}/reports`)
      .send({ reason: 'spam' });
    expect(reportResponse.status).toBe(201);

    const report = await prisma.chatReport.findFirstOrThrow({
      where: { messageId: sent.messageId }
    });
    expect(report).toMatchObject({ status: 'open', reason: 'spam' });

    const deleted = waitForEvent(moderator, 'chat.deleted');
    const sanctioned = waitForEvent(author, 'chat.sanction');
    await api.app.get(ModerationService).sanction({
      actorId: players[0]!.id,
      messageId: sent.messageId,
      reportId: report.id,
      kind: 'mute',
      reason: 'spam',
      durationMinutes: 10
    });

    expect(expectEnvelope(await deleted, 'chat.deleted')).toMatchObject({
      channelId: fixture.globalId,
      messageId: sent.messageId,
      deletedBy: 'moderator'
    });
    const sanction = expectEnvelope(await sanctioned, 'chat.sanction');
    expect(sanction).toMatchObject({ kind: 'mute', reason: 'spam' });
    expect(Number.isNaN(Date.parse(String(sanction.expiresAt)))).toBe(false);

    const message = await prisma.chatMessage.findUniqueOrThrow({ where: { id: sent.messageId } });
    expect(message.deletedAt).not.toBeNull();
    expect(await prisma.chatReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      status: 'reviewed',
      resolvedBy: players[0]!.id
    });
    const actions = await prisma.auditLog.findMany({
      where: { targetId: sent.messageId },
      select: { action: true }
    });
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['moderation.message_deleted', 'moderation.sanction_issued'])
    );
  });

  it('anonymise les messages lors de la suppression du compte', async () => {
    const author = await connect(players[1]!);
    await author.emitWithAck('room.join', { room: `channel:${fixture.globalId}` });
    const sent = (await author.emitWithAck('chat.send', {
      channelId: fixture.globalId,
      body: 'Un message conservé',
      clientMessageId: uuidv7()
    })) as { messageId: string };
    expect(
      await prisma.chatMessage.findUniqueOrThrow({ where: { id: sent.messageId } })
    ).toMatchObject({ userId: players[1]!.id, authorLabel: players[1]!.pseudonym });

    const response = await players[1]!.agent.delete('/api/v1/me').send({ password: PASSWORD });
    expect(response.status).toBe(202);

    expect(
      await prisma.chatMessage.findUniqueOrThrow({ where: { id: sent.messageId } })
    ).toMatchObject({ userId: null, authorLabel: 'Joueur supprimé', body: 'Un message conservé' });
  });
});
