import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonsService } from './lessons.service';
import { gradeQuiz, parsePositioningTest, type QuizAnswers } from './quiz';

export interface PositioningResult {
  score: number;
  passed: boolean;
  exempted: boolean;
  source: 'positioning' | null;
}

/**
 * Test de positionnement (T134, FR-052) : un compte confirmé peut être dispensé
 * d'un cours en réussissant le banc de questions. Un échec ne modifie jamais la
 * progression et laisse le cours obligatoire. Chaque tentative est tracée.
 */
@Injectable()
export class PositioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lessons: LessonsService,
    private readonly audit: AuditService
  ) {}

  async attempt(lessonId: string, userId: string, answers: QuizAnswers): Promise<PositioningResult> {
    await this.lessons.assertConfirmed(userId);
    await this.assertNotExempted(lessonId, userId);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, status: 'published' },
      select: { id: true, positioningTest: true }
    });
    if (!lesson) {
      throw new NotFoundException({ code: 'LESSON_NOT_FOUND', message: 'Leçon introuvable' });
    }

    const test = parsePositioningTest(lesson.positioningTest);
    if (!test) {
      throw new BadRequestException({
        code: 'POSITIONING_UNAVAILABLE',
        message: 'Aucun test de positionnement n’est disponible pour cette leçon'
      });
    }

    const grade = gradeQuiz(test, answers, 'positioning');
    await this.audit.record({
      actorId: userId,
      action: grade.passed ? 'lesson.positioning.passed' : 'lesson.positioning.failed',
      targetType: 'lesson',
      targetId: lessonId,
      metadata: {
        score: grade.score,
        correct: grade.correct,
        total: grade.total,
        passScore: test.passScore
      }
    });

    if (!grade.passed) {
      return { score: grade.score, passed: false, exempted: false, source: null };
    }

    const completedAt = new Date();
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, status: 'completed', quizScore: grade.score, completedAt },
      update: { status: 'completed', quizScore: grade.score, completedAt }
    });

    return { score: grade.score, passed: true, exempted: true, source: 'positioning' };
  }

  /** Empêche les tentatives répétées une fois la dispense obtenue. */
  async assertNotExempted(lessonId: string, userId: string): Promise<void> {
    const passed = await this.prisma.auditLog.findFirst({
      where: {
        actorId: userId,
        action: 'lesson.positioning.passed',
        targetType: 'lesson',
        targetId: lessonId
      },
      select: { id: true }
    });
    if (passed) {
      throw new ForbiddenException({
        code: 'LESSON_ALREADY_EXEMPTED',
        message: 'Une dispense a déjà été obtenue pour cette leçon'
      });
    }
  }
}
