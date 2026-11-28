import type { PrismaClient } from '@prisma/client';
import { PREREQUISITES } from '../content';
import { uuidv7 } from '../../../src/common/uuid';
import { challengeIdFor } from './lookup';

/**
 * Prérequis : une seule des quatre conditions est renseignée (CHECK SQL).
 * L'absence d'unicité SQL impose une recherche exacte avant création.
 */
export async function seedPrerequisitesCatalog(prisma: PrismaClient): Promise<number> {
  const lessons = await prisma.lesson.findMany({ select: { id: true, slug: true } });
  const chapters = await prisma.loreChapter.findMany({ select: { id: true, slug: true } });
  const lessonIds = new Map(lessons.map((lesson) => [lesson.slug, lesson.id]));
  const chapterIds = new Map(chapters.map((chapter) => [chapter.slug, chapter.id]));

  for (const prerequisite of PREREQUISITES) {
    const challengeId = await challengeIdFor(prisma, prerequisite.challengeSlug);
    if (!challengeId)
      throw new Error(`Défi introuvable pour le prérequis ${prerequisite.challengeSlug}`);
    const requiredChallengeId = prerequisite.requiredChallengeSlug
      ? await challengeIdFor(prisma, prerequisite.requiredChallengeSlug)
      : null;
    const requiredLessonId = prerequisite.requiredLessonSlug
      ? (lessonIds.get(prerequisite.requiredLessonSlug) ?? null)
      : null;
    const requiredLoreChapterId = prerequisite.requiredLoreSlug
      ? (chapterIds.get(prerequisite.requiredLoreSlug) ?? null)
      : null;

    const data = {
      challengeId,
      requiredChallengeId,
      requiredLevel: prerequisite.requiredLevel ?? null,
      requiredLessonId,
      requiredLoreChapterId
    };
    const existing = await prisma.challengePrerequisite.findFirst({
      where: data,
      select: { id: true }
    });
    if (!existing) await prisma.challengePrerequisite.create({ data: { id: uuidv7(), ...data } });
  }
  return PREREQUISITES.length;
}
