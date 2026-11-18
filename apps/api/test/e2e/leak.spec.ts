import { PrismaClient } from '@prisma/client';
import { AesGcmService } from '../../src/common/crypto/aes-gcm.service';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

const HIDDEN_MARKER = '424242';
const SECRET_MARKER = 'REFERENCE-SOLUTION-MARQUEUR';

/** Aplatit toute charge utile JSON en une seule chaîne pour la recherche. */
function flatten(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * T090 / quickstart S3 — « no hidden test leak » (SC-007).
 *
 * Aucune réponse REST ne doit contenir un cas de test caché, la valeur
 * attendue, la solution de référence ou le chiffré AES. La commande échoue
 * si l'une de ces marques apparaît.
 */
describe('no hidden test leak (SC-007)', () => {
  const password = 'correct-horse-battery-staple';
  const email = 'leak.contract@example.com';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let challengeId: string;
  let ciphertextBase64: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym: 'leak-contract', password });
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });

    const themeId = uuidv7();
    await prisma.theme.create({ data: { id: themeId, slug: 'leak', name: 'Fuite' } });

    challengeId = uuidv7();
    const versionId = uuidv7();
    const aes = new AesGcmService();
    const encrypted = aes.encrypt(
      JSON.stringify({ cases: [{ input: [1], expected: [Number(HIDDEN_MARKER)], hidden: true }] }),
      versionId
    );
    ciphertextBase64 = encrypted.toString('base64');

    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 1,
        title: 'Défi secret',
        statementMd: 'Énoncé public uniquement.',
        languages: ['python'],
        basePoints: 100,
        perfMax: 10,
        tOptMs: 100,
        tMaxMs: 1_000,
        status: 'published',
        currentVersion: 1,
        versions: {
          create: {
            id: versionId,
            version: 1,
            statementSnapshot: 'Énoncé public uniquement.',
            testsEncrypted: Uint8Array.from(encrypted),
            referenceSolutionEncrypted: Uint8Array.from(
              aes.encrypt(`# ${SECRET_MARKER}\ndef solve(x): return x`, versionId)
            ),
            keyId: 'v1'
          }
        }
      }
    });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('aucune réponse REST ne contient de test caché, de solution ni de chiffré', async () => {
    const detail = await api.agent.get(`/api/v1/challenges/${challengeId}`);
    expect(detail.status).toBe(200);

    const created = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'def solve(x): return x' });
    expect(created.status).toBe(202);

    const fetched = await api.agent.get(`/api/v1/submissions/${created.body.id}`);
    expect(fetched.status).toBe(200);

    const list = await api.agent.get('/api/v1/challenges');

    const payloads = [detail.body, created.body, fetched.body, list.body].map(flatten);
    for (const payload of payloads) {
      expect(payload).not.toContain(HIDDEN_MARKER);
      expect(payload).not.toContain(SECRET_MARKER);
      expect(payload).not.toContain(ciphertextBase64);
      expect(payload).not.toContain('testsEncrypted');
      expect(payload).not.toContain('tests_encrypted');
      expect(payload).not.toContain('referenceSolution');
    }
  });
});
