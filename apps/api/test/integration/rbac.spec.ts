import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, type TestApp } from '../helpers/app';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T102 — Tests RBAC et refus par défaut (FR-018, FR-019, FR-020).
 *
 * - Les routes sans permission ou protégées par des permissions admin sont refusées par défaut.
 * - Un modérateur ne peut pas accéder aux routes réservées aux administrateurs (ex: /admin/audit-logs).
 * - L'auto-attribution de rôle est strictement interdite (FR-018, FR-020).
 */
describe('RBAC — refus par défaut et contrôle des rôles (T102)', () => {
  const password = 'correct-horse-battery-staple';

  let infra: TestInfrastructure;
  let api: TestApp;
  let prisma: PrismaClient;

  let adminAgent: TestApp['agent'];
  let moderatorAgent: TestApp['agent'];
  let playerAgent: TestApp['agent'];

  let adminId: string;
  let playerId: string;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    api = await createTestApp(infra);
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();

    // Inscription & création des 3 comptes de test
    async function createAccount(pseudonym: string, roleKey: 'admin' | 'moderator' | 'player') {
      const email = `${pseudonym}@example.com`;
      await api.anonymous.post('/api/v1/auth/register').send({ email, pseudonym, password });

      const mail = await api.waitForEmail('confirmation', (m) => m.to === email);
      const token = new URL(mail.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token');
      await api.anonymous.post('/api/v1/auth/verify-email').send({ token });

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });

      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: {}
      });

      const server = api.app.getHttpServer() as Parameters<typeof request.agent>[0];
      const agent = request.agent(server);
      const login = await agent.post('/api/v1/auth/login').send({ identifier: email, password });
      expect(login.status).toBe(200);

      return { id: user.id, agent };
    }

    const admin = await createAccount('super-admin', 'admin');
    const moderator = await createAccount('modo-test', 'moderator');
    const player = await createAccount('player-test', 'player');

    adminId = admin.id;
    adminAgent = admin.agent;

    moderatorAgent = moderator.agent;

    playerId = player.id;
    playerAgent = player.agent;
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await api?.close();
    await infra?.stop();
  });

  it('refuse l’accès aux routes protégées pour les requêtes anonymes (401)', async () => {
    const res = await api.anonymous.get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('refuse l’accès aux routes administratives pour un joueur simple (403 MISSING_PERMISSION)', async () => {
    const res = await playerAgent.get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'MISSING_PERMISSION'
    });
  });

  it('refuse l’accès aux routes d’audit et de gestion des rôles pour un modérateur (403)', async () => {
    // Un modérateur a user:read, user:ban, chat:moderate mais PAS audit:read ni user:role
    const resLogs = await moderatorAgent.get('/api/v1/admin/audit-logs');
    expect(resLogs.status).toBe(403);
    expect(resLogs.body).toMatchObject({
      code: 'MISSING_PERMISSION'
    });

    const resRoles = await moderatorAgent.post(`/api/v1/admin/users/${playerId}/roles`).send({
      role: 'admin'
    });
    expect(resRoles.status).toBe(403);
  });

  it('interdit strictement l’auto-attribution de rôle (FR-018, FR-020)', async () => {
    // Même un administrateur ne peut pas s'auto-attribuer ou modifier ses propres rôles
    const res = await adminAgent.post(`/api/v1/admin/users/${adminId}/roles`).send({
      role: 'moderator'
    });
    expect([400, 403]).toContain(res.status);
    expect(res.body).toMatchObject({
      code: expect.stringMatching(/AUTO_ROLE|FORBIDDEN/)
    });
  });

  it('permet à un administrateur d’attribuer un rôle à un autre utilisateur', async () => {
    const res = await adminAgent.post(`/api/v1/admin/users/${playerId}/roles`).send({
      role: 'moderator'
    });
    expect([200, 201, 204]).toContain(res.status);

    const userRoles = await prisma.userRole.findMany({
      where: { userId: playerId },
      include: { role: true }
    });
    const roles = userRoles.map((ur) => ur.role.key);
    expect(roles).toContain('moderator');
  });
});
