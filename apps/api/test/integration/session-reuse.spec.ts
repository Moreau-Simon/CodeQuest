import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * Détection de réutilisation du refresh token (T047, FR-011) : rejouer un
 * jeton déjà tourné doit révoquer **toute la famille de sessions**.
 * Écrit avant l'implémentation (TDD).
 */
describe('réutilisation d’un refresh token (T047)', () => {
  const password = 'correct-horse-battery-staple';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: 'reuse@example.com', pseudonym: 'reuse', password });

    // Le lien de confirmation est lu dans la file d'e-mails (aucun accès SQL
    // n'est nécessaire : le jeton est signé et transmis par l'e-mail).
    const mail = await api.waitForEmail(
      'confirmation',
      (message) => message.to === 'reuse@example.com'
    );
    const token = new URL(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token');
    await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('révoque toute la famille quand un ancien refresh token est rejoué', async () => {
    const login = await api.agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'reuse@example.com', password });
    expect(login.status).toBe(200);

    const setCookies = login.headers['set-cookie'];
    const cookies = Array.isArray(setCookies) ? setCookies : [setCookies ?? ''];
    const originalToken = cookies
      .find((cookie) => cookie.startsWith('refresh_token='))!
      .split(';')[0]!
      .split('=')[1]!;

    const rotated = await api.agent.post('/api/v1/auth/refresh');
    expect(rotated.status).toBe(204);

    // Rejeu du jeton d'origine, hors de l'agent (cookie forgé).
    const replay = await api.anonymous
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refresh_token=${originalToken}`);
    expect(replay.status).toBe(401);

    // Toutes les sessions de la famille sont révoquées, y compris la plus
    // récente : un nouveau refresh doit aussi échouer.
    const afterReplay = await api.agent.post('/api/v1/auth/refresh');
    expect(afterReplay.status).toBe(401);

    const me = await api.agent.get('/api/v1/me');
    expect(me.status).toBe(401);

    const liveSessions = await prisma.session.count({ where: { revokedAt: null } });
    expect(liveSessions).toBe(0);

    const reasons = await prisma.session.findMany({ select: { revokedReason: true } });
    expect(reasons.map((session) => session.revokedReason)).toContain('token_reuse');
  });
});
