import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from './ledger.service';

export interface BadgeDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly criteria: Record<string, unknown>;
}

/** Succès v1, évalués côté serveur à chaque progression (FR-077). */
export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  {
    key: 'first_success',
    name: 'Première réussite',
    description: 'Résoudre un premier défi',
    criteria: { kind: 'passed_submissions_at_least', value: 1 }
  },
  {
    key: 'score_500',
    name: 'Score 500',
    description: 'Atteindre un score d’au moins 500',
    criteria: { kind: 'best_score_at_least', value: 500 }
  },
  {
    key: 'boss_slayer',
    name: 'Vainqueur de boss',
    description: 'Vaincre un boss',
    criteria: { kind: 'boss_defeats_at_least', value: 1 }
  }
];

/** Attribution idempotente de badges et de leur éventuelle récompense Bits. */
@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService
  ) {}

  async evaluate(userId: string): Promise<string[]> {
    await this.ensureDefinitions();
    const [passed, bestScores, defeats] = await Promise.all([
      this.prisma.submission.count({ where: { userId, status: 'passed' } }),
      this.prisma.bestScore.findMany({
        where: { subjectType: 'player', subjectId: userId },
        select: { score: true }
      }),
      this.prisma.bossEngagement.count({
        where: { subjectType: 'player', subjectId: userId, defeatedAt: { not: null } }
      })
    ]);
    const maxScore = bestScores.reduce((max, row) => Math.max(max, Number(row.score)), 0);

    const awarded: string[] = [];
    for (const definition of BADGE_DEFINITIONS) {
      if (!this.matches(definition, passed, maxScore, defeats)) continue;
      const badge = await this.prisma.badge.findUniqueOrThrow({
        where: { key: definition.key },
        select: { id: true, criteria: true }
      });
      const result = await this.prisma.userBadge.createMany({
        data: [{ userId, badgeId: badge.id }],
        skipDuplicates: true
      });
      if (result.count === 0) continue;
      awarded.push(definition.key);

      const bits = this.bits(badge.criteria);
      if (bits > 0) {
        await this.ledger.credit({
          userId,
          amount: bits,
          reason: 'badge',
          idempotencyKey: `badge:${userId}:${definition.key}`,
          referenceType: 'badge',
          referenceId: badge.id
        });
      }
    }
    return awarded;
  }

  private async ensureDefinitions(): Promise<void> {
    for (const definition of BADGE_DEFINITIONS) {
      await this.prisma.badge.upsert({
        where: { key: definition.key },
        create: {
          id: uuidv7(),
          key: definition.key,
          name: definition.name,
          description: definition.description,
          criteria: definition.criteria as Prisma.InputJsonValue
        },
        update: {}
      });
    }
  }

  private matches(
    definition: BadgeDefinition,
    passed: number,
    maxScore: number,
    defeats: number
  ): boolean {
    const criteria = definition.criteria as { kind?: string; value?: number };
    if (criteria.kind === 'passed_submissions_at_least') return passed >= (criteria.value ?? 0);
    if (criteria.kind === 'best_score_at_least') return maxScore >= (criteria.value ?? 0);
    if (criteria.kind === 'boss_defeats_at_least') return defeats >= (criteria.value ?? 0);
    return false;
  }

  private bits(criteria: Prisma.JsonValue): number {
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return 0;
    const value = (criteria as Record<string, unknown>).bits;
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
}
