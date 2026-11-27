import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { NOTIFICATION_NEW } from '../../src/realtime/realtime.constants';
import type { PushService as PushServiceType } from '../../src/modules/notifications/push.service';
import { PUSH_TRANSPORT } from '../../src/modules/notifications/push.transport';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import {
  connectPlayer,
  expectEnvelope,
  listenOnce,
  waitForEvent
} from '../helpers/realtime-socket';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T244 [P] [US16] (FR-104, SC-018) — écrit avant l'implémentation.
 *
 * Le transport Web Push est remplacé : aucun service externe n'est sollicité.
 * L'horloge figée rend les fenêtres « événement à venir » et « fin de KO »
 * déterministes.
 */
describe('US16 — notifications Web Push (T244)', () => {
  const NOW = new Date('2031-06-03T10:00:00.000Z');
  const ENDPOINT = 'https://push.example.com/integration';
  const KEYS = { p256dh: 'p256dh-key', auth: 'auth-secret' };

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let clock: FrozenClock;
  let player: TestPlayer;
  let push: PushServiceType;
  let transport: { send: jest.Mock };

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    clock = new FrozenClock(NOW);
    transport = { send: jest.fn().mockResolvedValue(undefined) };
    api = await createTestApp(infra, {
      clock,
      overrides: [{ token: PUSH_TRANSPORT, useValue: transport }]
    });
    const { PushService } = await import('../../src/modules/notifications/push.service');
    push = api.app.get(PushService);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    player = await createTestPlayer(api, prisma, 'push-player');
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  beforeEach(async () => {
    clock.set(NOW);
    transport.send.mockClear();
    await prisma.notification.deleteMany({ where: { userId: player.id } });
    await prisma.pushSubscription.deleteMany({ where: { userId: player.id } });
    await prisma.event.deleteMany({ where: { createdBy: player.id } });
    await prisma.playerHealth.deleteMany({
      where: { subjectType: 'player', subjectId: player.id }
    });
  });

  async function subscribe(): Promise<void> {
    const response = await player.agent.post('/api/v1/notifications/subscriptions').send({
      endpoint: ENDPOINT,
      keys: KEYS
    });
    expect(response.status).toBe(201);
  }

  it('enregistre puis révoque un abonnement pour le titulaire', async () => {
    await subscribe();
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: ENDPOINT } });
    expect(row.userId).toBe(player.id);
    expect(row.revokedAt).toBeNull();

    const revoked = await player.agent
      .delete('/api/v1/notifications/subscriptions')
      .query({ endpoint: ENDPOINT });
    expect(revoked.status).toBe(200);
    const after = await prisma.pushSubscription.findUniqueOrThrow({
      where: { endpoint: ENDPOINT }
    });
    expect(after.revokedAt).not.toBeNull();
  });

  it('refuse la réassignation d’un endpoint détenu par un autre joueur', async () => {
    await subscribe();
    const other = await createTestPlayer(api, prisma, `other-${uuidv7().slice(0, 8)}`);

    const response = await other.agent.post('/api/v1/notifications/subscriptions').send({
      endpoint: ENDPOINT,
      keys: KEYS
    });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('SUBSCRIPTION_FORBIDDEN');
  });

  it('notifie une fois un événement à venir, par Web Push et par socket', async () => {
    await subscribe();
    const startsAt = new Date(NOW.getTime() + 5 * 60_000);
    const eventId = uuidv7();
    await prisma.event.create({
      data: {
        id: eventId,
        slug: 'event-push',
        title: 'Événement à venir',
        timezone: 'UTC',
        startsAt,
        endsAt: new Date(NOW.getTime() + 60 * 60_000),
        status: 'scheduled',
        createdBy: player.id,
        participants: {
          create: [{ id: uuidv7(), subjectType: 'player', subjectId: player.id }]
        }
      }
    });

    const port = await listenOnce(api);
    const socket = await connectPlayer(api, player, port);
    const received = waitForEvent(socket, NOTIFICATION_NEW);

    expect(await push.notifyUpcomingEvents()).toBe(1);
    expect(expectEnvelope(await received, NOTIFICATION_NEW)).toMatchObject({
      kind: 'event_starting',
      payload: { eventId, startsAt: startsAt.toISOString() }
    });
    expect(transport.send).toHaveBeenCalledTimes(1);

    // Un second balayage ne doit pas renvoyer la même notification.
    expect(await push.notifyUpcomingEvents()).toBe(0);
    expect(transport.send).toHaveBeenCalledTimes(1);
    socket.close();
  });

  it('notifie la fin de KO après le délai de récupération', async () => {
    await subscribe();
    const koUntil = new Date(NOW.getTime() - 60_000);
    await prisma.playerHealth.create({
      data: {
        id: uuidv7(),
        subjectType: 'player',
        subjectId: player.id,
        hp: 0,
        koUntil,
        lastRegenAt: koUntil
      }
    });

    expect(await push.notifyKoEnded()).toBe(1);
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: ENDPOINT }),
      expect.objectContaining({ data: expect.objectContaining({ kind: 'ko_ended' }) })
    );
    expect(await push.notifyKoEnded()).toBe(0);
  });

  it('ne notifie pas un abonnement révoqué', async () => {
    await subscribe();
    await player.agent.delete('/api/v1/notifications/subscriptions').query({ endpoint: ENDPOINT });
    await prisma.playerHealth.create({
      data: {
        id: uuidv7(),
        subjectType: 'player',
        subjectId: player.id,
        hp: 0,
        koUntil: new Date(NOW.getTime() - 60_000),
        lastRegenAt: NOW
      }
    });

    expect(await push.notifyKoEnded()).toBe(0);
    expect(transport.send).not.toHaveBeenCalled();
  });
});
