import { PrismaClient } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { seedBattleFixture } from '../helpers/battle';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedChallenge, seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T218 [P] [US14] — écrit avant l'implémentation (constitution IV).
 *
 * Contrat `websocket-events.md` §3.5 : enveloppe `{ id, type, at, data }`,
 * payloads `round.started/warning/closed`, `participant.eliminated`,
 * `event.finished`, diffusion visible en moins de 2 s.
 */
describe('Contrat temps réel — manches battle royale (T218)', () => {
  const NOW = new Date('2031-05-12T10:00:00.000Z');
  const STARTS_AT = new Date('2031-05-12T09:00:00.000Z');
  const ENDS_AT = new Date('2031-05-12T11:00:00.000Z');
  const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let players: TestPlayer[];
  let challengeId: string;
  let RoundServiceClass: typeof import('../../src/modules/battle-royale/round.service').RoundService;
  let socket: Socket;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    RoundServiceClass = (await import('../../src/modules/battle-royale/round.service')).RoundService;
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    players = [await createTestPlayer(api, prisma, 'br-ws-a'), await createTestPlayer(api, prisma, 'br-ws-b')];
    const theme = await seedTheme(prisma, 'theme-battle-ws');
    challengeId = (await seedChallenge(prisma, theme.id, 'Défi temps réel')).id;
  }, 180_000);

  afterAll(async () => {
    socket?.disconnect();
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(() => clock.set(NOW));

  async function connect(eventId: string): Promise<void> {
    await api.app.listen(0);
    const address = api.app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const agent = request.agent(api.app.getHttpServer());
    const login = await agent.post('/api/v1/auth/login').send({
      identifier: `${players[0]!.pseudonym}@example.com`,
      password: 'correct-horse-battery-staple'
    });
    const cookie = (login.headers['set-cookie'] as string[] | undefined)
      ?.map((entry) => entry.split(';')[0])
      .join('; ');

    socket = io(`http://127.0.0.1:${port}/realtime`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie ?? '' }
    });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const ack = await socket.emitWithAck('battle.subscribe', { eventId });
    expect(ack).toMatchObject({ ok: true, room: `event:${eventId}` });
  }

  function waitForEvent(event: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Événement ${event} non reçu`)), 2_000);
      socket.once(event, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  function expectEnvelope(payload: unknown, type: string): Record<string, unknown> {
    expect(payload).toMatchObject({ type });
    const envelope = payload as { id: string; type: string; at: string; data: Record<string, unknown> };
    expect(envelope.id).toMatch(UUIDV7);
    expect(Number.isNaN(Date.parse(envelope.at))).toBe(false);
    return envelope.data;
  }

  it('diffuse les événements de manche conformes au contrat en moins de 2 s', async () => {
    const { eventId } = await seedBattleFixture({
      api,
      prisma,
      slug: `br-ws-${uuidv7()}`,
      players,
      challengeId,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      minParticipants: 2,
      creatorId: players[0]!.id
    });
    await connect(eventId);
    const service = api.app.get(RoundServiceClass);
    const round = await service.schedule(eventId, { challengeId, startsAt: NOW, endsAt: ENDS_AT });

    const startedPromise = waitForEvent('round.started');
    const startedAt = performance.now();
    clock.set(NOW);
    await service.openDue();
    const started = expectEnvelope(await startedPromise, 'round.started');
    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(started).toMatchObject({
      eventId,
      roundNumber: round.roundNumber,
      challengeId,
      endsAt: ENDS_AT.toISOString()
    });

    const warningPromise = waitForEvent('round.warning');
    clock.set(new Date(ENDS_AT.getTime() - 60_000));
    await service.warnDue();
    const warning = expectEnvelope(await warningPromise, 'round.warning');
    expect(warning).toMatchObject({ roundNumber: round.roundNumber, remainingMs: 60_000 });

    for (let index = 0; index < players.length; index += 1) {
      await service.recordResult(round.id, {
        subjectType: 'player',
        subjectId: players[index]!.id,
        score: (index + 1) * 100,
        submittedAt: new Date(NOW.getTime() + index * 1_000)
      });
    }

    const closedPromise = waitForEvent('round.closed');
    const eliminatedPromise = waitForEvent('participant.eliminated');
    const finishedPromise = waitForEvent('event.finished');
    clock.set(ENDS_AT);
    await service.closeDue();

    const closed = expectEnvelope(await closedPromise, 'round.closed');
    expect(closed).toMatchObject({
      roundNumber: round.roundNumber,
      results: expect.arrayContaining([expect.objectContaining({ subjectId: players[0]!.id, score: 100 })])
    });
    const eliminated = expectEnvelope(await eliminatedPromise, 'participant.eliminated');
    expect(eliminated).toMatchObject({
      subjectId: players[0]!.id,
      roundNumber: round.roundNumber,
      remaining: 1,
      reason: 'lowest_score'
    });
    const finished = expectEnvelope(await finishedPromise, 'event.finished');
    expect(finished).toMatchObject({
      eventId,
      winner: { subjectId: players[1]!.id, displayName: players[1]!.pseudonym }
    });
  });
});
