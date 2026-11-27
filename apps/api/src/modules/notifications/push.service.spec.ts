import { Test } from '@nestjs/testing';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { NOTIFICATION_NEW } from '../../realtime/realtime.constants';
import { PUSH_TRANSPORT, type PushTransport } from './push.transport';
import { PushService } from './push.service';

/**
 * T244 [P] [US16] (FR-104) — écrit avant l'implémentation (constitution IV).
 * Le transport est injecté : aucun appel réseau réel n'est effectué.
 */
describe('Notifications Web Push (T244)', () => {
  const NOW = new Date('2031-06-03T10:00:00.000Z');
  const ENDPOINT = 'https://push.example.com/subscription-1';
  const KEYS = { p256dh: 'p256dh-key', auth: 'auth-secret' };

  let service: PushService;
  let prisma: {
    pushSubscription: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    event: { findMany: jest.Mock };
    eventParticipant: { findMany: jest.Mock };
    playerHealth: { findMany: jest.Mock };
    notification: { findMany: jest.Mock; createMany: jest.Mock };
  };
  let transport: { send: jest.Mock } & PushTransport;
  let realtime: { emitToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      pushSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'subscription-1',
          userId: 'user-1',
          endpoint: ENDPOINT,
          createdAt: NOW
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'user-1', endpoint: ENDPOINT, keys: KEYS }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      playerHealth: { findMany: jest.fn().mockResolvedValue([]) },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    };
    transport = { send: jest.fn().mockResolvedValue(undefined) };
    realtime = { emitToUser: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: { now: () => NOW, nowMs: () => NOW.getTime() } },
        { provide: PUSH_TRANSPORT, useValue: transport },
        { provide: RealtimeGateway, useValue: realtime }
      ]
    }).compile();

    service = moduleRef.get(PushService);
  });

  it('enregistre un abonnement Web Push pour l’utilisateur connecté', async () => {
    const saved = await service.subscribe('user-1', { endpoint: ENDPOINT, keys: KEYS });

    expect(saved).toMatchObject({ endpoint: ENDPOINT });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: ENDPOINT },
        create: expect.objectContaining({ userId: 'user-1', endpoint: ENDPOINT, keys: KEYS }),
        update: expect.objectContaining({ userId: 'user-1', revokedAt: null })
      })
    );
  });

  it('refuse de réassigner un abonnement appartenant à un autre joueur', async () => {
    prisma.pushSubscription.findUnique.mockResolvedValue({ userId: 'user-2' });

    await expect(service.subscribe('user-1', { endpoint: ENDPOINT, keys: KEYS })).rejects.toThrow(
      'Abonnement appartenant à un autre joueur'
    );
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('révoque uniquement l’abonnement du titulaire', async () => {
    await service.revoke('user-1', ENDPOINT);

    expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { endpoint: ENDPOINT, userId: 'user-1', revokedAt: null },
      data: { revokedAt: NOW }
    });
  });

  it('notifie les participants d’un événement proche par Web Push et par socket', async () => {
    const startsAt = new Date(NOW.getTime() + 5 * 60_000);
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1', title: 'Événement', startsAt }]);
    prisma.eventParticipant.findMany.mockResolvedValue([
      { eventId: 'event-1', subjectType: 'player', subjectId: 'user-1' }
    ]);

    const sent = await service.notifyUpcomingEvents();

    expect(sent).toBe(1);
    expect(transport.send).toHaveBeenCalledWith(
      { endpoint: ENDPOINT, keys: KEYS },
      expect.objectContaining({
        title: 'Événement',
        data: { kind: 'event_starting', eventId: 'event-1' }
      })
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith('user-1', NOTIFICATION_NEW, {
      kind: 'event_starting',
      payload: { eventId: 'event-1', startsAt: startsAt.toISOString() }
    });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          kind: 'event_starting',
          referenceId: 'event-1'
        })
      ],
      skipDuplicates: true
    });
  });

  it('notifie la fin de KO dès que le délai est écoulé', async () => {
    const koUntil = new Date(NOW.getTime() - 60_000);
    prisma.playerHealth.findMany.mockResolvedValue([
      { subjectType: 'player', subjectId: 'user-1', koUntil }
    ]);

    const sent = await service.notifyKoEnded();

    expect(sent).toBe(1);
    expect(transport.send).toHaveBeenCalledWith(
      { endpoint: ENDPOINT, keys: KEYS },
      expect.objectContaining({
        data: { kind: 'ko_ended', endedAt: koUntil.toISOString() }
      })
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith('user-1', NOTIFICATION_NEW, {
      kind: 'ko_ended',
      payload: { endedAt: koUntil.toISOString() }
    });
  });

  it('ignore un joueur sans abonnement actif', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    const koUntil = new Date(NOW.getTime() - 60_000);
    prisma.playerHealth.findMany.mockResolvedValue([
      { subjectType: 'player', subjectId: 'user-1', koUntil }
    ]);

    expect(await service.notifyKoEnded()).toBe(0);
    expect(transport.send).not.toHaveBeenCalled();
  });
});
