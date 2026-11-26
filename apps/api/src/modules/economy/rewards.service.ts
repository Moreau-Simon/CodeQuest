import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { BadgesService } from './badges.service';
import { LedgerService } from './ledger.service';

export interface ChallengeRewardInput {
  readonly userId: string;
  readonly challengeId: string;
  readonly submissionId: string;
  readonly score: number;
  /** Vrai lorsque cette soumission bat le record personnel du joueur. */
  readonly isRecord: boolean;
}

export interface BossRewardInput {
  readonly bossId: string;
  readonly subjectType: 'player' | 'team';
  readonly subjectId: string;
  readonly recipientIds: string[];
  readonly rewards: Prisma.JsonValue | null;
}

/** Bits annoncés pour un score : 10 % du score, au moins 1. */
export function bitsForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.max(1, Math.round(score / 10));
}

/** Bits quotidiens d'une série, plafonnés à une semaine. */
export function bitsForStreak(streakDays: number): number {
  return Math.min(Math.max(0, Math.floor(streakDays)), 7);
}

function utcDay(value: string | Date): number {
  const date = value instanceof Date ? value : new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Longueur de la série de connexions se terminant aujourd'hui ou hier.
 * Plusieurs connexions le même jour ne comptent qu'une fois.
 */
export function consecutiveDays(dates: readonly (string | Date)[], today: Date): number {
  const days = new Set(dates.map(utcDay));
  if (days.size === 0) return 0;
  const current = utcDay(today);
  const dayMs = 86_400_000;
  const latest = Math.max(...days);
  if (latest !== current && latest !== current - dayMs) return 0;
  let streak = 0;
  for (let day = latest; days.has(day); day -= dayMs) streak += 1;
  return streak;
}

/** Lit la composante `bits` d'un bloc `rewards` JSON hétérogène. */
export function bitsFromRewards(raw: unknown): number {
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) return Math.max(0, raw);
  if (Array.isArray(raw)) {
    return raw.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum;
      const entry = item as Record<string, unknown>;
      return entry.kind === 'bits' ? sum + bitsFromRewards(entry.amount) : sum;
    }, 0);
  }
  if (raw && typeof raw === 'object') {
    const entry = raw as Record<string, unknown>;
    if ('bits' in entry) return bitsFromRewards(entry.bits);
    if ('amount' in entry) return bitsFromRewards(entry.amount);
  }
  return 0;
}

/**
 * Attribution des Bits (T191, FR-072). Les idempotence keys dérivées de la
 * soumission ou de l'engagement garantissent un versement unique, y compris
 * si le consommateur de verdict rejoue un job.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ledger: LedgerService,
    private readonly badges: BadgesService
  ) {}

  /**
   * Récompense de défi : une seule fois par défi, sauf bonus de record
   * personnel. Le premier versement et le bonus utilisent deux clés distinctes.
   */
  async awardChallenge(input: ChallengeRewardInput): Promise<void> {
    if (input.score <= 0) return;

    const previous = await this.prisma.submission.count({
      where: {
        userId: input.userId,
        challengeId: input.challengeId,
        status: 'passed',
        id: { not: input.submissionId }
      }
    });
    if (previous === 0) {
      await this.ledger.credit({
        userId: input.userId,
        amount: bitsForScore(input.score),
        reason: 'challenge_reward',
        idempotencyKey: `challenge:${input.submissionId}`,
        referenceType: 'challenge',
        referenceId: input.challengeId
      });
    }
    if (input.isRecord) {
      await this.ledger.credit({
        userId: input.userId,
        amount: Math.max(1, Math.round(bitsForScore(input.score) / 2)),
        reason: 'record_bonus',
        idempotencyKey: `record:${input.submissionId}`,
        referenceType: 'challenge',
        referenceId: input.challengeId
      });
    }
    await this.badges.evaluate(input.userId);
  }

  /** Récompense d'événement, créditée une seule fois par participant. */
  async awardEvent(input: {
    eventId: string;
    userId: string;
    rewards: Prisma.JsonValue | null;
  }): Promise<void> {
    const bits = bitsFromRewards(input.rewards);
    if (bits <= 0) return;
    await this.ledger.credit({
      userId: input.userId,
      amount: bits,
      reason: 'event_reward',
      idempotencyKey: `event:${input.eventId}:${input.userId}`,
      referenceType: 'event',
      referenceId: input.eventId
    });
  }

  /** Récompense de boss, répartie entre les membres d'un raid. */
  async awardBoss(input: BossRewardInput): Promise<void> {
    const bits = bitsFromRewards(input.rewards);
    if (bits <= 0) return;
    for (const userId of input.recipientIds) {
      const suffix = input.subjectType === 'team' ? `${input.subjectId}:${userId}` : userId;
      await this.ledger.credit({
        userId,
        amount: bits,
        reason: 'boss_reward',
        idempotencyKey: `boss:${input.bossId}:${suffix}`,
        referenceType: 'boss',
        referenceId: input.bossId
      });
      await this.badges.evaluate(userId);
    }
  }

  /**
   * Série de connexions (FR-072) : un versement par jour au plus, plafonné à
   * sept Bits. La clé d'idempotence contient le jour UTC, donc un second login
   * le même jour ne crédite rien de plus.
   */
  async awardStreak(userId: string): Promise<void> {
    const now = this.clock.now();
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true }
    });
    const previous = wallet
      ? await this.prisma.transaction.findMany({
          where: { walletId: wallet.id, reason: 'streak' },
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 400
        })
      : [];
    const streak = consecutiveDays(
      previous.map((transaction) => transaction.createdAt),
      now
    );
    await this.ledger.credit({
      userId,
      amount: bitsForStreak(streak + 1),
      reason: 'streak',
      idempotencyKey: `streak:${userId}:${now.toISOString().slice(0, 10)}`,
      referenceType: 'user',
      referenceId: userId
    });
  }
}
