import type { PrismaClient } from '@prisma/client';
import { THEMES } from '../content';
import { uuidv7 } from '../../../src/common/uuid';

/** Thèmes : clé `slug`, rattachement optionnel à un chapitre de lore. */
export async function seedThemesCatalog(prisma: PrismaClient): Promise<number> {
  const chapters = await prisma.loreChapter.findMany({ select: { id: true, slug: true } });
  const chapterIds = new Map(chapters.map((chapter) => [chapter.slug, chapter.id]));

  for (const theme of THEMES) {
    const loreRegionChapterId = theme.loreChapterSlug
      ? (chapterIds.get(theme.loreChapterSlug) ?? null)
      : null;
    await prisma.theme.upsert({
      where: { slug: theme.slug },
      update: { name: theme.name, loreRegionChapterId, sortOrder: theme.sortOrder },
      create: {
        id: uuidv7(),
        slug: theme.slug,
        name: theme.name,
        loreRegionChapterId,
        sortOrder: theme.sortOrder
      }
    });
  }
  return THEMES.length;
}
