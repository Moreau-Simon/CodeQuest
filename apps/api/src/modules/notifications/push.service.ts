import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATION_NEW } from '../../realtime/realtime.constants';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  PUSH_TRANSPORT,
  type PushKeys,
  type PushMessage,
  type PushTransport
} from './push.transport';

export interface SubscribeInput {
  endpoint: string;
  keys: PushKeys;
}

const UPCOMING_WINDOW_MS = 15 * 60_000;
const KO_LOOKBACK_MS = 6 * 60 * 60_000;

function pushKeys(value: Prisma.JsonValue): PushKeys | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = value as Record<string, unknown>;
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  return { p256dh: keys.p256dh, auth: keys.auth };
}

/**
 * Notifications FR-104 (T244) : abonnements Web Push, événements à venir et
 * fin de KO. Une même notification n'est émise qu'une fois par joueur et par
 * référence, même si le job est rejoué après un redémarrage.
 */
@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeGateway,
    @Inject(PUSH_TRANSPORT) private readonly transport: PushTransport
  ) {}

  async subscribe(
    userId: string,
    input: SubscribeInput
  ): Promise<{
    id: string;
    endpoint: string;
    createdAt: Date;
  }> {
    // L'endpoint est une clé unique globale : sans ce contrôle, un joueur
    // pourrait détourner l'abonnement d'un autre compte (FR-104).
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: input.endpoint },
      select: { userId: true }
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_FORBIDDEN',
        message: 'Abonnement appartenant à un autre joueur'
      });
    }

    const saved = await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        id: uuidv7(),
        userId,
        endpoint: input.endpoint,
        keys: input.keys as unknown as Prisma.InputJsonValue
      },
      update: {
        userId,
        keys: input.keys as unknown as Prisma.InputJsonValue,
        revokedAt: null
      }
    });
    return { id: saved.id, endpoint: saved.endpoint, createdAt: saved.createdAt };
  }

  async revoke(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.updateMany({
      where: { endpoint, userId, revokedAt: null },
      data: { revokedAt: this.clock.now() }
    });
  }

  /** Prévient les inscrits des événements qui débutent dans les 15 minutes. */
  async notifyUpcomingEvents(): Promise<number> {
    const now = this.clock.now();
    const events = await this.prisma.event.findMany({
      where: {
        status: 'scheduled',
        startsAt: { gt: now, lte: new Date(now.getTime() + UPCOMING_WINDOW_MS) }
      },
      select: { id: true, title: true, startsAt: true }
    });

    let notified = 0;
    for (const event of events) {
      const participants = await this.prisma.eventParticipant.findMany({
        where: { eventId: event.id, subjectType: 'player' },
        select: { subjectId: true }
      });
      const userIds = [...new Set(participants.map((participant) => participant.subjectId))];
      if (userIds.length === 0) continue;

      const alreadySent = await this.prisma.notification.findMany({
        where: { kind: 'event_starting', referenceId: event.id, userId: { in: userIds } },
        select: { userId: true }
      });
      const sent = new Set(alreadySent.map((entry) => entry.userId));
      const targets = userIds.filter((userId) => !sent.has(userId));
      if (targets.length === 0) continue;

      const payload = { eventId: event.id, startsAt: event.startsAt.toISOString() };
      notified += await this.deliver({
        userIds: targets,
        kind: 'event_starting',
        referenceId: event.id,
        message: {
          title: event.title,
          body: 'Un événement commence bientôt.',
          data: { kind: 'event_starting', eventId: event.id }
        },
        payload
      });
    }
    return notified;
  }

  /** Prévient les joueurs dont la période de KO vient de se terminer. */
  async notifyKoEnded(): Promise<number> {
    const now = this.clock.now();
    const health = await this.prisma.playerHealth.findMany({
      where: {
        subjectType: 'player',
        hp: 0,
        koUntil: {
          lte: now,
          gte: new Date(now.getTime() - KO_LOOKBACK_MS)
        }
      },
      select: { subjectId: true, koUntil: true }
    });
    const ending = health.filter(
      (row): row is { subjectId: string; koUntil: Date } => row.koUntil !== null
    );
    if (ending.length === 0) return 0;

    const userIds = [...new Set(ending.map((row) => row.subjectId))];
    const references = ending.map((row) => koReference(row.subjectId, row.koUntil));
    const alreadySent = await this.prisma.notification.findMany({
      where: { kind: 'ko_ended', referenceId: { in: references }, userId: { in: userIds } },
      select: { userId: true, referenceId: true }
    });
    const sent = new Set(alreadySent.map((entry) => `${entry.userId}:${entry.referenceId}`));
    const targets = ending.filter(
      (row) => !sent.has(`${row.subjectId}:${koReference(row.subjectId, row.koUntil)}`)
    );
    if (targets.length === 0) return 0;

    let notified = 0;
    for (const row of targets) {
      const referenceId = koReference(row.subjectId, row.koUntil);
      const payload = { endedAt: row.koUntil.toISOString() };
      notified += await this.deliver({
        userIds: [row.subjectId],
        kind: 'ko_ended',
        referenceId,
        message: {
          title: 'Récupération terminée',
          body: 'Votre période de KO est terminée.',
          data: { kind: 'ko_ended', endedAt: payload.endedAt }
        },
        payload
      });
    }
    return notified;
  }

  private async deliver(input: {
    userIds: readonly string[];
    kind: string;
    referenceId: string;
    message: PushMessage;
    payload: Record<string, unknown>;
  }): Promise<number> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: [...input.userIds] }, revokedAt: null },
      select: { userId: true, endpoint: true, keys: true }
    });

    const authorized = new Set<string>();
    for (const subscription of subscriptions) {
      const keys = pushKeys(subscription.keys);
      if (!keys) continue;
      await this.transport.send({ endpoint: subscription.endpoint, keys }, input.message);
      authorized.add(subscription.userId);
    }

    const recipients = input.userIds.filter((userId) => authorized.has(userId));
    if (recipients.length === 0) return 0;

    for (const userId of recipients) {
      this.realtime.emitToUser(userId, NOTIFICATION_NEW, {
        kind: input.kind,
        payload: input.payload
      });
    }

    await this.prisma.notification.createMany({
      data: recipients.map((userId) => ({
        id: uuidv7(),
        userId,
        kind: input.kind,
        referenceId: input.referenceId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
        createdAt: this.clock.now()
      })),
      skipDuplicates: true
    });
    return recipients.length;
  }
}

function koReference(userId: string, koUntil: Date): string {
  return `ko:${userId}:${koUntil.toISOString()}`;
}
