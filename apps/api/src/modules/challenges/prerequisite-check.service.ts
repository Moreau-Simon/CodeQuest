import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PrerequisiteEvaluation {
  status: 'locked' | 'available' | 'completed';
  missingPrerequisites: string[];
}

@Injectable()
export class PrerequisiteCheckService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Évalue les prérequis d'un défi pour un joueur donné (ou visiteur anonyme).
   * Retourne le statut ('locked' | 'available' | 'completed') et la liste explicite
   * des prérequis manquants (FR-023, FR-025).
   */
  async evaluate(challengeId: string, userId?: string): Promise<PrerequisiteEvaluation> {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        prerequisites: {
          include: {
            requiredChallenge: { select: { id: true, title: true } },
            requiredLesson: { select: { id: true, title: true } },
            requiredLoreChapter: { select: { id: true, title: true } }
          }
        }
      }
    });

    if (!challenge) {
      return { status: 'locked', missingPrerequisites: ['Défi introuvable'] };
    }

    // Si le joueur est connecté, vérifier d'abord s'il a déjà validé ce défi
    if (userId) {
      const bestScore = await this.prisma.bestScore.findUnique({
        where: {
          challengeId_subjectType_subjectId: {
            challengeId,
            subjectType: 'player',
            subjectId: userId
          }
        }
      });

      if (bestScore && Number(bestScore.score) > 0) {
        return { status: 'completed', missingPrerequisites: [] };
      }
    }

    // S'il n'y a aucun prérequis configuré
    if (challenge.prerequisites.length === 0) {
      return { status: 'available', missingPrerequisites: [] };
    }

    // Visiteur non connecté mais défi avec prérequis : verrouillé
    if (!userId) {
      const missing = challenge.prerequisites.map((p) => {
        if (p.requiredLevel) return `Niveau ${p.requiredLevel} requis`;
        if (p.requiredChallenge) return `Défi « ${p.requiredChallenge.title} » requis`;
        if (p.requiredLesson) return `Cours « ${p.requiredLesson.title} » requis`;
        if (p.requiredLoreChapter)
          return `Chapitre de lore « ${p.requiredLoreChapter.title} » requis`;
        return 'Prérequis non satisfait';
      });
      return { status: 'locked', missingPrerequisites: missing };
    }

    // Joueur connecté : charger son profil et ses progressions
    const [user, userBestScores, lessonProgressList, loreProgressList] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true }
      }),
      this.prisma.bestScore.findMany({
        where: {
          subjectType: 'player',
          subjectId: userId,
          challengeId: {
            in: challenge.prerequisites
              .map((p) => p.requiredChallengeId)
              .filter((id): id is string => Boolean(id))
          }
        },
        select: { challengeId: true, score: true }
      }),
      this.prisma.lessonProgress.findMany({
        where: {
          userId,
          lessonId: {
            in: challenge.prerequisites
              .map((p) => p.requiredLessonId)
              .filter((id): id is string => Boolean(id))
          },
          status: 'completed'
        },
        select: { lessonId: true }
      }),
      this.prisma.loreProgress.findMany({
        where: {
          userId,
          chapterId: {
            in: challenge.prerequisites
              .map((p) => p.requiredLoreChapterId)
              .filter((id): id is string => Boolean(id))
          }
        },
        select: { chapterId: true }
      })
    ]);

    const userLevel = user?.level ?? 1;
    const completedChallenges = new Set(
      userBestScores.filter((bs) => Number(bs.score) > 0).map((bs) => bs.challengeId)
    );
    const completedLessons = new Set(lessonProgressList.map((lp) => lp.lessonId));
    const unlockedLore = new Set(loreProgressList.map((lore) => lore.chapterId));

    const missingPrerequisites: string[] = [];

    for (const prereq of challenge.prerequisites) {
      if (prereq.requiredLevel) {
        if (userLevel < prereq.requiredLevel) {
          missingPrerequisites.push(
            `Niveau ${prereq.requiredLevel} requis (niveau actuel : ${userLevel})`
          );
        }
      } else if (prereq.requiredChallengeId) {
        if (!completedChallenges.has(prereq.requiredChallengeId)) {
          const title = prereq.requiredChallenge?.title ?? 'Précédent';
          missingPrerequisites.push(`Défi « ${title} » requis`);
        }
      } else if (prereq.requiredLessonId) {
        if (!completedLessons.has(prereq.requiredLessonId)) {
          const title = prereq.requiredLesson?.title ?? 'Leçon';
          missingPrerequisites.push(`Cours « ${title} » requis`);
        }
      } else if (prereq.requiredLoreChapterId) {
        if (!unlockedLore.has(prereq.requiredLoreChapterId)) {
          const title = prereq.requiredLoreChapter?.title ?? 'Chapitre';
          missingPrerequisites.push(`Chapitre de lore « ${title} » requis`);
        }
      }
    }

    if (missingPrerequisites.length > 0) {
      return { status: 'locked', missingPrerequisites };
    }

    return { status: 'available', missingPrerequisites: [] };
  }

  /**
   * Évalue en lot pour optimiser les requêtes sur le catalogue.
   */
  async evaluateMany(
    challenges: Array<{
      id: string;
      prerequisites: Array<{
        requiredChallengeId: string | null;
        requiredLevel: number | null;
        requiredLessonId: string | null;
        requiredLoreChapterId: string | null;
        requiredChallenge?: { title: string } | null;
        requiredLesson?: { title: string } | null;
        requiredLoreChapter?: { title: string } | null;
      }>;
    }>,
    userId?: string
  ): Promise<Map<string, PrerequisiteEvaluation>> {
    const results = new Map<string, PrerequisiteEvaluation>();

    if (challenges.length === 0) return results;

    if (!userId) {
      for (const ch of challenges) {
        if (ch.prerequisites.length === 0) {
          results.set(ch.id, { status: 'available', missingPrerequisites: [] });
        } else {
          const missing = ch.prerequisites.map((p) => {
            if (p.requiredLevel) return `Niveau ${p.requiredLevel} requis`;
            if (p.requiredChallenge) return `Défi « ${p.requiredChallenge.title} » requis`;
            if (p.requiredLesson) return `Cours « ${p.requiredLesson.title} » requis`;
            if (p.requiredLoreChapter)
              return `Chapitre de lore « ${p.requiredLoreChapter.title} » requis`;
            return 'Prérequis non satisfait';
          });
          results.set(ch.id, { status: 'locked', missingPrerequisites: missing });
        }
      }
      return results;
    }

    // Récupérer le niveau et toutes les progressions en 4 requêtes groupées
    const [user, userBestScores, lessonProgressList, loreProgressList] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true }
      }),
      this.prisma.bestScore.findMany({
        where: { subjectType: 'player', subjectId: userId },
        select: { challengeId: true, score: true }
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId, status: 'completed' },
        select: { lessonId: true }
      }),
      this.prisma.loreProgress.findMany({
        where: { userId },
        select: { chapterId: true }
      })
    ]);

    const userLevel = user?.level ?? 1;
    const completedChallenges = new Set(
      userBestScores.filter((bs) => Number(bs.score) > 0).map((bs) => bs.challengeId)
    );
    const completedLessons = new Set(lessonProgressList.map((lp) => lp.lessonId));
    const unlockedLore = new Set(loreProgressList.map((lore) => lore.chapterId));

    for (const ch of challenges) {
      if (completedChallenges.has(ch.id)) {
        results.set(ch.id, { status: 'completed', missingPrerequisites: [] });
        continue;
      }

      if (ch.prerequisites.length === 0) {
        results.set(ch.id, { status: 'available', missingPrerequisites: [] });
        continue;
      }

      const missingPrerequisites: string[] = [];
      for (const prereq of ch.prerequisites) {
        if (prereq.requiredLevel) {
          if (userLevel < prereq.requiredLevel) {
            missingPrerequisites.push(
              `Niveau ${prereq.requiredLevel} requis (niveau actuel : ${userLevel})`
            );
          }
        } else if (prereq.requiredChallengeId) {
          if (!completedChallenges.has(prereq.requiredChallengeId)) {
            const title = prereq.requiredChallenge?.title ?? 'Précédent';
            missingPrerequisites.push(`Défi « ${title} » requis`);
          }
        } else if (prereq.requiredLessonId) {
          if (!completedLessons.has(prereq.requiredLessonId)) {
            const title = prereq.requiredLesson?.title ?? 'Leçon';
            missingPrerequisites.push(`Cours « ${title} » requis`);
          }
        } else if (prereq.requiredLoreChapterId) {
          if (!unlockedLore.has(prereq.requiredLoreChapterId)) {
            const title = prereq.requiredLoreChapter?.title ?? 'Chapitre';
            missingPrerequisites.push(`Chapitre de lore « ${title} » requis`);
          }
        }
      }

      if (missingPrerequisites.length > 0) {
        results.set(ch.id, { status: 'locked', missingPrerequisites });
      } else {
        results.set(ch.id, { status: 'available', missingPrerequisites: [] });
      }
    }

    return results;
  }
}
