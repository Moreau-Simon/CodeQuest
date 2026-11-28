import { Prisma, type PrismaClient } from '@prisma/client';
import { BOSSES } from '../content';
import { uuidv7 } from '../../../src/common/uuid';
import { challengeIdFor } from './lookup';

/** Boss de fin d'arc : clé `slug`, phases ordonnées `(bossId, order)`. */
export async function seedBossesCatalog(prisma: PrismaClient): Promise<number> {
  const chapters = await prisma.loreChapter.findMany({ select: { id: true, slug: true } });
  const chapterIds = new Map(chapters.map((chapter) => [chapter.slug, chapter.id]));

  for (const boss of BOSSES) {
    const loreChapterId = chapterIds.get(boss.loreChapterSlug);
    if (!loreChapterId) throw new Error(`Chapitre introuvable pour le boss ${boss.slug}`);
    const bossId = (
      await prisma.boss.upsert({
        where: { slug: boss.slug },
        update: {
          name: boss.name,
          loreChapterId,
          maxHp: boss.maxHp,
          rewards: boss.rewards as unknown as Prisma.InputJsonValue
        },
        create: {
          id: uuidv7(),
          slug: boss.slug,
          name: boss.name,
          loreChapterId,
          maxHp: boss.maxHp,
          rewards: boss.rewards as unknown as Prisma.InputJsonValue
        },
        select: { id: true }
      })
    ).id;

    for (const phase of boss.phases) {
      const challengeId = await challengeIdFor(prisma, phase.challengeSlug);
      if (!challengeId)
        throw new Error(`Défi introuvable pour la phase ${boss.slug}/${phase.order}`);
      await prisma.bossPhase.upsert({
        where: { bossId_order: { bossId, order: phase.order } },
        update: {
          challengeId,
          hpShare: phase.hpShare,
          damageRule: phase.damageRule as unknown as Prisma.InputJsonValue
        },
        create: {
          id: uuidv7(),
          bossId,
          order: phase.order,
          challengeId,
          hpShare: phase.hpShare,
          damageRule: phase.damageRule as unknown as Prisma.InputJsonValue
        }
      });
    }
  }
  return BOSSES.length;
}
