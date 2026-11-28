import type { PrismaClient } from '@prisma/client';
import { AesGcmService } from '../../../src/common/crypto/aes-gcm.service';
import { uuidv7 } from '../../../src/common/uuid';
import { CHALLENGES } from '../content';

/**
 * Défis du catalogue. Les tests et la solution sont chiffrés avec l'identifiant
 * de version comme AAD (contrat `runner-job.md`). Une modification du contenu
 * crée une nouvelle version immuable ; un seed inchangé ne crée rien.
 */
export async function seedChallengesCatalog(prisma: PrismaClient): Promise<number> {
  const aes = new AesGcmService();
  const themes = await prisma.theme.findMany({ select: { id: true, slug: true } });
  const themeIds = new Map(themes.map((theme) => [theme.slug, theme.id]));

  for (const challenge of CHALLENGES) {
    const themeId = themeIds.get(challenge.themeSlug);
    if (!themeId) throw new Error(`Thème introuvable pour le défi ${challenge.slug}`);
    const existing = await prisma.challenge.findFirst({
      where: { title: challenge.title, themeId },
      select: { id: true, currentVersion: true }
    });
    const challengeId = existing?.id ?? uuidv7();
    const data = {
      type: challenge.type,
      difficulty: challenge.difficulty,
      statementMd: challenge.statementMd,
      languages: [...challenge.languages],
      basePoints: challenge.basePoints,
      perfMax: challenge.perfMax,
      tOptMs: challenge.tOptMs,
      tMaxMs: challenge.tMaxMs,
      buggyCode: challenge.buggyCode ?? null,
      maxModifiedLines: challenge.maxModifiedLines ?? null,
      cipher: challenge.cipher ?? null,
      keySeedRef: challenge.keySeedRef ?? null,
      status: challenge.status,
      isEventOnly: challenge.isEventOnly,
      isBossPhase: challenge.isBossPhase
    };

    if (existing) {
      await prisma.challenge.update({ where: { id: challengeId }, data });
    } else {
      await prisma.challenge.create({
        data: {
          id: challengeId,
          themeId,
          title: challenge.title,
          currentVersion: 1,
          ...data
        }
      });
    }

    const testsPlaintext = JSON.stringify({ cases: challenge.cases });
    const currentVersion = await prisma.challengeVersion.findUnique({
      where: { challengeId_version: { challengeId, version: existing?.currentVersion ?? 1 } },
      select: {
        id: true,
        statementSnapshot: true,
        testsEncrypted: true,
        referenceSolutionEncrypted: true,
        keyId: true
      }
    });

    let upToDate = false;
    if (
      currentVersion &&
      currentVersion.keyId === aes.keyId &&
      currentVersion.testsEncrypted &&
      currentVersion.referenceSolutionEncrypted
    ) {
      try {
        upToDate =
          aes
            .decrypt(Buffer.from(currentVersion.testsEncrypted), currentVersion.id)
            .toString('utf8') === testsPlaintext &&
          aes
            .decrypt(Buffer.from(currentVersion.referenceSolutionEncrypted), currentVersion.id)
            .toString('utf8') === challenge.solution &&
          currentVersion.statementSnapshot === challenge.statementMd;
      } catch {
        // Chiffré illisible (clé tournée ou AAD altéré) : on publie une version neuve.
        upToDate = false;
      }
    }

    if (!upToDate) {
      const latest = await prisma.challengeVersion.findFirst({
        where: { challengeId },
        orderBy: { version: 'desc' },
        select: { version: true }
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      const versionId = uuidv7();
      await prisma.challengeVersion.create({
        data: {
          id: versionId,
          challengeId,
          version: nextVersion,
          statementSnapshot: challenge.statementMd,
          testsEncrypted: Uint8Array.from(aes.encrypt(testsPlaintext, versionId)),
          referenceSolutionEncrypted: Uint8Array.from(aes.encrypt(challenge.solution, versionId)),
          keyId: aes.keyId
        }
      });
      if (nextVersion !== existing?.currentVersion) {
        await prisma.challenge.update({
          where: { id: challengeId },
          data: { currentVersion: nextVersion }
        });
      }
    }
  }
  return CHALLENGES.length;
}
