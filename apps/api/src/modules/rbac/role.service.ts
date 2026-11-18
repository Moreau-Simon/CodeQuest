import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { RoleKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Service de gestion des rôles (T107, FR-018, FR-020).
 *
 * - Attribution et retrait de rôles.
 * - Cumul des rôles supporté (un utilisateur peut cumuler plusieurs rôles).
 * - Interdiction stricte de l'auto-attribution / auto-révocation de rôles.
 * - Traçabilité dans le journal d'audit.
 */
@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async assignRole(actorId: string, targetUserId: string, roleKey: RoleKey): Promise<void> {
    if (actorId === targetUserId) {
      throw new ForbiddenException({
        code: 'AUTO_ROLE_ASSIGNMENT_FORBIDDEN',
        message: 'L’auto-attribution de rôle est strictement interdite'
      });
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, pseudonym: true }
    });
    if (!targetUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Utilisateur cible introuvable'
      });
    }

    const role = await this.prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true, key: true }
    });
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: `Rôle « ${roleKey} » inexistant`
      });
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: targetUserId,
          roleId: role.id
        }
      },
      create: {
        userId: targetUserId,
        roleId: role.id,
        grantedBy: actorId
      },
      update: {
        grantedBy: actorId
      }
    });

    await this.audit.record({
      actorId,
      action: 'role.assigned',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { role: roleKey, targetPseudonym: targetUser.pseudonym }
    });
  }

  async revokeRole(actorId: string, targetUserId: string, roleKey: RoleKey): Promise<void> {
    if (actorId === targetUserId) {
      throw new ForbiddenException({
        code: 'AUTO_ROLE_REVOCATION_FORBIDDEN',
        message: 'L’auto-révocation de rôle est interdite'
      });
    }

    const role = await this.prisma.role.findUnique({
      where: { key: roleKey },
      select: { id: true }
    });
    if (!role) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: `Rôle « ${roleKey} » inexistant`
      });
    }

    const deleted = await this.prisma.userRole.deleteMany({
      where: {
        userId: targetUserId,
        roleId: role.id
      }
    });

    if (deleted.count > 0) {
      await this.audit.record({
        actorId,
        action: 'role.revoked',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { role: roleKey }
      });
    }
  }

  async getUserRoles(userId: string): Promise<RoleKey[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { key: true } } }
    });
    return userRoles.map((ur) => ur.role.key);
  }
}
