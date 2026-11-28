import { uuidv7 } from '../../src/common/uuid';
import { MetricsService } from '../../src/common/metrics/metrics.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PrerequisiteCheckService } from '../../src/modules/challenges/prerequisite-check.service';
import { AnalyticsService } from '../../src/modules/lessons/analytics.service';
import { LessonsService } from '../../src/modules/lessons/lessons.service';
import { XpService } from '../../src/modules/lessons/xp.service';
import { DEFAULT_XP_CURVE, levelForXp } from '../../src/modules/lessons/xp-curve';
import { AuditService } from '../../src/modules/audit/audit.service';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T130 [P] [US6] Tests d'intégration progression, mini-quiz, XP et analytics
 * (FR-051 → FR-054, SC-010). Chaque suite démarre sur une base éphémère migrée.
 */
describe('Cours, progression et niveaux (T130)', () => {
  let infra: TestInfrastructure;
  let prisma: PrismaService;
  let lessons: LessonsService;
  let xp: XpService;
  let analytics: AnalyticsService;
  let checks: PrerequisiteCheckService;
  let themeId: string;
  let userId: string;

  const quiz = {
    passScore: 70,
    questions: [
      {
        id: 'q1',
        prompt: 'Quel est le premier index ?',
        choices: ['0', '1'],
        answerIndex: 0
      },
      {
        id: 'q2',
        prompt: 'Taille d’un tableau ?',
        choices: ['len()', 'size()'],
        answerIndex: 0
      }
    ]
  };

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    process.env.DATABASE_URL = infra.databaseUrl;
    prisma = new PrismaService();
    await prisma.$connect();

    const audit = new AuditService(prisma);
    lessons = new LessonsService(prisma, audit);
    xp = new XpService(prisma, audit);
    analytics = new AnalyticsService(prisma, audit, new MetricsService());
    checks = new PrerequisiteCheckService(prisma);

    themeId = uuidv7();
    await prisma.theme.create({
      data: { id: themeId, slug: 'us6-cours', name: 'Cours US6' }
    });
    userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: 'us6-player@example.com',
        pseudonym: 'us6-player',
        passwordHash: 'dummy',
        status: 'active',
        emailVerifiedAt: new Date()
      }
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await infra?.stop();
  });

  async function createLesson(slug: string): Promise<string> {
    const id = uuidv7();
    await prisma.lesson.create({
      data: {
        id,
        themeId,
        slug,
        title: `Leçon ${slug}`,
        contentMd: '# Leçon\n\nContenu de démonstration.',
        order: 1,
        status: 'published',
        quiz
      }
    });
    return id;
  }

  it('conserve la progression après échec puis réussite du quiz (FR-051, FR-053)', async () => {
    const lessonId = await createLesson('quiz-progression');
    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Application du cours',
        statementMd: 'Appliquez la leçon',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: { create: { id: uuidv7(), requiredLessonId: lessonId } }
      }
    });

    const detail = await lessons.detail(lessonId, userId);
    expect(detail.quiz?.questions).toHaveLength(2);
    expect(detail.quiz?.questions[0]).not.toHaveProperty('answerIndex');
    expect(detail.applicationChallenge?.id).toBe(challengeId);

    const started = await lessons.start(lessonId, userId);
    expect(started.status).toBe('in_progress');

    const failed = await lessons.quiz(lessonId, userId, { q1: 1, q2: 1 });
    expect(failed.passed).toBe(false);
    expect(failed.score).toBe(0);

    const passed = await lessons.quiz(lessonId, userId, { q1: 0, q2: 0 });
    expect(passed.passed).toBe(true);
    expect(passed.score).toBe(100);

    const completed = await lessons.complete(lessonId, userId, { quizScore: 100 });
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();
    expect(completed.applicationChallenge?.id).toBe(challengeId);

    const stored = await prisma.lessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId, lessonId } }
    });
    expect(stored.status).toBe('completed');
    expect(stored.quizScore).toBe(100);
    expect(stored.completedAt).not.toBeNull();

    // Le défi d'application se débloque dès que la leçon est terminée.
    const evaluation = await checks.evaluate(challengeId, userId);
    expect(evaluation.status).toBe('available');
  });

  it('refuse une auto-déclaration de score sans tentative de quiz enregistrée', async () => {
    const otherLessonId = await createLesson('quiz-obligeant');
    await expect(lessons.complete(otherLessonId, userId, { quizScore: 100 })).rejects.toMatchObject({
      response: { code: 'LESSON_QUIZ_REQUIRED' }
    });
  });

  it('attribue l’XP une seule fois par défi, recalcule le niveau et débloque le lore', async () => {
    const chapterId = uuidv7();
    await prisma.loreChapter.create({
      data: {
        id: chapterId,
        slug: 'zone-niveau-2',
        title: 'Zone du niveau 2',
        contentMd: '# Lore',
        requiredLevel: 2
      }
    });
    const challengeId = uuidv7();
    const playerId = uuidv7();
    await prisma.user.create({
      data: {
        id: playerId,
        email: 'us6-xp@example.com',
        pseudonym: 'us6-xp',
        passwordHash: 'dummy',
        status: 'active',
        emailVerifiedAt: new Date()
      }
    });

    expect(levelForXp(150, { ...DEFAULT_XP_CURVE })).toBe(2);
    const first = await xp.awardForChallenge({ userId: playerId, challengeId, score: 150 });
    expect(first.awarded).toBe(true);
    expect(first.granted).toBe(150);
    expect(first.level).toBe(2);

    const second = await xp.awardForChallenge({ userId: playerId, challengeId, score: 150 });
    expect(second.awarded).toBe(false);
    expect(second.granted).toBe(0);
    expect(second.xp).toBe(150);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: playerId } });
    expect(stored.xp).toBe(150);
    expect(stored.level).toBe(2);
    const unlocked = await prisma.loreProgress.findUnique({
      where: { userId_chapterId: { userId: playerId, chapterId } }
    });
    expect(unlocked).not.toBeNull();
  });

  it('mesure le taux de réussite au premier essai (SC-010)', async () => {
    const lessonId = await createLesson('analytics-premier-essai');
    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Défi suivi',
        statementMd: 'Suivi SC-010',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: { create: { id: uuidv7(), requiredLessonId: lessonId } }
      }
    });

    await analytics.recordChallengeVerdict({
      userId,
      challengeId,
      attemptNo: 1,
      passed: true,
      score: 200
    });
    await analytics.recordChallengeVerdict({
      userId,
      challengeId,
      attemptNo: 2,
      passed: true,
      score: 200
    });

    const stats = await analytics.firstAttemptSuccessRate(lessonId);
    expect(stats.attempts).toBe(1);
    expect(stats.successes).toBe(1);
    expect(stats.rate).toBe(1);
  });
});
