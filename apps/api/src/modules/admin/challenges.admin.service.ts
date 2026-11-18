import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChallengeType } from '@prisma/client';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface TestCaseInput {
  input: string | number[] | Record<string, unknown>;
  expected: string | number[] | Record<string, unknown>;
  isHidden?: boolean;
  name?: string;
}

export interface CreateChallengeDraftInput {
  themeId: string;
  type: ChallengeType;
  difficulty: number;
  title: string;
  statement: string;
  languages: string[];
  basePoints: number;
  perfMax?: number;
  referenceSolution?: string;
  tests?: TestCaseInput[];
}

export interface UpdateChallengeInput {
  title?: string;
  statement?: string;
  difficulty?: number;
  basePoints?: number;
  perfMax?: number;
  languages?: string[];
  referenceSolution?: string;
  tests?: TestCaseInput[];
}

/**
 * Gestion administrative des défis (T104, FR-084, FR-087).
 *
 * - Création en brouillon (`draft`).
 * - Versionnement immuable des défis publiés : toute modification d'un défi
 *   publié incrémente `currentVersion` et crée une nouvelle ligne `ChallengeVersion`.
 * - Traçabilité dans le journal d'audit.
 */
@Injectable()
export class ChallengesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aes: AesGcmService,
    private readonly audit: AuditService
  ) {}

  async createDraft(actorId: string, input: CreateChallengeDraftInput) {
    const theme = await this.prisma.theme.findUnique({
      where: { id: input.themeId }
    });
    if (!theme) {
      throw new NotFoundException({
        code: 'THEME_NOT_FOUND',
        message: 'Thématique introuvable'
      });
    }

    const challengeId = uuidv7();
    const versionId = uuidv7();

    const cases = input.tests ?? [];
    const refSol = input.referenceSolution ?? '';

    const testsEncrypted = Uint8Array.from(this.aes.encrypt(JSON.stringify({ cases }), versionId));
    const refEncrypted = Uint8Array.from(this.aes.encrypt(refSol, versionId));

    const challenge = await this.prisma.challenge.create({
      data: {
        id: challengeId,
        themeId: input.themeId,
        type: input.type,
        difficulty: input.difficulty,
        title: input.title,
        statementMd: input.statement,
        languages: input.languages,
        basePoints: input.basePoints,
        perfMax: input.perfMax ?? 0,
        tOptMs: 100, // Valeurs provisoires avant calibrage automatique
        tMaxMs: 1_000,
        status: 'draft',
        currentVersion: 1,
        createdBy: actorId,
        versions: {
          create: {
            id: versionId,
            version: 1,
            statementSnapshot: input.statement,
            testsEncrypted,
            referenceSolutionEncrypted: refEncrypted,
            keyId: this.aes.keyId,
            createdBy: actorId
          }
        }
      }
    });

    await this.audit.record({
      actorId,
      action: 'challenge.created',
      targetType: 'challenge',
      targetId: challengeId,
      metadata: { title: input.title, type: input.type, difficulty: input.difficulty }
    });

    return challenge;
  }

  async update(challengeId: string, actorId: string, patch: UpdateChallengeInput) {
    const existing = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1
        }
      }
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'CHALLENGE_NOT_FOUND',
        message: 'Défi introuvable'
      });
    }

    const shouldVersion =
      existing.status === 'published' &&
      (patch.statement !== undefined ||
        patch.tests !== undefined ||
        patch.referenceSolution !== undefined);

    if (shouldVersion) {
      const nextVersion = existing.currentVersion + 1;
      const newVersionId = uuidv7();

      const lastVersion = existing.versions[0];
      let testsEncrypted = lastVersion?.testsEncrypted;
      let refEncrypted = lastVersion?.referenceSolutionEncrypted;

      if (patch.tests) {
        testsEncrypted = Uint8Array.from(
          this.aes.encrypt(JSON.stringify({ cases: patch.tests }), newVersionId)
        );
      }
      if (patch.referenceSolution) {
        refEncrypted = Uint8Array.from(this.aes.encrypt(patch.referenceSolution, newVersionId));
      }

      const updated = await this.prisma.challenge.update({
        where: { id: challengeId },
        data: {
          title: patch.title ?? existing.title,
          difficulty: patch.difficulty ?? existing.difficulty,
          statementMd: patch.statement ?? existing.statementMd,
          basePoints: patch.basePoints ?? existing.basePoints,
          perfMax: patch.perfMax ?? existing.perfMax,
          languages: patch.languages ?? existing.languages,
          currentVersion: nextVersion,
          versions: {
            create: {
              id: newVersionId,
              version: nextVersion,
              statementSnapshot: patch.statement ?? existing.statementMd,
              testsEncrypted,
              referenceSolutionEncrypted: refEncrypted,
              keyId: this.aes.keyId,
              createdBy: actorId
            }
          }
        }
      });

      await this.audit.record({
        actorId,
        action: 'challenge.version_bumped',
        targetType: 'challenge',
        targetId: challengeId,
        metadata: { newVersion: nextVersion }
      });

      return updated;
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        title: patch.title,
        difficulty: patch.difficulty,
        statementMd: patch.statement,
        basePoints: patch.basePoints,
        perfMax: patch.perfMax,
        languages: patch.languages
      }
    });

    await this.audit.record({
      actorId,
      action: 'challenge.updated',
      targetType: 'challenge',
      targetId: challengeId,
      metadata: { fields: Object.keys(patch) }
    });

    return updated;
  }

  async archive(challengeId: string, actorId: string) {
    const challenge = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { status: 'archived' }
    });

    await this.audit.record({
      actorId,
      action: 'challenge.archived',
      targetType: 'challenge',
      targetId: challengeId
    });

    return challenge;
  }
}
