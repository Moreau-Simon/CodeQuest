import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Event, Prisma } from '@prisma/client';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LeaderboardService,
  type LeaderboardItem
} from '../leaderboards/leaderboard.service';

export interface EventResultsView {
  eventId: string;
  status: 'finished' | 'archived';
  published: boolean;
  rewards: Prisma.JsonValue | null;
  leaderboard: { items: LeaderboardItem[]; nextCursor: string | null };
  solutions: Array<{ challengeId: string; unlocked: boolean }>;
}

export interface EventSolutionView {
  eventId: string;
  challengeId: string;
  solution: string;
}

/**
 * Résultats, récompenses et corrigés (T169, FR-063, FR-064).
 *
 * Le classement dédié est une portée `event` du service de classement : aucun
 * score n'est agrégé ni recalculé ici. Les corrigés ne sont déchiffrés qu'après
 * clôture de la fenêtre, et jamais avant publication des résultats.
 */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly leaderboards: LeaderboardService,
    private readonly aes: AesGcmService
  ) {}

  /** Publie les résultats à la clôture (idempotent) puis renvoie le snapshot. */
  async publish(eventId: string): Promise<EventResultsView> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    if (event.status !== 'finished' && event.status !== 'archived') {
      await this.prisma.event.update({ where: { id: eventId }, data: { status: 'finished' } });
      event.status = 'finished';
    }
    return this.snapshot(event);
  }

  async get(eventId: string): Promise<EventResultsView> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    this.assertClosed(event, this.clock.now());
    return this.snapshot(event);
  }

  /** Corrigé d'un défi d'événement, débloqué seulement après clôture (FR-064). */
  async solution(eventId: string, challengeId: string): Promise<EventSolutionView> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Événement introuvable' });
    }
    this.assertClosed(event, this.clock.now());

    const link = await this.prisma.eventChallenge.findUnique({
      where: { eventId_challengeId: { eventId, challengeId } }
    });
    if (!link) {
      throw new NotFoundException({
        code: 'EVENT_CHALLENGE_NOT_FOUND',
        message: 'Ce défi ne fait pas partie de l’événement'
      });
    }

    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    const version = challenge
      ? await this.prisma.challengeVersion.findUnique({
          where: {
            challengeId_version: { challengeId, version: challenge.currentVersion }
          }
        })
      : null;
    if (!version?.referenceSolutionEncrypted) {
      throw new NotFoundException({
        code: 'SOLUTION_NOT_FOUND',
        message: 'Aucune solution de référence pour ce défi'
      });
    }

    return {
      eventId,
      challengeId,
      solution: this.aes
        .decrypt(Buffer.from(version.referenceSolutionEncrypted), version.id)
        .toString('utf8')
    };
  }

  private async snapshot(event: Event): Promise<EventResultsView> {
    const leaderboard = await this.leaderboards.query({
      scope: 'event',
      scopeId: event.id,
      subjectType: 'player'
    });
    const links = await this.prisma.eventChallenge.findMany({
      where: { eventId: event.id },
      orderBy: { order: 'asc' }
    });

    return {
      eventId: event.id,
      status: event.status === 'archived' ? 'archived' : 'finished',
      published: true,
      rewards: event.rewards,
      leaderboard: { items: leaderboard.items, nextCursor: leaderboard.nextCursor },
      solutions: links.map((link) => ({ challengeId: link.challengeId, unlocked: true }))
    };
  }

  private assertClosed(event: Event, now: Date): void {
    const closed =
      now.getTime() >= event.endsAt.getTime() ||
      event.status === 'finished' ||
      event.status === 'archived';
    if (!closed) {
      throw new ForbiddenException({
        code: 'EVENT_NOT_CLOSED',
        message: 'Les résultats seront publiés à la clôture de l’événement'
      });
    }
  }
}
