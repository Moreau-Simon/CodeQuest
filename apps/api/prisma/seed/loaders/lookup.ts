import type { PrismaClient } from '@prisma/client';
import { CATALOG } from '../content';

const titleBySlug = new Map(
  CATALOG.challenges.map((challenge) => [challenge.slug, challenge.title])
);

/**
 * Les défis n'ont pas de slug en base : le titre est la clé naturelle stable
 * utilisée depuis le seed historique. Ce helper centralise la résolution.
 */
export async function challengeIdFor(prisma: PrismaClient, slug: string): Promise<string | null> {
  const title = titleBySlug.get(slug);
  if (!title) return null;
  const challenge = await prisma.challenge.findFirst({ where: { title }, select: { id: true } });
  return challenge?.id ?? null;
}

export async function challengeIdsFor(
  prisma: PrismaClient,
  slugs: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const slug of slugs) {
    const id = await challengeIdFor(prisma, slug);
    if (id) ids.push(id);
  }
  return ids;
}
