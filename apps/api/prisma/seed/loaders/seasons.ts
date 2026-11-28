import type { PrismaClient } from '@prisma/client';
import { SEASONS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';

/** Saisons contiguës : clé `slug`, fenêtres temporelles toujours réécrites. */
export async function seedSeasonsCatalog(prisma: PrismaClient): Promise<number> {
  for (const season of SEASONS) {
    await prisma.season.upsert({
      where: { slug: season.slug },
      update: {
        name: season.name,
        startsAt: new Date(season.startsAt),
        endsAt: new Date(season.endsAt)
      },
      create: {
        id: uuidv7(),
        slug: season.slug,
        name: season.name,
        startsAt: new Date(season.startsAt),
        endsAt: new Date(season.endsAt)
      }
    });
  }
  return SEASONS.length;
}
