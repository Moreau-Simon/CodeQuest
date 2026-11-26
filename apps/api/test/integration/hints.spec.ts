import { PrismaClient, type ChallengeType } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, type TestApp } from '../helpers/app';
import { FrozenClock } from '../helpers/clock';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedTheme } from '../helpers/leaderboard';
import { createTestPlayer, type TestPlayer } from '../helpers/teams';

/**
 * T187 [P] [US11] — écrit avant l'implémentation (constitution IV).
 *
 * FR-042/FR-074/FR-075 + clarification 5 : indices progressifs en solo sur
 * les défis exploratoires uniquement, jamais sur tri/event/boss, sans révéler
 * les tests cachés ni la solution de référence.
 */
describe('US11 — règles des indices (T187)', () => {
  const NOW = new Date('2030-08-15T10:00:00.000Z');
  const HIDDEN_TESTS = 'MARKER_TESTS_CACHEES_7F3A';
  const REFERENCE_SOLUTION = 'MARKER_SOLUTION_REFERENCE_9C1B';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let player: TestPlayer;

  interface HintView {
    id: string;
    order: number;
    priceBits: number;
    purchased: boolean;
    content?: string;
  }

  interface ChallengeDetail {
    hints: HintView[];
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    const clock = new FrozenClock(NOW);
    api = await createTestApp(infra, { clock });
    const { LedgerService } = await import('../../src/modules/economy/ledger.service');
    const ledger = api.app.get(LedgerService);

    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    player = await createTestPlayer(api, prisma, 'hint-player');
    await ledger.credit({
      userId: player.id,
      amount: 5_000,
      reason: 'admin_adjustment',
      idempotencyKey: 'seed:hints-wallet',
      referenceType: 'player',
      referenceId: player.id
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  async function seedChallenge(
    slug: string,
    type: ChallengeType,
    hintContents: string[]
  ): Promise<{ challengeId: string; hints: Array<{ id: string; shopItemId: string }> }> {
    const theme = await seedTheme(prisma, `theme-${slug}`);
    const challengeId = uuidv7();
    const versionId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId: theme.id,
        type,
        difficulty: 2,
        title: `Défi ${slug}`,
        statementMd: 'Résolvez le défi.',
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
            statementSnapshot: 'Résolvez le défi.',
            // Ces marqueurs ne doivent jamais apparaître dans une réponse HTTP.
            testsEncrypted: Uint8Array.from(Buffer.from(HIDDEN_TESTS)),
            referenceSolutionEncrypted: Uint8Array.from(Buffer.from(REFERENCE_SOLUTION)),
            keyId: 'v1'
          }
        }
      }
    });

    const hints: Array<{ id: string; shopItemId: string }> = [];
    for (const [index, content] of hintContents.entries()) {
      const hintId = uuidv7();
      const shopItemId = uuidv7();
      await prisma.challengeHint.create({
        data: {
          id: hintId,
          challengeId,
          order: index + 1,
          content,
          priceBits: 10 * (index + 1)
        }
      });
      await prisma.shopItem.create({
        data: {
          id: shopItemId,
          sku: `hint-${hintId}`,
          name: `Indice ${index + 1}`,
          kind: 'hint',
          priceBits: 10 * (index + 1),
          isActive: true,
          metadata: { hintId }
        }
      });
      hints.push({ id: hintId, shopItemId });
    }
    return { challengeId, hints };
  }

  async function detail(challengeId: string): Promise<ChallengeDetail> {
    const response = await player.agent.get(`/api/v1/challenges/${challengeId}`);
    expect(response.status).toBe(200);
    return response.body as ChallengeDetail;
  }

  function buyHint(shopItemId: string, key: string, body: Record<string, unknown> = {}) {
    return player.agent
      .post(`/api/v1/shop/${shopItemId}/purchase`)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('déverrouille les indices un par un et ne révèle jamais tests ni solution', async () => {
    const seed = await seedChallenge('hints-progressifs', 'debugging', [
      'Indice 1 : inspectez la boucle.',
      'Indice 2 : comparez les bornes.'
    ]);

    const before = await detail(seed.challengeId);
    expect(before.hints).toHaveLength(2);
    expect(before.hints[0]).toMatchObject({
      order: 1,
      priceBits: 10,
      purchased: false
    });
    expect(before.hints[0]).not.toHaveProperty('content');
    expect(JSON.stringify(before)).not.toContain(HIDDEN_TESTS);
    expect(JSON.stringify(before)).not.toContain(REFERENCE_SOLUTION);

    const locked = await buyHint(seed.hints[1]!.shopItemId, 'hint-locked');
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('HINT_LOCKED');

    const teamPurchase = await buyHint(seed.hints[0]!.shopItemId, 'hint-team', {
      teamId: uuidv7()
    });
    expect(teamPurchase.status).toBe(409);
    expect(teamPurchase.body.code).toBe('HINT_SOLO_ONLY');

    const first = await buyHint(seed.hints[0]!.shopItemId, 'hint-first');
    expect(first.status).toBe(201);

    const after = await detail(seed.challengeId);
    expect(after.hints[0]).toMatchObject({
      id: seed.hints[0]!.id,
      purchased: true,
      content: 'Indice 1 : inspectez la boucle.'
    });
    expect(after.hints[1]).toMatchObject({ purchased: false });
    expect(after.hints[1]).not.toHaveProperty('content');
    expect(JSON.stringify(after)).not.toContain(HIDDEN_TESTS);
    expect(JSON.stringify(after)).not.toContain(REFERENCE_SOLUTION);
    expect(await prisma.hintPurchase.count({ where: { userId: player.id } })).toBe(1);

    const second = await buyHint(seed.hints[1]!.shopItemId, 'hint-second');
    expect(second.status).toBe(201);
    expect((await detail(seed.challengeId)).hints[1]!.purchased).toBe(true);
  });

  it('refuse un indice sur un défi de tri sans débiter', async () => {
    const seed = await seedChallenge('hints-sorting', 'sorting', ['Indice interdit']);
    const walletBefore = await player.agent.get('/api/v1/me/wallet');

    const response = await buyHint(seed.hints[0]!.shopItemId, 'hint-sorting');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HINT_NOT_ALLOWED');

    const walletAfter = await player.agent.get('/api/v1/me/wallet');
    expect(walletAfter.body.balance).toBe(walletBefore.body.balance);
    expect(await prisma.hintPurchase.count({ where: { hintId: seed.hints[0]!.id } })).toBe(0);
  });

  it('refuse un indice pendant un événement ouvert', async () => {
    const seed = await seedChallenge('hints-event', 'decryption', ['Indice événement']);
    const eventId = uuidv7();
    await prisma.event.create({
      data: {
        id: eventId,
        slug: 'event-hints',
        title: 'Event indices',
        timezone: 'Europe/Paris',
        startsAt: new Date(NOW.getTime() - 3_600_000),
        endsAt: new Date(NOW.getTime() + 3_600_000),
        status: 'open',
        type: 'standard',
        challenges: { create: [{ challengeId: seed.challengeId, order: 1 }] }
      }
    });
    await prisma.eventParticipant.create({
      data: {
        id: uuidv7(),
        eventId,
        subjectType: 'player',
        subjectId: player.id
      }
    });

    const response = await buyHint(seed.hints[0]!.shopItemId, 'hint-event');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HINT_DURING_EVENT');
    expect(await prisma.hintPurchase.count({ where: { hintId: seed.hints[0]!.id } })).toBe(0);

    // Nettoyage : la participation ne doit pas contaminer le scénario boss.
    await prisma.eventParticipant.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  });

  it('refuse un indice pendant une rencontre de boss', async () => {
    const seed = await seedChallenge('hints-boss', 'steganography', ['Indice boss']);
    const chapterId = uuidv7();
    await prisma.loreChapter.create({
      data: {
        id: chapterId,
        slug: 'chapter-hints-boss',
        title: 'Chapitre boss indices',
        contentMd: 'Chapitre de test'
      }
    });
    const bossId = uuidv7();
    const phaseId = uuidv7();
    await prisma.boss.create({
      data: {
        id: bossId,
        slug: 'boss-hints',
        name: 'Boss indices',
        loreChapterId: chapterId,
        maxHp: 20,
        rewards: { bits: 100 },
        phases: {
          create: {
            id: phaseId,
            order: 1,
            challengeId: seed.challengeId,
            hpShare: 100,
            damageRule: { per_100_score: 5, failureCost: 10 }
          }
        }
      }
    });
    await prisma.bossEngagement.create({
      data: {
        id: uuidv7(),
        bossId,
        subjectType: 'player',
        subjectId: player.id,
        bossHpRemaining: 20,
        phaseReached: 1
      }
    });

    const response = await buyHint(seed.hints[0]!.shopItemId, 'hint-boss');
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('HINT_DURING_BOSS');
    expect(await prisma.hintPurchase.count({ where: { hintId: seed.hints[0]!.id } })).toBe(0);
  });
});
