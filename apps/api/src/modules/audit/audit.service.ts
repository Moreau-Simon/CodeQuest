import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { requestStore } from '../../common/middleware/request-context.middleware';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipPrefix?: string | null;
}

/**
 * Journal d'audit append-only (T035, FR-089).
 * Aucune méthode de mise à jour ou de suppression : la base refuse aussi ces
 * opérations via les triggers de la migration initiale.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const context = requestStore.getStore();
    await this.prisma.auditLog.create({
      data: {
        id: uuidv7(),
        actorId: entry.actorId ?? context?.userId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ipPrefix: entry.ipPrefix ?? context?.ipPrefix ?? null
      }
    });
  }
}
