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
import type { DecryptionInstanceView } from './instance.service';
import { PrerequisiteCheckService } from './prerequisite-check.service';

export interface ChallengeSummary {
  id: string;
  title: string;
  theme: string;
  type: string;
  difficulty: number;
  status: 'locked' | 'available' | 'completed';
  bestScore: number | null;
  missingPrerequisites?: string[];
}

export interface ChallengeDetail extends ChallengeSummary {
  statement: string;
  languages: string[];
  basePoints: number;
  perfMax: number;
  currentVersion: number;
  /** Défi de débogage : code à corriger, sans indication du bug ni correction. */
  buggyCode: string | null;
  maxModifiedLines: number | null;
  /** Défi de décryptage : instance générée pour ce joueur (jamais la graine). */
  cipher: string | null;
  instance?: DecryptionInstanceView;
  /** Le contenu n’est présent que pour un indice acheté par l’appelant (FR-042). */
  hints: Array<{
    id: string;
    order: number;
    priceBits: number;
    purchased: boolean;
    content?: string;
  }>;
  missingPrerequisites: string[];
}

export interface AttemptView {
  id: string;
  challengeId: string;
  startedAt: string;
  expiredAt: string;
  verdictAt: string | null;
}

export interface CatalogQuery {
  theme?: string;
  difficulty?: number;
  type?: string;
  status?: 'locked' | 'available' | 'completed';
  cursor?: string;
  limit?: number;
}

/**
 * Catalogue (US2, US5) : lecture publique des défis publiés, filtrage thématique
 * et évaluation des prérequis (FR-021 → FR-026).
 */
