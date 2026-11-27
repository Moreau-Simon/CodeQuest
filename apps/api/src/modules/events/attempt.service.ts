import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Event } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';

export interface EventAttemptView {
  eventId: string;
  attemptStartedAt: string;
  attemptConsumedAt: string;
}

/**
 * Essai unique des événements (T168, FR-062, FR-065).
 *
 * L'ouverture de la page ne crée aucun essai : `start()` est la seule porte
 * d'entrée, et pose `attempt_started_at` **et** `attempt_consumed_at` dans la
 * même transaction verrouillée. Un abandon ou une fermeture de navigateur est
 * donc déjà consommé ; le job d'expiration couvre le cas d'une fenêtre passée
 * sans démarrage ni soumission.
 */
@Injectable()
export class AttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock
  ) {}

  async start(eventId: string, user: AuthenticatedUser): Promise<EventAttemptView> {
    this.requireWritable(user);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    this.assertOpen(event, this.clock.now());

    const key = this.participantKey(eventId, user.id);
    const participant = await this.prisma.eventParticipant.findUnique({ where: key });
    if (!participant) {
      throw new ConflictException({
        code: 'EVENT_NOT_JOINED',
        message: 'Inscrivez-vous à l’événement avant de démarrer l’essai'
      });
    }
    if (participant.eliminatedAt) {
      throw new ForbiddenException({
        code: 'PARTICIPANT_ELIMINATED',
        message: 'Vous êtes spectateur de cette battle royale'
      });
    }
    if (participant.attemptConsumedAt) {
      throw new ConflictException({
        code: 'ATTEMPT_ALREADY_CONSUMED',
        message: 'Votre unique essai a déjà été consommé'
      });
    }

    const startedAt = this.clock.now();
    await this.prisma.runInTransaction(async (tx) => {
      // Verrouille la ligne : deux clics concurrents ne peuvent pas consommer
      // deux essais, même avec deux requêtes simultanées.
      await tx.$queryRawUnsafe(
        'SELECT id FROM "event_participants" WHERE id = $1::uuid FOR UPDATE',
        participant.id
      );
      const fresh = await tx.eventParticipant.findUnique({ where: key });
      if (fresh?.eliminatedAt) {
        throw new ForbiddenException({
          code: 'PARTICIPANT_ELIMINATED',
          message: 'Vous êtes spectateur de cette battle royale'
        });
      }
      if (!fresh || fresh.attemptConsumedAt) {
        throw new ConflictException({
          code: 'ATTEMPT_ALREADY_CONSUMED',
          message: 'Votre unique essai a déjà été consommé'
        });
      }
      await tx.eventParticipant.update({
        where: key,
        data: { attemptStartedAt: startedAt, attemptConsumedAt: startedAt }
      });
    });

    return {
      eventId,
      attemptStartedAt: startedAt.toISOString(),
      attemptConsumedAt: startedAt.toISOString()
    };
  }

  /**
   * Porte de soumission d'un événement : essai explicitement démarré, fenêtre
   * ouverte, et une seule soumission par participant (FR-062, FR-065).
   */
  async assertCanSubmit(eventId: string, userId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    this.assertOpen(event, this.clock.now());

    const participant = await this.prisma.eventParticipant.findUnique({
      where: this.participantKey(eventId, userId)
    });
    if (!participant) {
      throw new ForbiddenException({
        code: 'EVENT_NOT_JOINED',
        message: 'Vous n’êtes pas inscrit à cet événement'
      });
    }
    if (participant.eliminatedAt) {
      throw new ForbiddenException({
        code: 'PARTICIPANT_ELIMINATED',
        message: 'Vous êtes spectateur de cette battle royale'
      });
    }
    if (!participant.attemptStartedAt || !participant.attemptConsumedAt) {
      throw new ConflictException({
        code: 'ATTEMPT_REQUIRED',
        message: 'Démarrez explicitement votre essai avant de soumettre'
      });
    }

    const submissions = await this.prisma.submission.count({ where: { eventId, userId } });
    if (submissions > 0) {
      throw new ConflictException({
        code: 'EVENT_ATTEMPT_ALREADY_USED',
        message: 'Une seule soumission est autorisée par événement'
      });
    }
  }

  /**
   * Clôture les événements dont la fenêtre est passée et consomme les essais
   * encore ouverts (abandon / navigateur fermé). Idempotent : un événement
   * déjà `finished` ou `archived` n'est pas réécrit.
   */
  async sweep(): Promise<string[]> {
    const now = this.clock.now();
    const expired = await this.prisma.event.findMany({
      where: {
        endsAt: { lte: now },
        status: { in: ['draft', 'scheduled', 'open'] },
        OR: [{ startsAt: { lte: now } }]
      }
    });

    for (const event of expired) {
      await this.prisma.runInTransaction(async (tx) => {
        await tx.eventParticipant.updateMany({
          where: { eventId: event.id, attemptConsumedAt: null },
          data: { attemptConsumedAt: event.endsAt }
        });
        await tx.event.update({ where: { id: event.id }, data: { status: 'finished' } });
      });
    }

    return expired.map((event) => event.id);
  }

  private assertOpen(event: Event, now: Date): void {
    const insideWindow =
      now.getTime() >= event.startsAt.getTime() && now.getTime() < event.endsAt.getTime();
    if (!insideWindow || event.status === 'finished' || event.status === 'archived') {
      throw new ConflictException({
        code: 'EVENT_CLOSED',
        message: 'L’événement n’est plus dans sa fenêtre d’ouverture'
      });
    }
  }

  private participantKey(eventId: string, subjectId: string) {
    return {
      eventId_subjectType_subjectId: {
        eventId,
        subjectType: 'player' as const,
        subjectId
      }
    };
  }

  private requireWritable(user: AuthenticatedUser): void {
    if (user.status === 'pending') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour participer à un événement'
      });
    }
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Ce compte ne peut pas participer à un événement'
      });
    }
  }
}
