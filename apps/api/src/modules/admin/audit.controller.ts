import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequirePermissions } from '../rbac/rbac.constants';

/**
 * Contrôleur de consultation du journal d'audit (T110, FR-089).
 */
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions('audit:read')
  @Get()
  async listLogs(
    @Query('actorId') actorId?: string,
    @Query('targetType') targetType?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string
  ) {
    const limit = Math.min(Math.max(Number(limitStr) || 20, 1), 100);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        actorId: actorId || undefined,
        targetType: targetType || undefined
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' }
    });

    const page = logs.slice(0, limit);
    const nextCursor = logs.length > limit ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page,
      nextCursor
    };
  }
}
