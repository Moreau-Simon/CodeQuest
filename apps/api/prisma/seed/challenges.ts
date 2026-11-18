import { PrismaClient } from '@prisma/client';
import { AesGcmService } from '../../src/common/crypto/aes-gcm.service';
import { uuidv7 } from '../../src/common/uuid';

interface TestCase {
  input: number[];
  expected: number[];
  hidden: boolean;
  name: string;
}

/** 20 cas déterministes : 8 visibles et 12 cachés (SC-007). */
export function sortingTestCases(): TestCase[] {
  const cases: TestCase[] = [];
  for (let index = 0; index < 20; index += 1) {
    const size = 8 + index * 3;
    const input = Array.from({ length: size }, (_unused, position) => {
      const value = (position * 37 + index * 11) % 101;
      return index % 2 === 0 ? value : 100 - value;
    });
    cases.push({
      input,
      expected: [...input].sort((a, b) => a - b),
      hidden: index >= 8,
      name: `cas-${index + 1}`
    });
  }
  return cases;
}

const REFERENCE_SOLUTION = `def solve(values):
    return sorted(values)
`;

/**
 * Seed du défi de tri (T090, quickstart S2/S3) : un thème, une version publiée
 * et ses tests chiffrés. Idempotent : le défi est identifié par son titre.
 */
export async function seedChallenges(prisma: PrismaClient = new PrismaClient()): Promise<void> {
  const aes = new AesGcmService();
  const themeId = uuidv7();

  await prisma.$transaction(async (tx) => {
    const theme = await tx.theme.upsert({
      where: { slug: 'algorithmes-de-tri' },
      update: {},
      create: { id: themeId, slug: 'algorithmes-de-tri', name: 'Algorithmes de tri', sortOrder: 1 }
    });

    const existing = await tx.challenge.findFirst({
      where: { title: 'Trier une liste', themeId: theme.id },
      select: { id: true }
    });
    if (existing) return;

    const challengeId = uuidv7();
    const versionId = uuidv7();
    const cases = sortingTestCases();

    await tx.challenge.create({
      data: {
        id: challengeId,
        themeId: theme.id,
        type: 'sorting',
        difficulty: 2,
        title: 'Trier une liste',
        statementMd: [
          '## Énoncé',
          '',
          'Implémentez `solve(values)` qui renvoie la liste triée par ordre croissant.',
          '',
          'Le temps CPU médian sur 5 exécutions détermine le bonus de performance :',
          `sous 150 ms le bonus est maximal, au-delà de 2 000 ms il est nul.`,
          '',
          'Les tests cachés ne sont jamais exposés : seuls le nombre de tests réussis',
          'et un motif d’échec filtré vous sont communiqués.'
        ].join('\n'),
        languages: ['python', 'javascript'],
        basePoints: 300,
        perfMax: 120,
        tOptMs: 150,
        tMaxMs: 2_000,
        status: 'published',
        currentVersion: 1,
        versions: {
          create: {
            id: versionId,
            version: 1,
            statementSnapshot: 'Triez la liste fournie par ordre croissant.',
            testsEncrypted: Uint8Array.from(aes.encrypt(JSON.stringify({ cases }), versionId)),
            referenceSolutionEncrypted: Uint8Array.from(aes.encrypt(REFERENCE_SOLUTION, versionId)),
            keyId: aes.keyId
          }
        }
      }
    });
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedChallenges(prisma);
    console.warn('✓ Défi de tri seedé (20 cas, 12 cachés)');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
