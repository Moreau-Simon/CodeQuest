import { PrismaClient } from '@prisma/client';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * Tests d'intégration US1 (T046) : inscription, connexion et rotation.
 * Écrits avant l'implémentation (TDD).
 */
describe('authentification — inscription et connexion (T046)', () => {
  const password = 'correct-horse-battery-staple';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  async function register(
    overrides: Partial<Record<'email' | 'pseudonym' | 'password', string>> = {}
  ) {
    return api.anonymous.post('/api/v1/auth/register').send({
      email: 'ada@example.com',
      pseudonym: 'ada',
      password,
      ...overrides
    });
  }

  it('refuse un pseudo déjà utilisé avec 409 sans créer de second compte', async () => {
    await register();
    const duplicate = await register({ email: 'autre@example.com' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ code: expect.any(String) });
    expect(await prisma.user.count({ where: { email: 'ada@example.com' } })).toBe(1);
  });

  it('refuse un mot de passe de moins de 12 caractères avec 400', async () => {
    const response = await register({
      email: 'court@example.com',
      pseudonym: 'court',
      password: 'onze-caract'
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: expect.any(String) });
    expect(await prisma.user.count({ where: { email: 'court@example.com' } })).toBe(0);
  });

  it('hache le mot de passe avec Argon2id et ne stocke jamais le clair', async () => {
    await register({ email: 'hash@example.com', pseudonym: 'hash' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'hash@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(password);
    expect(user.status).toBe('pending');
  });

  it('bloque le compte après 5 échecs (423) même avec le bon mot de passe', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await api.anonymous
        .post('/api/v1/auth/login')
        .send({ identifier: 'hash@example.com', password: 'mauvais-mot-de-passe' });
      expect(failed.status).toBe(401);
    }

    const locked = await api.anonymous
      .post('/api/v1/auth/login')
      .send({ identifier: 'hash@example.com', password });
    expect(locked.status).toBe(423);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'hash@example.com' } });
    expect(user.status).not.toBe('deleted');
  });

  it('refuse la connexion d’un compte non confirmé en écriture mais autorise la lecture', async () => {
    await register({ email: 'lecture@example.com', pseudonym: 'lecture' });

    const login = await api.agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'lecture@example.com', password });
    expect(login.status).toBe(200);

    const me = await api.agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'lecture@example.com', emailVerified: false });

    const patch = await api.agent.patch('/api/v1/me').send({ preferredLanguage: 'javascript' });
    expect(patch.status).toBe(403);
    expect(patch.body).toMatchObject({ code: expect.any(String) });
  });
});
