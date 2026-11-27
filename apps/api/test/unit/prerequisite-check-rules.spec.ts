import type { PrismaService } from '../../src/prisma/prisma.service';
import { PrerequisiteCheckService } from '../../src/modules/challenges/prerequisite-check.service';

/**
 * T264 — couverture de l'évaluation des prérequis (FR-023/025).
 * Mock Prisma minimal : aucune base n'est démarrée pour ces règles pures.
 */
const USER_ID = 'user-1';

type Prereq = {
  requiredChallengeId: string | null;
  requiredLevel: number | null;
  requiredLessonId: string | null;
  requiredLoreChapterId: string | null;
  requiredChallenge?: { title: string } | null;
  requiredLesson?: { title: string } | null;
  requiredLoreChapter?: { title: string } | null;
};

const prereq = (partial: Partial<Prereq> = {}): Prereq => ({
  requiredChallengeId: null,
  requiredLevel: null,
  requiredLessonId: null,
  requiredLoreChapterId: null,
  ...partial
});

describe('PrerequisiteCheckService (T264)', () => {
  const prisma = {
    challenge: { findUnique: jest.fn() },
    bestScore: { findUnique: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    lessonProgress: { findMany: jest.fn() },
    loreProgress: { findMany: jest.fn() }
  };
  let service: PrerequisiteCheckService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.challenge.findUnique.mockResolvedValue({ prerequisites: [] });
    prisma.bestScore.findUnique.mockResolvedValue(null);
    prisma.bestScore.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({ level: 1 });
    prisma.lessonProgress.findMany.mockResolvedValue([]);
    prisma.loreProgress.findMany.mockResolvedValue([]);
    service = new PrerequisiteCheckService(prisma as unknown as PrismaService);
  });

  it('verrouille un défi introuvable', async () => {
    prisma.challenge.findUnique.mockResolvedValueOnce(null);
    await expect(service.evaluate('inconnu')).resolves.toEqual({
      status: 'locked',
      missingPrerequisites: ['Défi introuvable']
    });
  });

  it('marque un défi déjà réussi comme complété', async () => {
    prisma.bestScore.findUnique.mockResolvedValueOnce({ score: 250 });
    await expect(service.evaluate('challenge', USER_ID)).resolves.toEqual({
      status: 'completed',
      missingPrerequisites: []
    });
    prisma.bestScore.findUnique.mockResolvedValueOnce({ score: 0 });
    await expect(service.evaluate('challenge', USER_ID)).resolves.toEqual({
      status: 'available',
      missingPrerequisites: []
    });
  });

  it('ouvre un défi sans prérequis, même pour un visiteur', async () => {
    await expect(service.evaluate('challenge')).resolves.toEqual({
      status: 'available',
      missingPrerequisites: []
    });
  });

  it('explique chaque prérequis manquant à un visiteur anonyme', async () => {
    prisma.challenge.findUnique.mockResolvedValueOnce({
      prerequisites: [
        prereq({ requiredLevel: 5 }),
        prereq({ requiredChallengeId: 'a', requiredChallenge: { title: 'Tri' } }),
        prereq({ requiredLessonId: 'l', requiredLesson: { title: 'Variables' } }),
        prereq({ requiredLoreChapterId: 'c', requiredLoreChapter: { title: 'Origines' } }),
        prereq()
      ]
    });
    const result = await service.evaluate('challenge');
    expect(result.status).toBe('locked');
    expect(result.missingPrerequisites).toEqual([
      'Niveau 5 requis',
      'Défi « Tri » requis',
      'Cours « Variables » requis',
      'Chapitre de lore « Origines » requis',
      'Prérequis non satisfait'
    ]);
  });

  it('vérifie le niveau et les trois progressions d’un joueur connecté', async () => {
    prisma.challenge.findUnique.mockResolvedValueOnce({
      prerequisites: [
        prereq({ requiredLevel: 3 }),
        prereq({ requiredChallengeId: 'done', requiredChallenge: { title: 'Tri' } }),
        prereq({ requiredLessonId: 'lesson', requiredLesson: { title: 'Variables' } }),
        prereq({ requiredLoreChapterId: 'chapter', requiredLoreChapter: { title: 'Origines' } })
      ]
    });
    prisma.user.findUnique.mockResolvedValueOnce({ level: 2 });
    prisma.bestScore.findMany.mockResolvedValueOnce([{ challengeId: 'done', score: 100 }]);
    prisma.lessonProgress.findMany.mockResolvedValueOnce([{ lessonId: 'lesson' }]);
    prisma.loreProgress.findMany.mockResolvedValueOnce([{ chapterId: 'chapter' }]);
    await expect(service.evaluate('challenge', USER_ID)).resolves.toEqual({
      status: 'locked',
      missingPrerequisites: ['Niveau 3 requis (niveau actuel : 2)']
    });

    prisma.user.findUnique.mockResolvedValueOnce({ level: 3 });
    await expect(service.evaluate('challenge', USER_ID)).resolves.toEqual({
      status: 'available',
      missingPrerequisites: []
    });
  });

  it('signale les intitulés par défaut et ignore un score nul', async () => {
    prisma.challenge.findUnique.mockResolvedValue({
      prerequisites: [
        prereq({ requiredChallengeId: 'a' }),
        prereq({ requiredLessonId: 'l' }),
        prereq({ requiredLoreChapterId: 'c' })
      ]
    });
    prisma.bestScore.findMany.mockResolvedValue([{ challengeId: 'a', score: 0 }]);
    const result = await service.evaluate('challenge', USER_ID);
    expect(result.missingPrerequisites).toEqual([
      'Défi « Précédent » requis',
      'Cours « Leçon » requis',
      'Chapitre de lore « Chapitre » requis'
    ]);
  });

  it('évalue en lot sans requête pour une liste vide', async () => {
    await expect(service.evaluateMany([], USER_ID)).resolves.toEqual(new Map());
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('évalue en lot pour un visiteur anonyme', async () => {
    const results = await service.evaluateMany(
      [
        { id: 'libre', prerequisites: [] },
        { id: 'bloque', prerequisites: [prereq({ requiredLevel: 2 })] }
      ],
      undefined
    );
    expect(results.get('libre')).toEqual({ status: 'available', missingPrerequisites: [] });
    expect(results.get('bloque')).toEqual({
      status: 'locked',
      missingPrerequisites: ['Niveau 2 requis']
    });
  });

  it('évalue en lot pour un joueur connecté, complété ou verrouillé', async () => {
    prisma.bestScore.findMany.mockResolvedValue([
      { challengeId: 'complete', score: 400 },
      { challengeId: 'requis', score: 10 }
    ]);
    prisma.lessonProgress.findMany.mockResolvedValue([{ lessonId: 'lesson' }]);
    prisma.loreProgress.findMany.mockResolvedValue([{ chapterId: 'chapter' }]);
    const results = await service.evaluateMany(
      [
        { id: 'complete', prerequisites: [prereq({ requiredLevel: 9 })] },
        { id: 'libre', prerequisites: [] },
        {
          id: 'bloque',
          prerequisites: [
            prereq({ requiredLevel: 4 }),
            prereq({ requiredChallengeId: 'absent' }),
            prereq({ requiredLessonId: 'autre' }),
            prereq({ requiredLoreChapterId: 'autre' })
          ]
        },
        {
          id: 'disponible',
          prerequisites: [
            prereq({ requiredChallengeId: 'requis', requiredChallenge: { title: 'Tri' } }),
            prereq({ requiredLessonId: 'lesson', requiredLesson: { title: 'Variables' } }),
            prereq({ requiredLoreChapterId: 'chapter', requiredLoreChapter: { title: 'Lore' } })
          ]
        }
      ],
      USER_ID
    );
    expect(results.get('complete')).toEqual({ status: 'completed', missingPrerequisites: [] });
    expect(results.get('libre')).toEqual({ status: 'available', missingPrerequisites: [] });
    expect(results.get('bloque')?.missingPrerequisites).toEqual([
      'Niveau 4 requis (niveau actuel : 1)',
      'Défi « Précédent » requis',
      'Cours « Leçon » requis',
      'Chapitre de lore « Chapitre » requis'
    ]);
    expect(results.get('disponible')).toEqual({ status: 'available', missingPrerequisites: [] });
  });
});
