import { Injectable } from '@nestjs/common';
import { type ContributionEventKind, Prisma } from '@prisma/client';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.module';

/** Poids bruts par nature d'événement, avant coefficient réduit (FR-059). */
const EVENT_WEIGHTS: Record<ContributionEventKind, number> = {
  kept_line: 1,
  success: 10,
  assistance: 2
};

/** Coefficient réduit appliqué au classement des joueurs (FR-059). */
export const CONTRIBUTION_COEFFICIENT = 0.5;

export interface ContributionView {
  teamId: string;
  userId: string;
  keptLines: number;
  successes: number;
  assistance: number;
  coefficient: number;
  score: number;
}

export interface RecordContributionInput {
  teamId: string;
  challengeId: string;
  userId: string;
  kind: ContributionEventKind;
  weight?: number;
  submissionId?: string;
}

/**
 * FR-059 : score de contribution individuelle (lignes conservées, réussites,
 * assistance). Le score brut est multiplié par un coefficient réduit de 0,5 et
 * alimente un classement dédié sans écraser `BestScore` ni le classement
 * individuel des joueurs (SC-009).
 */
@Injectable()
export class ContributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  /** Enregistre un événement puis recalcule et publie le score du membre. */
  async record(input: RecordContributionInput): Promise<ContributionView> {
    const weight = input.weight ?? 1;
    if (!Number.isInteger(weight) || weight <= 0) {
      throw new Error('Contribution weight must be a positive integer');
    }

    await this.prisma.contributionEvent.create({
      data: {
        id: uuidv7(),
        teamId: input.teamId,
        challengeId: input.challengeId,
        userId: input.userId,
        kind: input.kind,
        weight,
        submissionId: input.submissionId ?? null
      }
    });

    const view = await this.recompute(input.teamId, input.userId);
    await this.feedPlayerLeaderboard(input.userId, view.score);
    return view;
  }

  /** Recalcule le score agrégé et le publie dans le ZSET de contribution. */
  async recompute(teamId: string, userId: string): Promise<ContributionView> {
    const grouped = await this.prisma.contributionEvent.groupBy({
      by: ['kind'],
      where: { teamId, userId },
      _sum: { weight: true }
    });

    const totals: Record<ContributionEventKind, number> = {
      kept_line: 0,
      success: 0,
      assistance: 0
    };
    for (const row of grouped) {
      totals[row.kind] = row._sum.weight ?? 0;
    }

    const raw =
      totals.kept_line * EVENT_WEIGHTS.kept_line +
      totals.success * EVENT_WEIGHTS.success +
      totals.assistance * EVENT_WEIGHTS.assistance;
    const score = Math.round(raw * CONTRIBUTION_COEFFICIENT);

    const persisted = await this.prisma.contributionScore.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: {
        teamId,
        userId,
        keptLines: totals.kept_line,
        successes: totals.success,
        assistance: totals.assistance,
        coefficient: CONTRIBUTION_COEFFICIENT,
        score
      },
      update: {
        keptLines: totals.kept_line,
        successes: totals.success,
        assistance: totals.assistance,
        coefficient: CONTRIBUTION_COEFFICIENT,
        score
      }
    });

    await this.redis.client.zadd('leaderboard:contribution:player', score, userId);
    return this.toView(persisted);
  }

  /** Score courant d'un membre (recalculé pour rester déterministe). */
  async scoreFor(teamId: string, userId: string): Promise<ContributionView> {
    return this.recompute(teamId, userId);
  }

  /** Classement des contributions d'une équipe, du meilleur au moins bon. */
  async leaderboard(teamId: string): Promise<ContributionView[]> {
    const rows = await this.prisma.contributionScore.findMany({
      where: { teamId },
      orderBy: [{ score: 'desc' }, { userId: 'asc' }]
    });
    return rows.map((row) => this.toView(row));
  }

  /**
   * Alimente le classement des joueurs avec un score déjà réduit, sans toucher
   * aux meilleurs scores retenus (`recordRetainedScore`). Méthode idempotente.
   */
  async feedPlayerLeaderboard(userId: string, score: number): Promise<void> {
    await this.redis.client.zadd('leaderboard:global:00000000-0000-0000-0000-000000000000:player:contribution', score, userId);
  }

  private toView(row: {
    teamId: string;
    userId: string;
    keptLines: number;
    successes: number;
    assistance: number;
    coefficient: Prisma.Decimal | number;
    score: number;
  }): ContributionView {
    return {
      teamId: row.teamId,
      userId: row.userId,
      keptLines: row.keptLines,
      successes: row.successes,
      assistance: row.assistance,
      coefficient: Number(row.coefficient),
      score: row.score
    };
  }
}
