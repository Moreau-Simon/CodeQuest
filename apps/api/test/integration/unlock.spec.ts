import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { PrerequisiteCheckService } from '../../src/modules/challenges/prerequisite-check.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T118 [P] [US5] Tests d'intégration du déblocage de défis (FR-023, FR-025)
 * - Prérequis par niveau minimum (level)
 * - Prérequis par défi réussi (requiredChallenge)
 * - Prérequis par cours/leçon terminée (requiredLesson)
 * - Prérequis par chapitre de lore débloqué (requiredLoreChapter)
 * - Statut 'completed' pour un défi déjà réussi
 */
describe('Déblocage des défis et évaluation des prérequis (T118)', () => {
  let infra: TestInfrastructure;
  let prisma: PrismaClient;
  let checkService: PrerequisiteCheckService;

  let themeId: string;
  let userId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    checkService = new PrerequisiteCheckService(prisma as unknown as PrismaService);

    // Initialisation d'un thème
    themeId = uuidv7();
    await prisma.theme.create({
      data: { id: themeId, slug: 'tris-unlock', name: 'Algorithmes de tri' }
    });

    // Création d'un joueur
    userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: 'player-unlock@example.com',
        pseudonym: 'unlock-player',
        passwordHash: 'dummy',
        level: 1,
        status: 'active'
      }
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await infra?.stop();
  });

  it('débloque un défi conditionné par le niveau quand le joueur atteint le seuil (FR-023)', async () => {
    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 3,
        title: 'Tri Avancé',
        statementMd: 'Triez en O(n log n)',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: {
          create: {
            id: uuidv7(),
            requiredLevel: 3
          }
        }
      }
    });

    // Niveau joueur = 1 -> locked
    const evalLocked = await checkService.evaluate(challengeId, userId);
    expect(evalLocked.status).toBe('locked');
    expect(evalLocked.missingPrerequisites).toContain('Niveau 3 requis (niveau actuel : 1)');

    // Progression du niveau à 3 -> available
    await prisma.user.update({
      where: { id: userId },
      data: { level: 3 }
    });

    const evalUnlocked = await checkService.evaluate(challengeId, userId);
    expect(evalUnlocked.status).toBe('available');
    expect(evalUnlocked.missingPrerequisites).toHaveLength(0);
  });

  it('débloque un défi quand le défi prérequis est validé avec succès', async () => {
    const challengeAId = uuidv7();
    const challengeBId = uuidv7();

    await prisma.challenge.create({
      data: {
        id: challengeAId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Défi A (Bases)',
        statementMd: 'Tri simple',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published'
      }
    });

    await prisma.challenge.create({
      data: {
        id: challengeBId,
        themeId,
        type: 'sorting',
        difficulty: 2,
        title: 'Défi B (Suivant)',
        statementMd: 'Tri suite',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: {
          create: {
            id: uuidv7(),
            requiredChallengeId: challengeAId
          }
        }
      }
    });

    // Pas encore réussi le défi A -> Défi B est verrouillé
    const evalLocked = await checkService.evaluate(challengeBId, userId);
    expect(evalLocked.status).toBe('locked');
    expect(evalLocked.missingPrerequisites).toContain('Défi « Défi A (Bases) » requis');

    // Le joueur valide le défi A avec un score > 0
    await prisma.bestScore.create({
      data: {
        id: uuidv7(),
        challengeId: challengeAId,
        subjectType: 'player',
        subjectId: userId,
        score: 150,
        submissionId: uuidv7()
      }
    });

    const evalUnlocked = await checkService.evaluate(challengeBId, userId);
    expect(evalUnlocked.status).toBe('available');
    expect(evalUnlocked.missingPrerequisites).toHaveLength(0);
  });

  it('débloque un défi quand le cours associé est terminé', async () => {
    const lessonId = uuidv7();
    await prisma.lesson.create({
      data: {
        id: lessonId,
        themeId,
        slug: 'lesson-tris-1',
        title: 'Introduction aux Tris',
        contentMd: '# Intro'
      }
    });

    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Application du cours',
        statementMd: 'Appliquez le cours',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: {
          create: {
            id: uuidv7(),
            requiredLessonId: lessonId
          }
        }
      }
    });

    // Cours non suivi -> verrouillé
    const evalLocked = await checkService.evaluate(challengeId, userId);
    expect(evalLocked.status).toBe('locked');
    expect(evalLocked.missingPrerequisites).toContain('Cours « Introduction aux Tris » requis');

    // Le joueur termine la leçon
    await prisma.lessonProgress.create({
      data: {
        userId,
        lessonId,
        status: 'completed',
        completedAt: new Date()
      }
    });

    const evalUnlocked = await checkService.evaluate(challengeId, userId);
    expect(evalUnlocked.status).toBe('available');
    expect(evalUnlocked.missingPrerequisites).toHaveLength(0);
  });

  it('débloque un défi quand le chapitre de lore requis est débloqué', async () => {
    const chapterId = uuidv7();
    await prisma.loreChapter.create({
      data: {
        id: chapterId,
        slug: 'lore-chap-1',
        title: 'L’Éveil du Réseau',
        contentMd: '# Lore'
      }
    });

    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 2,
        title: 'Défi du Réseau',
        statementMd: 'Défi lore',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        prerequisites: {
          create: {
            id: uuidv7(),
            requiredLoreChapterId: chapterId
          }
        }
      }
    });

    // Lore non débloqué -> locked
    const evalLocked = await checkService.evaluate(challengeId, userId);
    expect(evalLocked.status).toBe('locked');
    expect(evalLocked.missingPrerequisites).toContain(
      'Chapitre de lore « L’Éveil du Réseau » requis'
    );

    // Le joueur débloque le chapitre
    await prisma.loreProgress.create({
      data: {
        userId,
        chapterId
      }
    });

    const evalUnlocked = await checkService.evaluate(challengeId, userId);
    expect(evalUnlocked.status).toBe('available');
    expect(evalUnlocked.missingPrerequisites).toHaveLength(0);
  });

  it('retourne le statut "completed" si le joueur a déjà réussi ce défi', async () => {
    const challengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Défi Déjà Fait',
        statementMd: 'Déjà réussi',
        languages: ['python', 'javascript'],
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published'
      }
    });

    await prisma.bestScore.create({
      data: {
        id: uuidv7(),
        challengeId,
        subjectType: 'player',
        subjectId: userId,
        score: 180,
        submissionId: uuidv7()
      }
    });

    const result = await checkService.evaluate(challengeId, userId);
    expect(result.status).toBe('completed');
    expect(result.missingPrerequisites).toHaveLength(0);
  });
});
