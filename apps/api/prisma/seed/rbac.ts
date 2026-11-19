import { PrismaClient, type RoleKey } from '@prisma/client';
import { uuidv7 } from '../../src/common/uuid';
import {
  PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type PermissionKey
} from '../../src/modules/rbac/permissions';

/**
 * Seed RBAC idempotent (T040) : rôles et permissions uniquement, aucune
 * donnée personnelle. Rejouable sans effet de bord.
 */
export async function seedRbac(prisma: PrismaClient = new PrismaClient()): Promise<void> {
  const permissionKeys = Object.keys(PERMISSIONS) as PermissionKey[];

  await prisma.$transaction(async (tx) => {
    for (const key of permissionKeys) {
      await tx.permission.upsert({
        where: { key },
        update: { label: PERMISSIONS[key] },
        create: { id: uuidv7(), key, label: PERMISSIONS[key] }
      });
    }

    for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
      const role = await tx.role.upsert({
        where: { key: roleKey },
        update: { label: ROLE_LABELS[roleKey], isGlobal: true },
        create: { id: uuidv7(), key: roleKey, label: ROLE_LABELS[roleKey], isGlobal: true }
      });

      const permissions = await tx.permission.findMany({
        where: { key: { in: [...ROLE_PERMISSIONS[roleKey]] } },
        select: { id: true }
      });

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id
        })),
        skipDuplicates: true
      });
    }
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedRbac(prisma);
    console.warn('✓ RBAC seedé : 3 rôles, %d permissions', Object.keys(PERMISSIONS).length);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