@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prerequisiteCheck: PrerequisiteCheckService
  ) {}

  async list(
    query: CatalogQuery,
    userId?: string
  ): Promise<{
    items: ChallengeSummary[];
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const challenges = await this.prisma.challenge.findMany({
      where: {
        status: 'published',
        difficulty: query.difficulty,
        type: query.type as never,
        theme: query.theme ? { slug: query.theme } : undefined
      },
      orderBy: [{ difficulty: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        type: true,
        difficulty: true,
        theme: { select: { name: true } },
        prerequisites: {
          select: {
            requiredChallengeId: true,
            requiredLevel: true,
            requiredLessonId: true,
            requiredLoreChapterId: true,
            requiredChallenge: { select: { title: true } },
            requiredLesson: { select: { title: true } },
            requiredLoreChapter: { select: { title: true } }
          }
        }
      }
    });

    const page = challenges.slice(0, limit);
    const bestScores = userId
      ? await this.bestScoresFor(
          userId,
          page.map((challenge) => challenge.id)
        )
      : new Map<string, number>();

    const evaluations = await this.prerequisiteCheck.evaluateMany(page, userId);

    const items: ChallengeSummary[] = page.map((challenge) => {
      const evaluation = evaluations.get(challenge.id) ?? {
        status: 'available',
        missingPrerequisites: []
      };
      return {
        id: challenge.id,
        title: challenge.title,
        theme: challenge.theme.name,
        type: challenge.type,
        difficulty: challenge.difficulty,
        status: evaluation.status,
        bestScore: bestScores.get(challenge.id) ?? null,
        missingPrerequisites:
          evaluation.missingPrerequisites.length > 0 ? evaluation.missingPrerequisites : undefined
      };
    });

    const filtered = query.status ? items.filter((item) => item.status === query.status) : items;

    return {
      items: filtered,
      nextCursor: challenges.length > limit ? (page[page.length - 1]?.id ?? null) : null
    };
  }

  async detail(challengeId: string, userId?: string): Promise<ChallengeDetail> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        title: true,
        type: true,
        difficulty: true,
        status: true,
        statementMd: true,
        languages: true,
        basePoints: true,
        perfMax: true,
        currentVersion: true,
        buggyCode: true,
        maxModifiedLines: true,
        cipher: true,
        theme: { select: { name: true } }
      }
    });

    if (!challenge) {
      throw new NotFoundException({ code: 'CHALLENGE_NOT_FOUND', message: 'Défi introuvable' });
    }
    if (challenge.status !== 'published') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Ce défi n’est pas encore publié'
      });
    }

    const evaluation = await this.prerequisiteCheck.evaluate(challengeId, userId);

    if (evaluation.status === 'locked') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Prérequis non satisfaits pour accéder à ce défi',
        // Le filtre global normalise toutes les erreurs au format
        // { code, message, details } (T026) : les motifs sont donc portés par
        // `details`, et non par une clé racine qui serait perdue.
        details: { missingPrerequisites: evaluation.missingPrerequisites }
      });
    }

    const [bestScores, hints, purchases] = await Promise.all([
      userId
        ? this.bestScoresFor(userId, [challenge.id])
        : Promise.resolve(new Map<string, number>()),
      this.prisma.challengeHint.findMany({
        where: { challengeId },
        orderBy: { order: 'asc' },
        select: { id: true, order: true, content: true, priceBits: true }
      }),
      userId
        ? this.prisma.hintPurchase.findMany({
            where: { userId, challengeId },
            select: { hintId: true }
          })
        : Promise.resolve([])
    ]);
    const purchasedIds = new Set(purchases.map((purchase) => purchase.hintId));

    return {
      id: challenge.id,
      title: challenge.title,
      theme: challenge.theme.name,
      type: challenge.type,
      difficulty: challenge.difficulty,
      status: evaluation.status,
      bestScore: bestScores.get(challenge.id) ?? null,
      statement: challenge.statementMd,
      languages: challenge.languages,
      basePoints: challenge.basePoints,
      perfMax: challenge.perfMax,
      currentVersion: challenge.currentVersion,
      // Aucun test caché, aucune correction et aucune graine ne sont exposés.
      buggyCode: challenge.type === 'debugging' ? challenge.buggyCode : null,
      maxModifiedLines: challenge.maxModifiedLines,
      cipher: challenge.type === 'decryption' ? challenge.cipher : null,
      hints: hints.map((hint) => {
        const purchased = purchasedIds.has(hint.id);
        return {
          id: hint.id,
          order: hint.order,
          priceBits: hint.priceBits,
          purchased,
          ...(purchased ? { content: hint.content } : {})
        };
      }),
      missingPrerequisites: []
    };
  }

  /**
   * Démarre explicitement l'unique essai d'un joueur (FR-039, FR-062, A5).
   * Le chrono part d'ici, jamais de l'ouverture de la page ni de la soumission.
   */
  async startAttempt(challengeId: string, user: AuthenticatedUser): Promise<AttemptView> {
    if (user.status === 'pending') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour démarrer un essai'
      });
    }

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { id: true, status: true, tMaxMs: true }
    });
    if (!challenge) {
      throw new NotFoundException({ code: 'CHALLENGE_NOT_FOUND', message: 'Défi introuvable' });
    }
    if (challenge.status !== 'published') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Ce défi n’est pas encore publié'
      });
    }

    const evaluation = await this.prerequisiteCheck.evaluate(challengeId, user.id);
    if (evaluation.status === 'locked') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Prérequis non satisfaits pour accéder à ce défi',
        details: { missingPrerequisites: evaluation.missingPrerequisites }
      });
    }

    const key = { challengeId_userId: { challengeId, userId: user.id } };
    const existing = await this.prisma.challengeAttempt.findUnique({ where: key });
    if (existing) {
      // A5 : une seule tentative par défi est autorisée en v1.
      throw new ConflictException({
        code: 'ATTEMPT_ALREADY_STARTED',
        message: 'Une seule tentative est autorisée pour ce défi'
      });
    }

    const startedAt = new Date();
    const attempt = await this.prisma.challengeAttempt.create({
      data: {
        id: uuidv7(),
        challengeId,
        userId: user.id,
        startedAt,
        expiredAt: new Date(startedAt.getTime() + challenge.tMaxMs)
      }
    });

    return {
      id: attempt.id,
      challengeId: attempt.challengeId,
      startedAt: attempt.startedAt.toISOString(),
      expiredAt: attempt.expiredAt.toISOString(),
      verdictAt: attempt.verdictAt?.toISOString() ?? null
    };
  }

  /** Vérifie qu'un défi est jouable par l'utilisateur (langage, publication, prérequis). */
  async requirePlayable(
    challengeId: string,
    language: string,
    userId?: string
  ): Promise<{
    id: string;
    currentVersion: number;
    basePoints: number;
    perfMax: number;
    tOptMs: number;
    tMaxMs: number;
    languages: string[];
    type: string;
    buggyCode: string | null;
    maxModifiedLines: number | null;
  }> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        status: true,
        currentVersion: true,
        basePoints: true,
        perfMax: true,
        tOptMs: true,
        tMaxMs: true,
        languages: true,
        type: true,
        buggyCode: true,
        maxModifiedLines: true
      }
    });

    if (!challenge) {
      throw new NotFoundException({ code: 'CHALLENGE_NOT_FOUND', message: 'Défi introuvable' });
    }
    if (challenge.status !== 'published') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Ce défi n’est pas encore publié'
      });
    }

    const evaluation = await this.prerequisiteCheck.evaluate(challengeId, userId);
    if (evaluation.status === 'locked') {
      throw new ForbiddenException({
        code: 'CHALLENGE_LOCKED',
        message: 'Ce défi est verrouillé : prérequis non satisfaits',
        details: { missingPrerequisites: evaluation.missingPrerequisites }
      });
    }

    if (!challenge.languages.includes(language)) {
      throw new BadRequestException({
        code: 'LANGUAGE_NOT_SUPPORTED',
        message: 'Ce langage n’est pas supporté par le défi'
      });
    }
    return challenge;
  }

  private async bestScoresFor(
    userId: string,
    challengeIds: string[]
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.bestScore.findMany({
      where: { subjectType: 'player', subjectId: userId, challengeId: { in: challengeIds } },
      select: { challengeId: true, score: true }
    });
    return new Map(rows.map((row) => [row.challengeId, Number(row.score)]));
  }
}
