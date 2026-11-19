import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import type { RoleKey, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermissions } from '../rbac/rbac.constants';
import { RoleService } from '../rbac/role.service';
import { ModerationPolicy } from './moderation.policy';

export interface AssignRoleDto {
  role: RoleKey;
}

export interface UpdateUserStatusDto {
  status: UserStatus;
  reason?: string;
}

/**
 * Contrôleur d'administration des utilisateurs (T108, FR-088, FR-090).
 */
@Controller('admin/users')
export class UsersAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleService: RoleService,
    private readonly moderationPolicy: ModerationPolicy,
    private readonly audit: AuditService
  ) {}

  @RequirePermissions('user:read')
  @Get()
  async listUsers(@Query('cursor') cursor?: string, @Query('limit') limitStr?: string) {
    const limit = Math.min(Math.max(Number(limitStr) || 20, 1), 100);
    const users = await this.prisma.user.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        pseudonym: true,
        status: true,
        level: true,
        xp: true,
        createdAt: true,
        roles: {
          select: {
            role: { select: { key: true } }
          }
        }
      }
    });

    const page = users.slice(0, limit);
    const nextCursor = users.length > limit ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map((u) => ({
        id: u.id,
        email: u.email,
        pseudonym: u.pseudonym,
        status: u.status,
        level: u.level,
        xp: u.xp,
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.role.key)
      })),
      nextCursor
    };
  }

  @RequirePermissions('user:role')
  @Post(':userId/roles')
  @HttpCode(200)
  async assignRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() dto: AssignRoleDto
  ) {
    await this.roleService.assignRole(user.id, targetUserId, dto.role);
    return { ok: true };
  }

  @RequirePermissions('user:role')
  @Delete(':userId/roles/:role')
  @HttpCode(200)
  async revokeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Param('role') role: RoleKey
  ) {
    await this.roleService.revokeRole(user.id, targetUserId, role);
    return { ok: true };
  }

  @RequirePermissions('user:ban')
  @Patch(':userId/status')
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateUserStatusDto
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { roles: { select: { role: { select: { key: true } } } } }
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Utilisateur introuvable'
      });
    }

    const targetRoles = targetUser.roles.map((r) => r.role.key);
    this.moderationPolicy.assertCanSanction(
      { id: user.id, roles: user.roles },
      { id: targetUser.id, roles: targetRoles }
    );

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { status: dto.status }
    });

    await this.audit.record({
      actorId: user.id,
      action: `user.status_${dto.status}`,
      targetType: 'user',
      targetId: targetUserId,
      metadata: { previousStatus: targetUser.status, newStatus: dto.status, reason: dto.reason }
    });

    return {
      id: updated.id,
      status: updated.status
    };
  }

  @RequirePermissions('user:ban')
  @Delete(':userId')
  async deleteUser(@CurrentUser() user: AuthenticatedUser, @Param('userId') targetUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { roles: { select: { role: { select: { key: true } } } } }
    });

    if (!targetUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Utilisateur introuvable'
      });
    }

    const targetRoles = targetUser.roles.map((r) => r.role.key);
    this.moderationPolicy.assertCanSanction(
      { id: user.id, roles: user.roles },
      { id: targetUser.id, roles: targetRoles }
    );

    // Suppression logique administrative
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: 'deleted',
        deletedAt: new Date()
      }
    });

    await this.audit.record({
      actorId: user.id,
      action: 'user.admin_deleted',
      targetType: 'user',
      targetId: targetUserId
    });

    return { ok: true };
  }
}
