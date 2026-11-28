import type { PrismaClient } from '@prisma/client';
import { LORE_CHAPTERS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';

/** Chapitres de lore : clé naturelle `slug`, contenus réécrits à chaque seed. */
export async function seedLoreCatalog(prisma: PrismaClient): Promise<number> {
  for (const chapter of LORE_CHAPTERS) {
    await prisma.loreChapter.upsert({
      where: { slug: chapter.slug },
      update: {
        title: chapter.title,
        contentMd: chapter.contentMd,
        requiredLevel: chapter.requiredLevel,
        order: chapter.order,
        audioKey: chapter.audioKey
      },
      create: { id: uuidv7(), ...chapter }
    });
  }
  return LORE_CHAPTERS.length;
}
