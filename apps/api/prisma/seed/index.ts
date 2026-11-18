import { PrismaClient } from '@prisma/client';
import { seedChallenges } from './challenges';
import { seedRbac } from './rbac';

/**
 * Seed complet (RBAC + contenu de démonstration). Rejouable sans effet de
 * bord : chaque étape est idempotente.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    await seedChallenges(prisma);
    console.warn('✓ Seed terminé : rôles, permissions et défi de tri');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
