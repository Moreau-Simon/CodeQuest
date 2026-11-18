import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';
import { seedTheme } from '../helpers/leaderboard';

/**
 * T101 — Validation d'un défi avant publication (FR-085, FR-086, FR-029).
 *
 * L'administrateur crée un défi en brouillon puis lance la validation :
 * - Si la solution de référence échoue sur un test, la publication est bloquée (422) avec le détail du test fautif.
 * - Si 100 % des tests passent, le défi est validé, les bornes t_opt et t_max sont calibrées, et le statut passe à published.
 */
describe('validation d’un défi avant publication (T101)', () => {
  const password = 'correct-horse-battery-staple';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let adminAgent: TestApp['agent'];
  let themeId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    const theme = await seedTheme(prisma, 'tris-admin');
    themeId = theme.id;

    // Création du compte administrateur
    const email = 'admin-validation@example.com';
    await api.anonymous.post('/api/v1/auth/register').send({
      email,
      pseudonym: 'admin-val',
      password
    });

    const mail = await api.waitForEmail('confirmation', (m) => m.to === email);
    const token = new URL(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: 'admin' } });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      create: { userId: user.id, roleId: adminRole.id },
      update: {}
    });

    const server = api.app.getHttpServer() as Parameters<typeof request.agent>[0];
    adminAgent = request.agent(server);
    const login = await adminAgent.post('/api/v1/auth/login').send({ identifier: email, password });
    expect(login.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('bloque avec 422 la validation d’un défi si la solution de référence échoue à un test', async () => {
    // Création d'un brouillon avec un test qui ne passera pas avec la solution fournie
    const draftRes = await adminAgent.post('/api/v1/admin/challenges').send({
      themeId,
      type: 'sorting',
      difficulty: 2,
      title: 'Tri buggé',
      statement: 'Triez les nombres.',
      languages: ['python'],
      basePoints: 100,
      perfMax: 50,
      referenceSolution: 'def solve(arr):\n    return sorted(arr)',
      tests: [
        { input: '[3, 1, 2]', expected: '[1, 2, 3]', isHidden: false },
        // Ce test exige un tri décroissant, ce qui fait échouer la solution 'sorted'
        { input: '[1, 2, 3]', expected: '[3, 2, 1]', isHidden: true }
      ]
    });
    expect([200, 201]).toContain(draftRes.status);
    const challengeId = draftRes.body.id;

    // Tentative de validation
    const validateRes = await adminAgent.post(`/api/v1/admin/challenges/${challengeId}/validate`);
    expect(validateRes.status).toBe(422);
    expect(validateRes.body).toMatchObject({
      code: expect.stringMatching(/CHALLENGE_VALIDATION_FAILED|UNPROCESSABLE/),
      details: expect.anything()
    });

    // Le défi ne doit pas être publié
    const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.status).not.toBe('published');
  });

  it('valide avec 200 et calibre t_opt / t_max lorsque tous les tests passent', async () => {
    const draftRes = await adminAgent.post('/api/v1/admin/challenges').send({
      themeId,
      type: 'sorting',
      difficulty: 1,
      title: 'Tri parfait',
      statement: 'Triez la liste en ordre croissant.',
      languages: ['python'],
      basePoints: 150,
      perfMax: 50,
      referenceSolution: 'def solve(arr):\n    return sorted(arr)',
      tests: [
        { input: '[3, 1, 2]', expected: '[1, 2, 3]', isHidden: false },
        { input: '[]', expected: '[]', isHidden: false },
        { input: '[5, 4, 3, 2, 1]', expected: '[1, 2, 3, 4, 5]', isHidden: true }
      ]
    });
    expect([200, 201]).toContain(draftRes.status);
    const challengeId = draftRes.body.id;

    const validateRes = await adminAgent.post(`/api/v1/admin/challenges/${challengeId}/validate`);
    expect(validateRes.status).toBe(200);
    expect(validateRes.body).toMatchObject({
      status: 'published',
      tOptMs: expect.any(Number),
      tMaxMs: expect.any(Number)
    });

    const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.status).toBe('published');
    expect(challenge.tOptMs).toBeGreaterThan(0);
    expect(challenge.tMaxMs).toBeGreaterThan(challenge.tOptMs);
  });
});
