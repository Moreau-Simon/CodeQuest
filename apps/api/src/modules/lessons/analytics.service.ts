import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../common/metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const CHALLENGE_ATTEMPT_ACTION = 'analytics.challenge_attempt';

export interface FirstAttemptStats {
  attempts: number;
  successes: number;
  rate: number;
}

/**
 * Suivi analytique du taux de réussite au premier essai (T138, SC-010).
 * Les tentatives sont tracées dans le journal append-only (exploitable sans
 * entrepôt dédié) et comptées dans Prometheus en temps réel.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService
  ) {}

  async recordChallengeVerdict(input: {
    userId: string;
    challengeId: string;
    attemptNo: number;
    passed: boolean;
    score: number;
  }): Promise<void> {
    // Un défi d'application est relié à sa leçon par un prérequis de type lesson.
    const link = await this.prisma.challengePrerequisite.findFirst({
      where: { challengeId: input.challengeId, requiredLessonId: { not: null } },
      select: { requiredLessonId: true }
    });
    const firstAttempt = input.attemptNo === 1;
    await this.audit.record({
      actorId: input.userId,
      action: CHALLENGE_ATTEMPT_ACTION,
      targetType: 'challenge',
      targetId: input.challengeId,
      metadata: {
        attemptNo: input.attemptNo,
        firstAttempt,
        correct: input.passed,
        score: input.score,
        lessonId: link?.requiredLessonId ?? null
      }
    });
    if (firstAttempt) {
      this.metrics.countFirstAttempt(input.passed ? 'success' : 'failure');
    }
  }

  async firstAttemptSuccessRate(lessonId?: string): Promise<FirstAttemptStats> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: CHALLENGE_ATTEMPT_ACTION,
        ...(lessonId ? { metadata: { path: ['lessonId'], equals: lessonId } } : {})
      },
      select: { metadata: true }
    });

    let attempts = 0;
    let successes = 0;
    for (const row of rows) {
      const metadata = row.metadata as { firstAttempt?: unknown; correct?: unknown };
      if (metadata?.firstAttempt !== true) continue;
      attempts += 1;
      if (metadata.correct === true) successes += 1;
    }
    return {
      attempts,
      successes,
      rate: attempts === 0 ? 0 : Math.round((successes / attempts) * 10_000) / 10_000
    };
  }
}
