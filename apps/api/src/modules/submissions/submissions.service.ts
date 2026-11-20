import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.module';
import { SubmissionsGateway } from '../../realtime/submissions.gateway';
import { ChallengesService } from '../challenges/challenges.service';
import { MembershipService } from '../teams/membership.service';
import { MAX_CODE_BYTES, SUBMISSION_LIMITS, type SubmissionJob } from './submissions.types';
import { DiffService } from './diff.service';

export interface SubmissionView {
  id: string;
  challengeId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'timeout' | 'rejected';
  score: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
  cpuTimeMedianMs: number | null;
  verdictReason: string | null;
  createdAt: string;
  attemptId: string | null;
  modifiedLines: number | null;
  hintsUsed: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Création et lecture des soumissions (T076, T077).
 *
 * - création en `pending`, enqueue BullMQ avec `jobId = submissionId` ;
 * - un compte non confirmé ne peut pas soumettre (FR-003) ;
 * - la clé `Idempotency-Key` (UUID) est réutilisée comme identifiant.
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
    private readonly queue: QueueService,
    private readonly gateway: SubmissionsGateway,
    private readonly diff: DiffService,
    private readonly membership: MembershipService
  ) {}

  async create(
    challengeId: string,
    user: AuthenticatedUser,
    input: { language: string; code: string; attemptId?: string; teamId?: string },
    idempotencyKey?: string
  ): Promise<SubmissionView> {
    this.requireWritable(user);

    if (typeof input.code !== 'string' || input.code.trim().length === 0) {
      throw new BadRequestException({ code: 'EMPTY_CODE', message: 'Le code est vide' });
    }
    if (Buffer.byteLength(input.code, 'utf8') > MAX_CODE_BYTES) {
      throw new BadRequestException({
        code: 'CODE_TOO_LARGE',
        message: 'Le code dépasse la taille maximale autorisée'
      });
    }

    // US8 (FR-060) : une soumission au titre d'une équipe exige d'en être
    // membre actif. Les scores déjà acquis restent, seules les nouvelles
    // contributions sont refusées (code NOT_TEAM_MEMBER).
    if (input.teamId) {
      await this.membership.assertCanContribute(input.teamId, user.id);
    }

    const challenge = await this.challenges.requirePlayable(challengeId, input.language, user.id);

    // A5 (FR-039) : un défi chronométré exige un `start` explicite. Le chrono
    // part de l'essai, jamais de l'ouverture de la page ni de la soumission.
    const timed = challenge.type === 'debugging' || challenge.type === 'decryption';
    let attempt: {
      id: string;
      userId: string;
      challengeId: string;
      startedAt: Date;
      expiredAt: Date;
      hintsUsed: number;
    } | null = null;
    if (timed) {
      if (!input.attemptId || !UUID_PATTERN.test(input.attemptId)) {
        throw new BadRequestException({
          code: 'ATTEMPT_REQUIRED',
          message: 'Démarrez explicitement un essai avant de soumettre'
        });
      }
      attempt = await this.prisma.challengeAttempt.findUnique({ where: { id: input.attemptId } });
      if (!attempt || attempt.userId !== user.id || attempt.challengeId !== challengeId) {
        throw new ForbiddenException({
          code: 'ATTEMPT_FORBIDDEN',
          message: 'Cet essai n’appartient pas à ce défi'
        });
      }
      if (attempt.expiredAt.getTime() <= Date.now()) {
        throw new ConflictException({
          code: 'ATTEMPT_EXPIRED',
          message: 'Le temps imparti pour cet essai est écoulé'
        });
      }
    }

    const modifiedLines =
      challenge.type === 'debugging' && challenge.buggyCode !== null
        ? this.diff.countModifiedLines(challenge.buggyCode, input.code)
        : null;

    const version = await this.prisma.challengeVersion.findUnique({
      where: {
        challengeId_version: { challengeId, version: challenge.currentVersion }
      },
      select: {
        id: true,
        testsEncrypted: true,
        keyId: true
      }
    });

    if (!version?.testsEncrypted) {
      throw new ConflictException({
        code: 'CHALLENGE_NOT_VALIDATED',
        message: 'Ce défi n’a pas encore de tests validés'
      });
    }

    const id = idempotencyKey && UUID_PATTERN.test(idempotencyKey) ? idempotencyKey : uuidv7();

    const existing = await this.prisma.submission.findUnique({ where: { id } });
    if (existing) {
      if (existing.userId !== user.id) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Clé d’idempotence déjà utilisée'
        });
      }
      return this.toView(existing);
    }

    const ciphertext = Buffer.from(version.testsEncrypted);
    const submission = await this.prisma.submission.create({
      data: {
        id,
        challengeId,
        challengeVersionId: version.id,
        userId: user.id,
        teamId: input.teamId ?? null,
        language: input.language,
        code: input.code,
        status: 'pending',
        cpuTimesMs: [],
        attemptId: attempt?.id ?? null,
        startedAt: attempt?.startedAt ?? null,
        modifiedLines,
        hintsUsed: attempt?.hintsUsed ?? 0
      }
    });

    const job: SubmissionJob = {
      jobId: id,
      submissionId: id,
      challengeId,
      challengeVersionId: version.id,
      language: input.language as 'python' | 'javascript',
      code: input.code,
      limits: { ...SUBMISSION_LIMITS },
      testsRef: {
        ciphertextKey: `s3://codequest-secrets/challenges/${version.id}/tests.enc`,
        keyId: version.keyId ?? 'v1',
        sha256: createHash('sha256').update(ciphertext).digest('hex'),
        ciphertextBase64: ciphertext.toString('base64')
      },
      runs: 5,
      mode: 'score',
      context: {
        subjectType: 'player',
        subjectId: user.id,
        eventId: null,
        isEventAttempt: false
      },
      enqueuedAt: new Date().toISOString()
    };

    await this.queue.enqueueSubmission(id, job as unknown as Record<string, unknown>, 'standard');
    this.gateway.queued(user.id, id, challengeId, 1);

    return this.toView(submission);
  }

  async get(submissionId: string, user: AuthenticatedUser): Promise<SubmissionView> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId }
    });

    if (!submission || (submission.userId !== user.id && !this.isAdmin(user))) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Soumission introuvable'
      });
    }

    return this.toView(submission);
  }

  private requireWritable(user: AuthenticatedUser): void {
    if (user.status === 'pending') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour soumettre une solution'
      });
    }
    if (user.status === 'suspended') {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Ce compte est suspendu'
      });
    }
  }

  private isAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes('admin') || user.permissions.has('submission:read_all');
  }

  private toView(submission: {
    id: string;
    challengeId: string;
    status: string;
    score: unknown;
    testsPassed: number | null;
    testsTotal: number | null;
    cpuTimeMedianMs: number | null;
    verdictReason: string | null;
    createdAt: Date;
    attemptId: string | null;
    modifiedLines: number | null;
    hintsUsed: number;
  }): SubmissionView {
    return {
      id: submission.id,
      challengeId: submission.challengeId,
      status: submission.status as SubmissionView['status'],
      score: submission.score === null ? null : Number(submission.score),
      testsPassed: submission.testsPassed,
      testsTotal: submission.testsTotal,
      cpuTimeMedianMs: submission.cpuTimeMedianMs,
      verdictReason: submission.verdictReason,
      createdAt: submission.createdAt.toISOString(),
      attemptId: submission.attemptId,
      modifiedLines: submission.modifiedLines,
      hintsUsed: submission.hintsUsed
    };
  }
}
