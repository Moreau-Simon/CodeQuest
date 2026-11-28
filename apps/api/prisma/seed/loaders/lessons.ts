import { Prisma, type PrismaClient } from '@prisma/client';
import { LESSONS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';

/** Leçons et mini-quiz pédagogiques : clé `slug`, thème résolu au préalable. */
export async function seedLessonsCatalog(prisma: PrismaClient): Promise<number> {
  const themes = await prisma.theme.findMany({ select: { id: true, slug: true } });
  const themeIds = new Map(themes.map((theme) => [theme.slug, theme.id]));

  for (const lesson of LESSONS) {
    const themeId = themeIds.get(lesson.themeSlug);
    if (!themeId) throw new Error(`Thème introuvable pour la leçon ${lesson.slug}`);
    const quiz = lesson.quiz as unknown as Prisma.InputJsonValue;
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: {
        themeId,
        title: lesson.title,
        contentMd: lesson.contentMd,
        order: lesson.order,
        estimatedMinutes: lesson.estimatedMinutes,
        status: lesson.status,
        quiz
      },
      create: {
        id: uuidv7(),
        themeId,
        slug: lesson.slug,
        title: lesson.title,
        contentMd: lesson.contentMd,
        order: lesson.order,
        estimatedMinutes: lesson.estimatedMinutes,
        status: lesson.status,
        quiz
      }
    });
  }
  return LESSONS.length;
}
