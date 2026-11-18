import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { seedRbac } from '../../prisma/seed/rbac';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * Vérifie le socle de persistance (Phase 2) sur une base vide migrée par
 * `prisma migrate deploy` : contraintes métier, unicité `citext`, journal
 * d'audit append-only et seed RBAC idempotent.
 */
describe('fondation de persistance', () => {
  let infra: TestInfrastructure;
  let prisma: PrismaClient;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await infra?.stop();
  });

  async function createUser(email: string, pseudonym = 'ada'): Promise<string> {
    const id = uuidv7();
    await prisma.user.create({
      data: {
        id,
        email,
        pseudonym,
        passwordHash: 'argon2id$fake',
        emailVerifiedAt: new Date()
      }
    });
    return id;
  }

  it('applique la migration initiale (tables et extension citext)', async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const names = tables.map((row) => row.tablename);
    expect(names).toEqual(
      expect.arrayContaining([
        'users',
        'sessions',
        'password_reset_tokens',
        'push_subscriptions',
        'roles',
        'permissions',
        'role_permissions',
        'user_roles',
        'audit_logs',
        'platform_settings'
      ])
    );

    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'citext'
    `;
    expect(extensions).toHaveLength(1);
  });

  it('refuse un e-mail dupliqué sans tenir compte de la casse', async () => {
    await createUser('Ada@Example.com', 'ada');
    await expect(createUser('ada@example.com', 'ada2')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('refuse un pseudo qui ne respecte pas le format', async () => {
    await expect(createUser('bob@example.com', 'a')).rejects.toThrow();
    await expect(createUser('carol@example.com', 'pseudo avec espaces')).rejects.toThrow();
  });

  it('refuse un e-mail mal formé', async () => {
    await expect(createUser('pas-un-email', 'dave')).rejects.toThrow();
  });

  it('refuse toute mise à jour ou suppression du journal d’audit', async () => {
    const actor = await createUser('audit@example.com', 'auditeur');
    const entry = await prisma.auditLog.create({
      data: {
        id: uuidv7(),
        actorId: actor,
        action: 'user.login',
        targetType: 'user',
        targetId: actor,
        metadata: { method: 'password' }
      }
    });

    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } })
    ).rejects.toThrow(/append-only/i);

    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(
      /append-only/i
    );

    // L'entrée est toujours là, intacte.
    await expect(
      prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } })
    ).resolves.toMatchObject({
      action: 'user.login'
    });
  });

  it('seed les rôles et permissions de manière idempotente', async () => {
    await seedRbac(prisma);
    const first = {
      roles: await prisma.role.count(),
      permissions: await prisma.permission.count(),
      links: await prisma.rolePermission.count()
    };

    await seedRbac(prisma);
    const second = {
      roles: await prisma.role.count(),
      permissions: await prisma.permission.count(),
      links: await prisma.rolePermission.count()
    };

    expect(first).toEqual({ roles: 3, permissions: 21, links: 41 });
    expect(second).toEqual(first);

    const admin = await prisma.role.findUniqueOrThrow({
      where: { key: 'admin' },
      include: { permissions: true }
    });
    expect(admin.permissions).toHaveLength(21);
  });
});
