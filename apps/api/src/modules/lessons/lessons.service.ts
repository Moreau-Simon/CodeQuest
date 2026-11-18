import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { gradeQuiz, parsePositioningTest, publicQuiz, type PublicQuiz, type QuizAnswers } from './quiz';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgressView {
  status: LessonStatus;
  quizScore: number | null;
  completedAt: string | null;
}

export interface LessonSummary {
  id: string;
  title: string;
  theme: string;
  order: number;
  estimatedMinutes: number;
  status: LessonStatus;
  positioningTestAvailable: boolean;
  applicationChallenge: { id: string; title: string } | null;
  progress: LessonProgressView;
}

export interface LessonDetail extends LessonSummary {
  contentMd: string;
  quiz: PublicQuiz | null;
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

export interface CompleteResult {
  lessonId: string;
  status: LessonStatus;
  quizScore: number;
  completedAt: string;
  xp: number;
  level: number;
  applicationChallenge: { id: string; title: string } | null;
}

const LESSON_INCLUDE = Prisma.validator<Prisma.LessonInclude>()({
  theme: { select: { name: true } },
  prerequisites: {
    where: { challenge: { status: 'published' } },
    select: { challenge: { select: { id: true, title: true } } },
    take: 1
  }
});

type LessonRecord = Prisma.LessonGetPayload<{ include: typeof LESSON_INCLUDE }>;

/**
 * Cours, quiz et progression (T133, FR-051 → FR-053).
 * Les leçons publiées sont lisibles sans compte ; toute action d'écriture
 * exige un compte confirmé (FR-003, clarification 3).
 */
@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(userId?: string, theme?: string): Promise<LessonSummary[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: { status: 'published', ...(theme ? { theme: { slug: theme } } : {}) },
      orderBy: [{ order: 'asc' }, { title: 'asc' }],
      include: LESSON_INCLUDE
    });
    const progress = await this.progressFor(userId, lessons.map((lesson) => lesson.id));
    return lessons.map((lesson) => this.toSummary(lesson, progress.get(lesson.id)));
  }

  async detail(lessonId: string, userId?: string): Promise<LessonDetail> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, status: 'published' },
      include: LESSON_INCLUDE
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Leçon introuvable' });
    }

    const progress = await this.progressFor(userId, [lesson.id]);
    const test = parsePositioningTest(lesson.positioningTest);
    return {
      ...this.toSummary(lesson, progress.get(lesson.id)),
      contentMd: lesson.contentMd,
      quiz: test ? publicQuiz(test, 'quiz') : null
    };
  }

  /** Démarre explicitement une leçon (état de lecture, FR-053). */
  async start(lessonId: string, userId: string): Promise<LessonProgressView> {
    await this.assertConfirmed(userId);
    const lesson = await this.publishedLesson(lessonId);
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } }
    });

    if (!existing) {
      await this.prisma.lessonProgress.create({
        data: { userId, lessonId, status: 'in_progress' }
      });
      await this.audit.record({
        actorId: userId,
        action: 'lesson.started',
        targetType: 'lesson',
        targetId: lesson.id
      });
      return { status: 'in_progress', quizScore: null, completedAt: null };
    }
    if (existing.status === 'completed') return this.toProgressView(existing);
    if (existing.status !== 'in_progress') {
      await this.prisma.lessonProgress.update({
        where: { userId_lessonId: { userId, lessonId } },
        data: { status: 'in_progress' }
      });
    }
    return this.toProgressView(existing);
  }

  /** Note le mini-quiz sans valider la leçon (FR-051). */
  async quiz(lessonId: string, userId: string, answers: QuizAnswers): Promise<QuizResult> {
    await this.assertConfirmed(userId);
    const lesson = await this.publishedLesson(lessonId);
    const test = parsePositioningTest(lesson.positioningTest);
    if (!test) {
      throw new BadRequestException({
        code: 'LESSON_QUIZ_UNAVAILABLE',
        message: 'Cette leçon ne comporte pas de quiz'
      });
    }

    const result = gradeQuiz(test, answers, 'quiz');
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } }
    });
    if (!existing) {
      await this.prisma.lessonProgress.create({
        data: { userId, lessonId, status: 'in_progress', quizScore: result.score }
      });
    } else if (existing.status !== 'completed') {
      await this.prisma.lessonProgress.update({
        where: { userId_lessonId: { userId, lessonId } },
        data: { status: 'in_progress', quizScore: result.score }
      });
    }
    await this.audit.record({
      actorId: userId,
      action: 'lesson.quiz.attempted',
      targetType: 'lesson',
      targetId: lessonId,
      metadata: {
        score: result.score,
        correct: result.correct,
        total: result.total,
        passed: result.passed
      }
    });
    return result;
  }

  /**
   * Valide la leçon après réussite du quiz.
   * Sans réponses fournies, le score déclaré doit correspondre à une tentative
   * déjà enregistrée côté serveur : le client ne peut pas s'auto-dispenser.
   */
  async complete(
    lessonId: string,
    userId: string,
    input: { quizScore: number; answers?: QuizAnswers }
  ): Promise<CompleteResult> {
    await this.assertConfirmed(userId);
    const lesson = await this.publishedLesson(lessonId);
    const test = parsePositioningTest(lesson.positioningTest);
    if (!test) {
      throw new BadRequestException({
        code: 'LESSON_QUIZ_UNAVAILABLE',
        message: 'Cette leçon ne comporte pas de quiz'
      });
    }

    let effectiveScore = input.quizScore;
    if (input.answers) {
      const grade = gradeQuiz(test, input.answers, 'quiz');
      if (!grade.passed) {
        throw new ForbiddenException({
          code: 'LESSON_QUIZ_FAILED',
          message: 'Quiz non réussi : la leçon reste obligatoire',
          details: { score: grade.score, passScore: test.passScore }
        });
      }
      effectiveScore = grade.score;
    } else {
      const existing = await this.prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } }
      });
      if ((existing?.quizScore ?? 0) < test.passScore || input.quizScore > (existing?.quizScore ?? 0)) {
        throw new ForbiddenException({
          code: 'LESSON_QUIZ_REQUIRED',
          message: 'Réussissez le quiz avant de terminer la leçon'
        });
      }
    }

    const completedAt = new Date();
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, status: 'completed', quizScore: effectiveScore, completedAt },
      update: { status: 'completed', quizScore: effectiveScore, completedAt }
    });
    await this.audit.record({
      actorId: userId,
      action: 'lesson.completed',
      targetType: 'lesson',
      targetId: lessonId,
      metadata: { quizScore: effectiveScore, source: input.answers ? 'quiz' : 'declared' }
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { xp: true, level: true }
    });
    return {
      lessonId,
      status: 'completed',
      quizScore: effectiveScore,
      completedAt: completedAt.toISOString(),
      xp: user.xp,
      level: user.level,
      applicationChallenge: this.applicationChallenge(lesson)
    };
  }

  /** Vérifie qu'un compte peut écrire sa progression. */
  async assertConfirmed(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true, status: true }
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' });
    }
    if (user.status !== 'active' || !user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour suivre un cours'
      });
    }
  }

  private async publishedLesson(lessonId: string): Promise<LessonRecord> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, status: 'published' },
      include: LESSON_INCLUDE
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Leçon introuvable' });
    }
    return lesson;
  }

  private async progressFor(
    userId: string | undefined,
    lessonIds: string[]
  ): Promise<Map<string, { status: string; quizScore: number | null; completedAt: Date | null }>> {
    if (!userId || lessonIds.length === 0) return new Map();
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds } }
    });
    return new Map(rows.map((row) => [row.lessonId, row]));
  }

  private toSummary(
    lesson: LessonRecord,
    progress?: { status: string; quizScore: number | null; completedAt: Date | null }
  ): LessonSummary {
    return {
      id: lesson.id,
      title: lesson.title,
      theme: lesson.theme.name,
      order: lesson.order,
      estimatedMinutes: lesson.estimatedMinutes,
      status: progress?.status === 'in_progress' || progress?.status === 'completed'
        ? progress.status
        : 'not_started',
      positioningTestAvailable: Boolean(lesson.positioningTest),
      applicationChallenge: this.applicationChallenge(lesson),
      progress: progress
        ? this.toProgressView(progress)
        : { status: 'not_started', quizScore: null, completedAt: null }
    };
  }

  private toProgressView(progress: {
    status: string;
    quizScore: number | null;
    completedAt: Date | null;
  }): LessonProgressView {
    return {
      status:
        progress.status === 'in_progress' || progress.status === 'completed'
          ? progress.status
          : 'not_started',
      quizScore: progress.quizScore,
      completedAt: progress.completedAt ? progress.completedAt.toISOString() : null
    };
  }

  private applicationChallenge(lesson: LessonRecord): { id: string; title: string } | null {
    const challenge = lesson.prerequisites[0]?.challenge;
    return challenge ? { id: challenge.id, title: challenge.title } : null;
  }
}
