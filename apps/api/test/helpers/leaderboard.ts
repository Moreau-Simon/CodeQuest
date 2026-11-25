import type { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';

export interface SeedTheme {
  id: string;
  slug: string;
}

export interface SeedChallenge {
  id: string;
  versionId: string;
  themeId: string;
}

export interface SeedPlayer {
  id: string;
  pseudonym: string;
}

/** Crée un thème minimal pour les tests de classement. */
export async function seedTheme(
  prisma: PrismaClient,
  slug = `theme-${uuidv7().slice(0, 8)}`
): Promise<SeedTheme> {
  const id = uuidv7();
  await prisma.theme.create({ data: { id, slug, name: slug } });
  return { id, slug };
}

/** Crée un défi publié avec une version chiffrée factice. */
export async function seedChallenge(
  prisma: PrismaClient,
  themeId: string,
  title = 'Trier une liste'
): Promise<SeedChallenge> {
  const id = uuidv7();
  const versionId = uuidv7();
  await prisma.challenge.create({
    data: {
      id,
      themeId,
      type: 'sorting',
      difficulty: 2,
      title,
      statementMd: 'Triez la liste fournie.',
      languages: ['python'],
      basePoints: 200,
      perfMax: 80,
      tOptMs: 100,
      tMaxMs: 1_000,
      status: 'published',
      currentVersion: 1,
      versions: {
        create: {
          id: versionId,
          version: 1,
          statementSnapshot: 'Triez la liste fournie.',
          testsEncrypted: Uint8Array.from([1, 2, 3, 4]),
          referenceSolutionEncrypted: Uint8Array.from([5, 6, 7, 8]),
          keyId: 'v1'
        }
      }
    }
  });
  return { id, versionId, themeId };
}

/** Crée un joueur confirmé. */
export async function seedPlayer(
  prisma: PrismaClient,
  pseudonym: string,
  email = `${pseudonym}@example.com`
): Promise<SeedPlayer> {
  const id = uuidv7();
  await prisma.user.create({
    data: {
      id,
      email,
      pseudonym,
      passwordHash: 'argon2id$fake',
      emailVerifiedAt: new Date(),
      status: 'active'
    }
  });
  return { id, pseudonym };
}

export interface SeedScoreInput {
  playerId: string;
  challenge: SeedChallenge;
  score: number;
  achievedAt: Date;
  /** Renseigné pour un classement d'événement. */
  eventId?: string;
  /** Renseigné pour un classement d'équipe. */
  teamId?: string;
}

/**
 * Enregistre une soumission retenue et son meilleur score, comme le ferait le
 * consommateur de verdicts après commit PostgreSQL.
 */
export async function seedScore(prisma: PrismaClient, input: SeedScoreInput): Promise<string> {
  const submissionId = uuidv7();
  const score = input.score.toFixed(2);

  // US9 : `submissions.event_id` référence désormais `events.id` (FK). Les
  // classements d'événement utilisent un identifiant synthétique : créer la
  // ligne d'événement correspondante garde le helper auto-suffisant.
  if (input.eventId) {
    await prisma.event.upsert({
      where: { id: input.eventId },
      create: {
        id: input.eventId,
        slug: `event-score-${input.eventId.slice(0, 8)}`,
        title: 'Événement de test',
        timezone: 'Europe/Paris',
        startsAt: new Date(input.achievedAt.getTime() - 3_600_000),
        endsAt: new Date(input.achievedAt.getTime() + 3_600_000),
        status: 'finished',
        type: 'standard'
      },
      update: {}
    });
  }

  await prisma.submission.create({
    data: {
      id: submissionId,
      challengeId: input.challenge.id,
      challengeVersionId: input.challenge.versionId,
      userId: input.playerId,
      teamId: input.teamId,
      eventId: input.eventId,
      language: 'python',
      code: 'def solve(x): return sorted(x)',
      status: 'passed',
      cpuTimesMs: [100, 100, 100, 100, 100],
      cpuTimeMedianMs: 100,
      testsPassed: 1,
      testsTotal: 1,
      score,
      createdAt: input.achievedAt,
      startedAt: input.achievedAt,
      finishedAt: input.achievedAt
    }
  });

  await prisma.bestScore.upsert({
    where: {
      challengeId_subjectType_subjectId: {
        challengeId: input.challenge.id,
        subjectType: 'player',
        subjectId: input.playerId
      }
    },
    create: {
      id: uuidv7(),
      challengeId: input.challenge.id,
      subjectType: 'player',
      subjectId: input.playerId,
      score,
      submissionId,
      achievedAt: input.achievedAt
    },
    update: {
      score,
      submissionId,
      achievedAt: input.achievedAt
    }
  });

  return submissionId;
}
