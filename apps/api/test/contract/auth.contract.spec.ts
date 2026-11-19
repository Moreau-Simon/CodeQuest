import { PrismaClient } from '@prisma/client';
import { createTestApp, tokenFromLink, type TestApp } from '../helpers/app';
import { contractValidator, expectValidResponse } from '../helpers/contract';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * Tests de contrat US1 (T045) : les routes `/auth/*` et `/me` doivent répondre
 * avec les statuts déclarés et des corps conformes à `contracts/openapi.yaml`.
 *
 * Écrits avant l'implémentation (TDD) ; exécutés avec `pnpm test:integration`.
 */
describe('contrat /auth et /me (T045)', () => {
  const validator = contractValidator();
  const password = 'correct-horse-battery-staple';
  const email = 'ada.contract@example.com';
  const pseudonym = 'ada-contract';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  function expectErrorEnvelope(body: unknown): void {
    const result = validator.validateNamedSchema('Error', body);
    if (!result.valid)
      throw new Error(`Enveloppe d'erreur non conforme : ${result.errors.join(', ')}`);
  }

  function expectSessionCookies(response: { headers: Record<string, unknown> }): void {
    const raw = response.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw.join(';') : String(raw ?? '');
    expect(cookies).toContain('access_token=');
    expect(cookies).toContain('refresh_token=');
  }

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

  it('refuse un accès anonyme à /me avec l’enveloppe d’erreur', async () => {
    const response = await api.anonymous.get('/api/v1/me');
    expect(response.status).toBe(401);
    expectErrorEnvelope(response.body);
  });

  it('refuse des identifiants inconnus (401)', async () => {
    const response = await api.anonymous
      .post('/api/v1/auth/login')
      .send({ identifier: 'inconnu@example.com', password });
    expect(response.status).toBe(401);
    expectErrorEnvelope(response.body);
  });

  it('inscrit un compte (201) et met le lien de confirmation en file', async () => {
    const response = await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym, password });

    expect(response.status).toBe(201);
    expectValidResponse({ method: 'post', path: '/auth/register' }, 201, response.body);

    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    expect(mail.subject).toContain('Confirmez');
    expect(tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '')).toBeTruthy();
  });

  it('refuse un e-mail ou pseudo déjà utilisé (409)', async () => {
    const sameEmail = await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email, pseudonym: 'autre-pseudo', password });
    expect(sameEmail.status).toBe(409);
    expectErrorEnvelope(sameEmail.body);

    const samePseudonym = await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: 'autre@example.com', pseudonym, password });
    expect(samePseudonym.status).toBe(409);
    expectErrorEnvelope(samePseudonym.body);
  });

  it('refuse un mot de passe trop court et un pseudo invalide (400)', async () => {
    const shortPassword = await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: 'court@example.com', pseudonym: 'court', password: 'trop-court' });
    expect(shortPassword.status).toBe(400);
    expectErrorEnvelope(shortPassword.body);

    const badPseudonym = await api.anonymous
      .post('/api/v1/auth/register')
      .send({ email: 'pseudo@example.com', pseudonym: 'a', password });
    expect(badPseudonym.status).toBe(400);
    expectErrorEnvelope(badPseudonym.body);
  });

  it('confirme l’adresse e-mail (204)', async () => {
    const mail = await api.waitForEmail('confirmation', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');

    const response = await api.anonymous.post('/api/v1/auth/verify-email').send({ token });
    expect(response.status).toBe(204);
    expectValidResponse({ method: 'post', path: '/auth/verify-email' }, 204, response.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('active');
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it('connecte, pose les cookies et renvoie un profil conforme', async () => {
    const response = await api.agent
      .post('/api/v1/auth/login')
      .send({ identifier: email, password });

    expect(response.status).toBe(200);
    expectSessionCookies(response);

    const me = await api.agent.get('/api/v1/me');
    expect(me.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/me' }, 200, me.body);
    expect(me.body).toMatchObject({ email, pseudonym, emailVerified: true });
  });

  it('liste les sessions actives avec un corps conforme', async () => {
    // Deuxième appareil : session supplémentaire dans la même famille distincte.
    const second = await api.anonymous
      .post('/api/v1/auth/login')
      .send({ identifier: pseudonym, password });
    expect(second.status).toBe(200);

    const response = await api.agent.get('/api/v1/me/sessions');
    expect(response.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/me/sessions' }, 200, response.body);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(2);
    expect(response.body.filter((session: { current: boolean }) => session.current)).toHaveLength(
      1
    );
  });

  it('révoque une session unitaire (204) puis toutes les sessions (204)', async () => {
    const sessions = await api.agent.get('/api/v1/me/sessions');
    const other = sessions.body.find((session: { current: boolean }) => !session.current);

    const revoked = await api.agent.delete(`/api/v1/me/sessions/${other.id}`);
    expect(revoked.status).toBe(204);
    expectValidResponse({ method: 'delete', path: '/me/sessions/{sessionId}' }, 204, revoked.body);

    const after = await api.agent.get('/api/v1/me/sessions');
    expect(after.body).toHaveLength(sessions.body.length - 1);

    const all = await api.agent.delete('/api/v1/me/sessions');
    expect(all.status).toBe(204);
    expectValidResponse({ method: 'delete', path: '/me/sessions' }, 204, all.body);
  });

  it('fait tourner le refresh token (204) et conserve la session', async () => {
    await api.agent.post('/api/v1/auth/login').send({ identifier: email, password });

    const refreshed = await api.agent.post('/api/v1/auth/refresh');
    expect(refreshed.status).toBe(204);
    expectValidResponse({ method: 'post', path: '/auth/refresh' }, 204, refreshed.body);
    expectSessionCookies(refreshed);

    const me = await api.agent.get('/api/v1/me');
    expect(me.status).toBe(200);
  });

  it('répond 202 de façon identique pour une adresse connue ou inconnue', async () => {
    const known = await api.anonymous
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: email });
    const unknown = await api.anonymous
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: 'personne@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expectValidResponse({ method: 'post', path: '/auth/forgot-password' }, 202, known.body);
    expect(known.text).toBe(unknown.text);
  });

  it('consomme un lien de réinitialisation à usage unique (204)', async () => {
    const mail = await api.waitForEmail('password-reset', (message) => message.to === email);
    const token = tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '');
    const newPassword = 'nouveau-mot-de-passe-solide';

    const reset = await api.anonymous
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword });
    expect(reset.status).toBe(204);
    expectValidResponse({ method: 'post', path: '/auth/reset-password' }, 204, reset.body);

    const replay = await api.anonymous
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'encore-un-autre-mot-de-passe' });
    expect(replay.status).toBe(400);
    expectErrorEnvelope(replay.body);

    const reused = await api.anonymous
      .post('/api/v1/auth/login')
      .send({ identifier: email, password });
    expect(reused.status).toBe(401);
    expectErrorEnvelope(reused.body);
  });

  it('met à jour le profil (200), l’exporte (200) et refuse une suppression mal authentifiée', async () => {
    // Le changement de mot de passe a révoqué toutes les sessions (FR-008).
    const login = await api.agent
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: 'nouveau-mot-de-passe-solide' });
    expect(login.status).toBe(200);

    const updated = await api.agent.patch('/api/v1/me').send({ pseudonym: 'ada-renamed' });
    expect(updated.status).toBe(200);

    const me = await api.agent.get('/api/v1/me');
    expect(me.body.pseudonym).toBe('ada-renamed');

    const exported = await api.agent.get('/api/v1/me/export');
    expect(exported.status).toBe(200);
    expectValidResponse({ method: 'get', path: '/me/export' }, 200, exported.body);
    expect(exported.body).toMatchObject({ pseudonym: 'ada-renamed' });

    const refused = await api.agent.delete('/api/v1/me').send({ password: 'mauvais-mot-de-passe' });
    expect([400, 401, 403]).toContain(refused.status);
    expectErrorEnvelope(refused.body);
  });

  it('déconnecte la session courante (204)', async () => {
    const response = await api.agent.post('/api/v1/auth/logout').send({});
    expect(response.status).toBe(204);
    expectValidResponse({ method: 'post', path: '/auth/logout' }, 204, response.body);

    const me = await api.agent.get('/api/v1/me');
    expect(me.status).toBe(401);
    expectErrorEnvelope(me.body);
  });

  it('supprime logiquement le compte (202) après réauthentification', async () => {
    await api.agent
      .post('/api/v1/auth/login')
      .send({ identifier: email, password: 'nouveau-mot-de-passe-solide' });

    const response = await api.agent
      .delete('/api/v1/me')
      .send({ password: 'nouveau-mot-de-passe-solide' });
    expect(response.status).toBe(202);
    expectValidResponse({ method: 'delete', path: '/me' }, 202, response.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('deleted');
    expect(user.deletedAt).not.toBeNull();

    const sessions = await prisma.session.count({
      where: { userId: user.id, revokedAt: null }
    });
    expect(sessions).toBe(0);
  });
});
