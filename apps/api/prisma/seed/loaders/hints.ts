import type { PrismaClient } from '@prisma/client';
import { HINTS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';
import { challengeIdFor } from './lookup';

/** Indices progressifs : clé `(challengeId, order)`, jamais de test caché. */
export async function seedHintsCatalog(prisma: PrismaClient): Promise<number> {
  for (const hint of HINTS) {
    const challengeId = await challengeIdFor(prisma, hint.challengeSlug);
    if (!challengeId) throw new Error(`Défi introuvable pour l’indice ${hint.challengeSlug}`);
    await prisma.challengeHint.upsert({
      where: { challengeId_order: { challengeId, order: hint.order } },
      update: { content: hint.content, priceBits: hint.priceBits },
      create: {
        id: uuidv7(),
        challengeId,
        order: hint.order,
        content: hint.content,
        priceBits: hint.priceBits
      }
    });
  }
  return HINTS.length;
}
