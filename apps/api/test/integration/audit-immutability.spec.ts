import { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import { startTestInfrastructure, type TestInfrastructure } from '../helpers/db';

/**
 * T103 — Immuabilité du journal d'audit (FR-089, US4).
 *
 * Le journal d'audit est append-only : les triggers PostgreSQL
 * `audit_logs_no_update` et `audit_logs_no_delete` doivent interdire
 * toute tentative de modification ou de suppression (même par un administrateur).
 */
describe('immuabilité du journal d’audit (T103)', () => {
  let infra: TestInfrastructure;
  let prisma: PrismaClient;

  beforeAll(async () => {
    infra = await startTestInfrastructure();
    prisma = new PrismaClient({ datasources: { db: { url: infra.databaseUrl } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await infra?.stop();
  });

  async function createAuditLogEntry(action = 'user.login'): Promise<string> {
    const id = uuidv7();
    await prisma.auditLog.create({
      data: {
        id,
        action,
        targetType: 'user',
        targetId: uuidv7(),
        metadata: { ip: '127.0.0.1' }
      }
    });
    return id;
  }

  it('refuse toute tentative de mise à jour (UPDATE) sur audit_logs', async () => {
    const logId = await createAuditLogEntry('user.created');

    await expect(
      prisma.auditLog.update({
        where: { id: logId },
        data: { action: 'user.modified' }
      })
    ).rejects.toThrow(/append-only.*interdit/i);

    const intact = await prisma.auditLog.findUniqueOrThrow({ where: { id: logId } });
    expect(intact.action).toBe('user.created');
  });

  it('refuse toute tentative de suppression (DELETE) sur audit_logs', async () => {
    const logId = await createAuditLogEntry('security.alert');

    await expect(
      prisma.auditLog.delete({
        where: { id: logId }
      })
    ).rejects.toThrow(/append-only.*interdit/i);

    const intact = await prisma.auditLog.findUniqueOrThrow({ where: { id: logId } });
    expect(intact.action).toBe('security.alert');
  });

  it('refuse la suppression en masse (DELETE FROM audit_logs)', async () => {
    await createAuditLogEntry('bulk.test');

    await expect(prisma.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(
      /append-only.*interdit/i
    );
  });
});
