import { PrismaClient } from '@prisma/client';
import jwt, { type JwtPayload } from 'jsonwebtoken';
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
 * T228 [P] [US15] — écrit avant l'implémentation (constitution IV).
 *
 * FR-095/FR-096 : jeton LiveKit court délivré seulement aux membres du canal,
 * publication limitée au microphone, aucun enregistrement exposé, jamais de
 * jeton dans l'URL.
 */
describe('Autorisation vocale (T228)', () => {
  const NOW = new Date('2031-06-03T12:00:00.000Z');
  // Ne pas importer `src/config/env` ici : il figerait REDIS_URL sur localhost
  // avant que `createTestApp()` ne le remplace par l'URL du conteneur de test.
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'test-livekit-secret';
  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let players: TestPlayer[];
  let fixture: ChatFixture;
  let port: number;
  let sockets: Socket[];

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    port = await listenOnce(api);

    players = [
      await createTestPlayer(api, prisma, 'voice-captain'),
      await createTestPlayer(api, prisma, 'voice-member'),
      await createTestPlayer(api, prisma, 'voice-spectator'),
      await createTestPlayer(api, prisma, 'voice-outsider')
    ];
    const theme = await seedTheme(prisma, 'theme-voice');
    const challenge = await seedChallenge(prisma, theme.id, 'Défi voix');
    fixture = await seedChatFixture({
      prisma,
      slug: `voice-${uuidv7()}`,
      players,
      challengeId: challenge.id,
      now: NOW
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

  afterEach(() => {
    for (const socket of sockets ?? []) socket.disconnect();
  });

  async function connect(player: TestPlayer): Promise<Socket> {
    const socket = await connectPlayer(api, player, port);
    sockets.push(socket);
    return socket;
  }

  it('délivre un jeton court au membre du canal, sans enregistrement ni jeton dans l’URL', async () => {
    const socket = await connect(players[0]!);
    const roomName = `channel:${fixture.teamId}`;
    const announced = waitForEvent(socket, 'voice.token');

    const ack = (await socket.emitWithAck('voice.join', { roomName })) as {
      ok: boolean;
      token?: string;
      url?: string;
      expiresAt?: string;
    };
    expect(ack).toMatchObject({ ok: true, token: expect.any(String), url: expect.any(String) });
    expect(ack.url).not.toContain(ack.token ?? '');
    expect(ack.url).not.toContain('token=');

    const claims = jwt.verify(ack.token!, LIVEKIT_API_SECRET) as JwtPayload;
    expect(claims.iss).toBe(LIVEKIT_API_KEY);
    expect(claims.sub).toBe(players[0]!.id);
    const lifetime = Number(claims.exp) - Number(claims.iat);
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(60);
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishSources: ['microphone']
    });
    expect(JSON.stringify(claims).toLowerCase()).not.toContain('record');

    const data = expectEnvelope(await announced, 'voice.token');
    expect(data).toMatchObject({ roomName, token: ack.token });
    expect(Number.isNaN(Date.parse(String(data.expiresAt)))).toBe(false);
  });

  it('refuse un salon à un compte extérieur au canal', async () => {
    const outsider = await connect(players[3]!);
    expect(
      await outsider.emitWithAck('voice.join', { roomName: `channel:${fixture.teamId}` })
    ).toEqual({ ok: false, code: 'FORBIDDEN_ROOM' });
  });

  it('autorise la voix d’événement pour les participants et les spectateurs', async () => {
    const participant = await connect(players[1]!);
    const spectator = await connect(players[2]!);

    expect(
      await participant.emitWithAck('voice.join', { roomName: `channel:${fixture.eventId}` })
    ).toMatchObject({ ok: true });
    expect(
      await spectator.emitWithAck('voice.join', { roomName: `channel:${fixture.spectatorId}` })
    ).toMatchObject({ ok: true });
    expect(
      await spectator.emitWithAck('voice.join', { roomName: `channel:${fixture.eventId}` })
    ).toEqual({ ok: false, code: 'FORBIDDEN_ROOM' });
  });
});
