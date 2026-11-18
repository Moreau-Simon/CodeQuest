import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions } from 'bullmq';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { SubmissionsGateway } from '../../realtime/submissions.gateway';
import { LeaderboardService } from '../leaderboards/leaderboard.service';
import { ScoringService } from '../scoring/scoring.service';
import type { SubmissionResult } from './submissions.types';

export const SUBMISSIONS_RESULTS_QUEUE_NAME = 'submissions-results';

/**
 * Consommateur des résultats du runner (T078).
 *
 * Met à jour la soumission et le meilleur score dans une transaction, puis
 * émet le verdict. Un job déjà terminal est acquitté sans réexécution
 * (idempotence de livraison Redis).
 */
@Injectable()
export class VerdictConsumer implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<SubmissionResult>;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly gateway: SubmissionsGateway,
    private readonly leaderboards: LeaderboardService
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SubmissionResult>(
      SUBMISSIONS_RESULTS_QUEUE_NAME,
      async (job) => this.handle(job.data),
      { connection: this.connection, concurrency: 4 }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async handle(result: SubmissionResult): Promise<void> {
    if (!result?.submissionId) return;

    if (result.kind === 'started') {
      await this.markStarted(result.submissionId);
      return;
    }
    if (!result.status) return;

    const submission = await this.prisma.submission.findUnique({
      where: { id: result.submissionId },
      include: {
        challenge: {
          select: { basePoints: true, perfMax: true, tOptMs: true, tMaxMs: true }
        }
      }
    });

    if (!submission) return;
    if (submission.status !== 'pending' && submission.status !== 'running') {
      // Doublon de livraison : le verdict a déjà été appliqué.
      return;
    }

    const testsTotal = result.testsTotal ?? 0;
    const testsPassed = Math.min(Math.max(result.testsPassed ?? 0, 0), testsTotal);
    const median = result.cpuTimeMedianMs ?? null;
    const scored =
      (result.status === 'passed' || result.status === 'failed') &&
      median !== null &&
      testsTotal > 0;

    const score = scored
      ? this.scoring.score({
          basePoints: submission.challenge.basePoints,
          perfMax: submission.challenge.perfMax,
          testsPassed,
          testsTotal,
          cpuTimeMedianMs: median,
          tOptMs: submission.challenge.tOptMs,
          tMaxMs: submission.challenge.tMaxMs
        })
      : 0;

    const finishedAt = new Date();

    const bestScoreChanged = await this.prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submission.id },
        data: {
          status: result.status,
          cpuTimesMs: result.cpuTimesMs ?? [],
          cpuTimeMedianMs: median,
          testsPassed,
          testsTotal,
          score,
          verdictReason: sanitizeReason(result.verdictReason),
          finishedAt
        }
      });

      const key = {
        challengeId: submission.challengeId,
        subjectType: 'player' as const,
        subjectId: submission.userId
      };
      const existing = await tx.bestScore.findUnique({
        where: { challengeId_subjectType_subjectId: key }
      });

      if (!existing || Number(existing.score) < score) {
        await tx.bestScore.upsert({
          where: { challengeId_subjectType_subjectId: key },
          create: {
            id: uuidv7(),
            ...key,
            score,
            submissionId: submission.id,
            achievedAt: finishedAt
          },
          update: {
            score,
            submissionId: submission.id,
            achievedAt: finishedAt
          }
        });
        return true;
      }
      return false;
    });

    // Après le commit PostgreSQL uniquement (T095) : le classement ne doit
    // jamais refléter un score non durable.
    if (bestScoreChanged) {
      await this.leaderboards.recordRetainedScore({
        userId: submission.userId,
        challengeId: submission.challengeId,
        achievedAt: finishedAt,
        teamId: submission.teamId,
        eventId: submission.eventId
      });
    }

    this.gateway.verdict(submission.userId, {
      submissionId: submission.id,
      status: result.status,
      score,
      cpuTimeMedianMs: median,
      testsPassed,
      testsTotal,
      verdictReason: sanitizeReason(result.verdictReason),
      isOfficial: submission.isOfficial
    });
  }

  private async markStarted(submissionId: string): Promise<void> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, attemptNo: true, status: true }
    });
    if (!submission || submission.status !== 'pending') return;

    await this.prisma.submission.update({
      where: { id: submission.id },
      data: { status: 'running', startedAt: new Date() }
    });
    this.gateway.started(submission.userId, submission.id, submission.attemptNo);
  }
}

/**
 * Ne divulgue jamais le contenu d'un test caché ni la solution attendue : on
 * ne conserve que la nature de l'échec (FR-029, FR-110).
 */
export function sanitizeReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return reason.replace(/(?:attendu|expected)[^.;\n]*/gi, 'résultat attendu masqué').slice(0, 500);
}
