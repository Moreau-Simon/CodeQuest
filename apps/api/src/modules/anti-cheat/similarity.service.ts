import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { logger } from '../../common/logging/logger';
import {
  createSimilarityJob,
  type SimilarityCandidate,
  type SimilarityStore
} from './similarity.job';
import type { SupportedLanguage } from './similarity';

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(['python', 'javascript', 'typescript']);
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Prisma adapter + planificateur du job de similarité (T255, FR-114). */
@Injectable()
export class SimilarityJobService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error: unknown) => {
        logger.error({ err: error }, 'Échec du balayage de similarité');
      });
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  sweep(): Promise<{ compared: number; findings: number; sanctioned: 0 }> {
    return createSimilarityJob(this.store()).sweep();
  }

  private store(): SimilarityStore {
    const prisma = this.prisma;
    return {
      async findRecent(limit = 500): Promise<readonly SimilarityCandidate[]> {
        const submissions = await prismaFindRecent(prisma, limit);
        return submissions
          .filter((submission) => SUPPORTED_LANGUAGES.has(submission.language as SupportedLanguage))
          .map((submission) => ({
            id: submission.id,
            challengeId: submission.challengeId,
            userId: submission.userId,
            language: submission.language as SupportedLanguage,
            code: submission.code,
            createdAt: submission.createdAt
          }));
      },
      async recordFinding(finding) {
        await prisma.similarityFinding.upsert({
          where: {
            challengeId_submissionAId_submissionBId: {
              challengeId: finding.challengeId,
              submissionAId: finding.submissionAId,
              submissionBId: finding.submissionBId
            }
          },
          create: {
            id: finding.id,
            challengeId: finding.challengeId,
            submissionAId: finding.submissionAId,
            submissionBId: finding.submissionBId,
            score: finding.score,
            evidence: { normalized: finding.evidence, score: finding.score },
            status: finding.status,
            review: finding.review
          },
          update: {}
        });
      }
    };
  }
}

function prismaFindRecent(prisma: PrismaService, limit: number) {
  return prisma.submission.findMany({
    where: { status: 'passed' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      challengeId: true,
      userId: true,
      language: true,
      code: true,
      createdAt: true
    }
  });
}
