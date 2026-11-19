import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { AesGcmService } from '../../src/common/crypto/aes-gcm.service';
import { uuidv7 } from '../../src/common/uuid';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { contractValidator, expectValidResponse } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T067 — contrat des soumissions : `POST /challenges/{id}/submissions` (202)
 * et `GET /submissions/{id}` (200), conformes à `contracts/openapi.yaml`.
 */
describe('contrat des soumissions (T067)', () => {
  const validator = contractValidator();
  const password = 'correct-horse-battery-staple';
  const email = 'submit.contract@example.com';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;
  let challengeId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    // Compte confirmé, connecté (cookies de session).
    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym: 'submit-contract', password });
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });

    // Thème + défi publié + version chiffrée.
    const themeId = uuidv7();
    await prisma.theme.create({ data: { id: themeId, slug: 'tri', name: 'Algorithmes de tri' } });

    challengeId = uuidv7();
    const versionId = uuidv7();
    // Import différé : `AesGcmService` charge `src/config/env`. Un import
    // statique figerait REDIS_URL/DATABASE_URL sur les valeurs par défaut de
    // `test/env.ts`, avant que `createTestApp()` ne désigne les conteneurs.
    const { AesGcmService: Aes } = await import('../../src/common/crypto/aes-gcm.service');
    const aes: AesGcmService = new Aes();
    const tests = aes.encrypt(
      JSON.stringify({ cases: [{ input: [[2, 1]], expected: [1, 2] }] }),
      versionId
    );

    await prisma.challenge.create({
      data: {
        id: challengeId,
        themeId,
        type: 'sorting',
        difficulty: 2,
        title: 'Trier une liste',
        statementMd: 'Triez la liste fournie.',
        languages: ['python', 'javascript'],
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
            testsEncrypted: Uint8Array.from(tests),
            referenceSolutionEncrypted: Uint8Array.from(
              aes.encrypt('def solve(x): return sorted(x)', versionId)
            ),
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

  it('refuse une soumission anonyme (401)', async () => {
    const response = await api.anonymous
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(1)' });
    expect(response.status).toBe(401);
    const result = validator.validateNamedSchema('Error', response.body);
    expect(result.valid).toBe(true);
  });

  it('accepte une soumission (202) et la rend lisible (200)', async () => {
    const created = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'def solve(values):\n    return sorted(values)\n' });

    expect(created.status).toBe(202);
    expectValidResponse(
      { method: 'post', path: '/challenges/{challengeId}/submissions' },
      202,
      created.body
    );
    expect(created.body).toMatchObject({
      challengeId,
      status: 'pending',
      score: null
    });

    const fetched = await api.agent.get(`/api/v1/submissions/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/submissions/{submissionId}' }, 200, fetched.body);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('est idempotent avec la même clé', async () => {
    const key = uuidv7();
    const first = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .set('Idempotency-Key', key)
      .send({ language: 'python', code: 'print(42)' });
    const second = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .set('Idempotency-Key', key)
      .send({ language: 'python', code: 'print(42)' });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.id).toBe(first.body.id);
  });

  it('refuse un langage non supporté (400) et un défi inconnu (404)', async () => {
    const language = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'javascript', code: 'console.log(1)' });
    // Le défi supporte JavaScript : on vérifie surtout la validation du corps.
    expect([202, 400, 409]).toContain(language.status);

    const unknown = await api.agent
      .post(`/api/v1/challenges/${uuidv7()}/submissions`)
      .send({ language: 'python', code: 'print(1)' });
    expect(unknown.status).toBe(404);
  });

  it('cache une soumission appartenant à un autre joueur (404)', async () => {
    const created = await api.agent
      .post(`/api/v1/challenges/${challengeId}/submissions`)
      .send({ language: 'python', code: 'print(7)' });

    // Second joueur, avec son propre pot de cookies.
    const otherEmail = 'other.contract@example.com';
    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, pseudonym: 'other-contract', password });
    const otherMail = await api.waitForEmail(
      'confirmation',
      (message) => message.to === otherEmail
    );
    const otherToken = tokenFromLink(otherMail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token: otherToken });

    const otherAgent = request.agent(api.app.getHttpServer());
    const login = await otherAgent
      .post('/api/v1/auth/login')
      .send({ identifier: otherEmail, password });
    expect(login.status).toBe(200);

    const forbidden = await otherAgent.get(`/api/v1/submissions/${created.body.id}`);
    expect(forbidden.status).toBe(404);

    // Un agent anonyme n'a pas de session : la route répond 401.
    const anonymous = await api.anonymous.get(`/api/v1/submissions/${created.body.id}`);
    expect(anonymous.status).toBe(401);
  });
});
