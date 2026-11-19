import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions } from 'bullmq';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { SubmissionsGateway } from '../../realtime/submissions.gateway';
import { LeaderboardService } from '../leaderboards/leaderboard.service';
import { AnalyticsService } from '../lessons/analytics.service';
import { XpService } from '../lessons/xp.service';
import { ResolutionScoringService } from '../scoring/resolution-scoring.service';
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
  private readonly logger = new Logger(VerdictConsumer.name);

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly resolutionScoring: ResolutionScoringService,
    private readonly gateway: SubmissionsGateway,
    private readonly leaderboards: LeaderboardService,
    private readonly xp: XpService,
    private readonly analytics: AnalyticsService
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
          select: {
            basePoints: true,
            perfMax: true,
            tOptMs: true,
            tMaxMs: true,
            type: true,
            maxModifiedLines: true
          }
        },
        attempt: true
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
    const finishedAt = new Date();

    // A5 : les défis de débogage/décryptage sont scorés sur le temps écoulé
    // depuis le `start` explicite, avec pénalités d'indices et de lignes.
    const timed =
      submission.challenge.type === 'debugging' ||
      submission.challenge.type === 'decryption';
    const verdictReached = result.status === 'passed' || result.status === 'failed';
    const scored =
      verdictReached && testsTotal > 0 && (timed ? submission.attempt !== null : median !== null);

    let score = 0;
    if (scored && timed && submission.attempt) {
      score = this.resolutionScoring.compute({
        basePoints: submission.challenge.basePoints,
        perfMax: submission.challenge.perfMax,
        testsPassed,
        testsTotal,
        startedAt: submission.attempt.startedAt,
        verdictAt: result.status === 'passed' ? finishedAt : undefined,
        expiredAt: submission.attempt.expiredAt,
        tOptMs: submission.challenge.tOptMs,
        tMaxMs: submission.challenge.tMaxMs,
        hintsUsed: submission.attempt.hintsUsed,
        attempts: 1,
        modifiedLines: submission.modifiedLines ?? 0,
        maxModifiedLines: submission.challenge.maxModifiedLines ?? undefined
      }).score;
    } else if (scored) {
      score = this.scoring.score({
        basePoints: submission.challenge.basePoints,
        perfMax: submission.challenge.perfMax,
        testsPassed,
        testsTotal,
        cpuTimeMedianMs: median ?? 0,
        tOptMs: submission.challenge.tOptMs,
        tMaxMs: submission.challenge.tMaxMs
      });
    }

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
          finishedAt,
          verdictAt: verdictReached ? finishedAt : null
        }
      });

      if (submission.attempt && verdictReached) {
        await tx.challengeAttempt.update({
          where: { id: submission.attempt.id },
          data: {
            verdictAt: finishedAt,
            modifiedLines: submission.modifiedLines,
            hintsUsed: submission.attempt.hintsUsed
          }
        });
      }

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

    // US6 (FR-054, SC-010) : ces effets ne doivent jamais faire échouer la
    // livraison d'un verdict déjà commité.
    try {
      if (result.status === 'passed' || result.status === 'failed') {
        await this.analytics.recordChallengeVerdict({
          userId: submission.userId,
          challengeId: submission.challengeId,
          attemptNo: submission.attemptNo,
          passed: result.status === 'passed',
          score
        });
      }
      if (result.status === 'passed' && score > 0) {
        await this.xp.awardForChallenge({
          userId: submission.userId,
          challengeId: submission.challengeId,
          score
        });
      }
    } catch (error) {
      this.logger.error('Impossible d’enregistrer XP/analytics pour le verdict', error as Error);
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
      select: { id: true, userId: true, attemptNo: true, status: true, attemptId: true }
    });
    if (!submission || submission.status !== 'pending') return;

    await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: 'running',
        // A5 : pour un essai explicite, le chrono a déjà démarré côté client.
        ...(submission.attemptId ? {} : { startedAt: new Date() })
      }
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
