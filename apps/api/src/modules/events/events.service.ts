import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { Event, EventParticipant, EventStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateEventInput {
  title: string;
  timezone: string;
  startsAt: string | Date;
  endsAt: string | Date;
  type: 'standard' | 'battle_royale';
  challengeIds?: string[];
  minParticipants?: number;
  rewards?: Record<string, unknown>;
}

export interface EventView {
  id: string;
  title: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  type: Event['type'];
  maxAttempts: number;
  challengeIds: string[];
  joined: boolean;
  attemptConsumed: boolean;
  /** Horloge serveur UTC : référence unique des comptes à rebours (FR-061). */
  serverNow: string;
}

export interface EventParticipationView {
  eventId: string;
  joined: boolean;
}

/** Fuseaux IANA reconnus par Node (avec repli sur le constructeur Intl). */
function isIanaTimezone(timezone: string): boolean {
  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (key: 'timeZone') => string[] }
  ).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    return supportedValuesOf('timeZone').includes(timezone);
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cycle de vie et inscriptions des événements (T167, FR-061, FR-065).
 *
 * Toute comparaison temporelle passe par `Clock` : la fenêtre est calculée sur
 * l'horloge serveur UTC, jamais sur celle du navigateur ni à l'ouverture de la
 * page. `status` est calculé pour l'affichage (à venir / ouvert / terminé) sans
 * modifier la source de vérité en base.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService
  ) {}

  /** Création en brouillon (route admin `POST /admin/events`, contrat § Events). */
  async create(input: CreateEventInput, user: AuthenticatedUser): Promise<EventView> {
    if (!isIanaTimezone(input.timezone)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Le fuseau horaire doit être un identifiant IANA valide'
      });
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'Les bornes de l’événement sont invalides'
      });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'La fin de l’événement doit être postérieure à son début'
      });
    }
    if (input.minParticipants !== undefined && input.minParticipants < 2) {
      throw new BadRequestException({
        code: 'INVALID_MIN_PARTICIPANTS',
        message: 'Au moins deux participants sont requis'
      });
    }

    const slug = `${slugify(input.title) || 'event'}-${uuidv7().slice(0, 8)}`;
    const event = await this.prisma.event.create({
      data: {
        id: uuidv7(),
        slug,
        title: input.title,
        timezone: input.timezone,
        startsAt,
        endsAt,
        type: input.type,
        minParticipants: input.minParticipants ?? 8,
        rewards: (input.rewards ?? undefined) as Prisma.InputJsonValue | undefined,
        createdBy: user.id,
        challenges: {
          create: (input.challengeIds ?? []).map((challengeId, index) => ({
            challengeId,
            order: index + 1
          }))
        }
      },
      include: { challenges: true }
    });

    await this.audit.record({
      actorId: user.id,
      action: 'event.created',
      targetType: 'event',
      targetId: event.id
    });

    return this.toView(event, undefined);
  }

  /** Liste publique : aperçus « à venir », « ouvert » ou « terminé ». */
  async list(viewerId?: string): Promise<EventView[]> {
    const events = await this.prisma.event.findMany({
      orderBy: { startsAt: 'asc' },
      include: { challenges: { orderBy: { order: 'asc' } } }
    });
    const participants = viewerId
      ? await this.prisma.eventParticipant.findMany({
          where: { subjectType: 'player', subjectId: viewerId }
        })
      : [];
    const byEvent = new Map(participants.map((participant) => [participant.eventId, participant]));

    return events.map((event) => this.toView(event, byEvent.get(event.id)));
  }

  /** Inscription : refusée hors fenêtre (FR-061), idempotente pour un même joueur. */
  async join(eventId: string, user: AuthenticatedUser): Promise<EventParticipationView> {
    this.requireWritable(user);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    if (this.effectiveStatus(event, this.clock.now()) !== 'open') {
      throw new ConflictException({
        code: 'EVENT_CLOSED',
        message: 'L’événement n’est pas dans sa fenêtre d’ouverture'
      });
    }

    const key = this.participantKey(eventId, user.id);
    await this.prisma.eventParticipant.upsert({
      where: key,
      create: { id: uuidv7(), eventId, subjectType: 'player', subjectId: user.id },
      update: {}
    });

    return { eventId, joined: true };
  }

  private toView(
    event: Event & { challenges?: Array<{ challengeId: string }> },
    participant?: EventParticipant
  ): EventView {
    return {
      id: event.id,
      title: event.title,
      timezone: event.timezone,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      status: this.effectiveStatus(event, this.clock.now()),
      type: event.type,
      maxAttempts: event.maxAttempts,
      challengeIds: (event.challenges ?? []).map((link) => link.challengeId),
      joined: participant !== undefined,
      attemptConsumed: participant?.attemptConsumedAt !== null && participant?.attemptConsumedAt !== undefined,
      serverNow: this.clock.now().toISOString()
    };
  }

  /**
   * Statut « vu par le joueur » : la fenêtre prime sur le statut stocké, afin
   * qu'un événement planifié ne puisse pas être rejoint avant son ouverture ni
   * après sa clôture (FR-061).
   */
  private effectiveStatus(event: Event, now: Date): EventStatus {
    if (now.getTime() < event.startsAt.getTime()) return 'scheduled';
    if (now.getTime() >= event.endsAt.getTime()) return 'finished';
    if (event.status === 'draft' || event.status === 'archived') return event.status;
    return 'open';
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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
