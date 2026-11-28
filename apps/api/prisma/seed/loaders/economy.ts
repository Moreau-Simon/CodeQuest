import { Prisma, type PrismaClient } from '@prisma/client';
import { BADGES, SHOP_ITEMS } from '../content';
import { uuidv7 } from '../../../src/common/uuid';
import { challengeIdFor } from './lookup';

/** Boutique et succès : clés `sku` et `key`, références d'indices résolues. */
export async function seedEconomyCatalog(prisma: PrismaClient): Promise<number> {
  for (const item of SHOP_ITEMS) {
    let metadata: Record<string, unknown> = { ...item.metadata };
    if (item.hintRef) {
      const challengeId = await challengeIdFor(prisma, item.hintRef.challengeSlug);
      if (!challengeId) throw new Error(`Défi introuvable pour l’objet ${item.sku}`);
      const hint = await prisma.challengeHint.findUnique({
        where: { challengeId_order: { challengeId, order: item.hintRef.order } },
        select: { id: true }
      });
      if (!hint) throw new Error(`Indice introuvable pour l’objet ${item.sku}`);
      metadata = { ...metadata, hintId: hint.id };
    }
    const json = metadata as Prisma.InputJsonValue;
    await prisma.shopItem.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        kind: item.kind,
        priceBits: item.priceBits,
        isActive: item.isActive,
        metadata: json,
        availableFrom: item.availableFrom ? new Date(item.availableFrom) : null,
        availableUntil: item.availableUntil ? new Date(item.availableUntil) : null
      },
      create: {
        id: uuidv7(),
        sku: item.sku,
        name: item.name,
        kind: item.kind,
        priceBits: item.priceBits,
        isActive: item.isActive,
        metadata: json,
        availableFrom: item.availableFrom ? new Date(item.availableFrom) : null,
        availableUntil: item.availableUntil ? new Date(item.availableUntil) : null
      }
    });
  }

  for (const badge of BADGES) {
    const criteria = badge.criteria as unknown as Prisma.InputJsonValue;
    await prisma.badge.upsert({
      where: { key: badge.key },
      update: { name: badge.name, description: badge.description, criteria },
      create: {
        id: uuidv7(),
        key: badge.key,
        name: badge.name,
        description: badge.description,
        criteria
      }
    });
  }
  return SHOP_ITEMS.length + BADGES.length;
}
