import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T140 [P] [US7] Défi de débogage/de décryptage de bout en bout (FR-037 → FR-040, A5).
 *
 * Vérifie le chemin HTTP réel : exposition sûre du code bogué, démarrage
 * explicite de l'unique essai, comptage des lignes modifiées à la soumission,
 * et instances de décryptage distinctes par joueur sans fuite de graine.
 */
describe('défis de débogage et de décryptage (T140)', () => {
  const password = 'correct-horse-battery-staple';
  const BUGGY_CODE = 'def solve(values):\n    return custom_sort(values)\n';
  const CORRECTED_CODE = 'def solve(values):\n    return sorted(values)\n';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let themeId: string;
  let debugChallengeId: string;
  let decryptionChallengeId: string;
  let attemptId: string;

  async function registerAndLogin(email: string, pseudonym: string): Promise<void> {
    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym, password });
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });
  }

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
    await registerAndLogin('debug.contract@example.com', 'debug-player');

    themeId = uuidv7();
    await prisma.theme.create({ data: { id: themeId, slug: 'debug-us7', name: 'Débogage US7' } });

    // Import différé : `AesGcmService` charge `src/config/env`, figé par
    // l'import statique avant que createTestApp() ne pointe vers les conteneurs.
    const { AesGcmService: Aes } = await import('../../src/common/crypto/aes-gcm.service');
    const aes = new Aes();

    const debugVersionId = uuidv7();
    debugChallengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: debugChallengeId,
        themeId,
        type: 'debugging',
        difficulty: 2,
        title: 'Corriger le tri',
        statementMd: 'Corrigez le tri sans réécrire le programme.',
        languages: ['python'],
        basePoints: 100,
        perfMax: 50,
        tOptMs: 100,
        tMaxMs: 60_000,
        buggyCode: BUGGY_CODE,
        maxModifiedLines: 2,
        status: 'published',
        currentVersion: 1,
        versions: {
          create: {
            id: debugVersionId,
            version: 1,
            statementSnapshot: 'Corrigez le tri.',
            testsEncrypted: Uint8Array.from(aes.encrypt('{"cases":[]}', debugVersionId)),
            referenceSolutionEncrypted: Uint8Array.from(
              aes.encrypt('REFERENCE-SOLUTION-SECRETE', debugVersionId)
            ),
            keyId: 'v1'
          }
        }
      }
    });

    const decryptionVersionId = uuidv7();
    decryptionChallengeId = uuidv7();
    await prisma.challenge.create({
      data: {
        id: decryptionChallengeId,
        themeId,
        type: 'decryption',
        difficulty: 2,
        title: 'Déchiffrer le message',
        statementMd: 'Déchiffrez le message avec la clé déduite de votre graine.',
        languages: ['python'],
        basePoints: 100,
        perfMax: 50,
        tOptMs: 100,
        tMaxMs: 60_000,
        cipher: 'xor',
        keySeedRef: 'assets-seed:us7',
        status: 'published',
        currentVersion: 1,
        versions: {
          create: {
            id: decryptionVersionId,
            version: 1,
            statementSnapshot: 'Déchiffrez le message.',
            testsEncrypted: Uint8Array.from(aes.encrypt('{"cases":[]}', decryptionVersionId)),
            keyId: 'v1'
          }
        }
      }
    });
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('expose le code bogué sans révéler la correction ni les tests chiffrés', async () => {
    const response = await api.agent.get(`/api/v1/challenges/${debugChallengeId}`);
    expect(response.status).toBe(200);
    expect(response.body.buggyCode).toBe(BUGGY_CODE);
    expect(response.body.maxModifiedLines).toBe(2);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('REFERENCE-SOLUTION-SECRETE');
    expect(body).not.toContain('testsEncrypted');
    expect(body).not.toContain('referenceSolution');
  });

  it('démarre un seul essai explicite (A5)', async () => {
    const first = await api.agent.post(`/api/v1/challenges/${debugChallengeId}/attempts`);
    expect(first.status).toBe(201);
    expect(first.body.id).toBeDefined();
    attemptId = first.body.id as string;
    expect(new Date(first.body.expiredAt).getTime()).toBeGreaterThan(
      new Date(first.body.startedAt).getTime()
    );

    const second = await api.agent.post(`/api/v1/challenges/${debugChallengeId}/attempts`);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('ATTEMPT_ALREADY_STARTED');
  });

  it('exige l’essai explicite et compte les lignes modifiées (FR-038)', async () => {
    const withoutAttempt = await api.agent
      .post(`/api/v1/challenges/${debugChallengeId}/submissions`)
      .send({ language: 'python', code: CORRECTED_CODE });
    expect(withoutAttempt.status).toBe(400);
    expect(withoutAttempt.body.code).toBe('ATTEMPT_REQUIRED');

    const submitted = await api.agent
      .post(`/api/v1/challenges/${debugChallengeId}/submissions`)
      .send({ language: 'python', code: CORRECTED_CODE, attemptId });
    expect(submitted.status).toBe(202);
    expect(submitted.body).toMatchObject({
      challengeId: debugChallengeId,
      attemptId,
      modifiedLines: 1,
      hintsUsed: 0
    });

    const stored = await prisma.submission.findUniqueOrThrow({
      where: { id: submitted.body.id as string }
    });
    expect(stored.startedAt).not.toBeNull();
    expect(stored.modifiedLines).toBe(1);
  });

  it('génère une instance de décryptage unique par joueur sans fuite de graine (FR-040)', async () => {
    // Import différé : InstanceService charge `src/config/env`.
    const { InstanceService } = await import('../../src/modules/challenges/instance.service');
    const stubFetch = (async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        challengeId: string;
        challengeVersion: number;
        subject: { id: string };
      };
      const seed = service.deriveSeed(
        payload.challengeId,
        'player',
        payload.subject.id,
        payload.challengeVersion
      );
      return new Response(
        JSON.stringify({
          assetId: 'asset',
          seedFingerprint: seed.subarray(0, 8).toString('hex'),
          objectKey: `assets/decryption/${payload.challengeId}/${payload.subject.id}`,
          ciphertext: `chiffre-${payload.subject.id}`,
          sha256: 'hash',
          cached: false
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    const service = new InstanceService(stubFetch);

    const input = {
      challengeId: decryptionChallengeId,
      challengeVersion: 1,
      subjectType: 'player' as const,
      cipher: 'xor'
    };
    const alice = await service.generate({ ...input, subjectId: 'player-alice' });
    const bob = await service.generate({ ...input, subjectId: 'player-bob' });

    expect(alice.seedFingerprint).not.toBe(bob.seedFingerprint);
    expect(alice.ciphertext).not.toBe(bob.ciphertext);
    expect(JSON.stringify(alice)).not.toContain('test-assets-seed-key');
    expect(alice).not.toHaveProperty('seed');
  });
});
