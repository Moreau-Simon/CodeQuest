import { PrismaClient } from '@prisma/client';
import { seedChallenges } from './challenges';
import { seedLessons } from './lessons';
import {
  seedBossesCatalog,
  seedChallengesCatalog,
  seedEconomyCatalog,
  seedEventsCatalog,
  seedHintsCatalog,
  seedLessonsCatalog,
  seedLoreCatalog,
  seedPrerequisitesCatalog,
  seedSeasonsCatalog,
  seedThemesCatalog
} from './loaders';
import { seedRbac } from './rbac';

/**
 * Seed complet (RBAC + contenu de démonstration + catalogue durable).
 * Rejouable sans effet de bord : chaque étape est idempotente et les versions
 * de défis ne sont recréées que si leur contenu change réellement.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    await seedChallenges(prisma);
    await seedLessons(prisma);

    // Le catalogue référence les leçons et thèmes du seed historique sans les
    // dupliquer : chaque loader utilise une clé naturelle stable.
    const counts = {
      lore: await seedLoreCatalog(prisma),
      seasons: await seedSeasonsCatalog(prisma),
      themes: await seedThemesCatalog(prisma),
      lessons: await seedLessonsCatalog(prisma),
      challenges: await seedChallengesCatalog(prisma),
      hints: await seedHintsCatalog(prisma),
      prerequisites: await seedPrerequisitesCatalog(prisma),
      events: await seedEventsCatalog(prisma),
      bosses: await seedBossesCatalog(prisma),
      economy: await seedEconomyCatalog(prisma)
    };
    console.warn(
      '✓ Seed terminé : RBAC, défi de tri, leçons historiques et catalogue ' +
        `(${counts.challenges} défis, ${counts.lessons} leçons, ${counts.lore} chapitres, ` +
        `${counts.events} événements, ${counts.bosses} boss, ${counts.economy} objets/succès)`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
