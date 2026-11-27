import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ReportStatus } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

export type { ReportStatus };

export interface ChatReportItem {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  status: ReportStatus;
  createdAt: Date;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
}

/**
 * Signalements persistés (T111/US15, FR-094).
 *
 * Cycles de statut : `open` → `reviewed` | `dismissed`. Chaque transition est
 * journalisée ; le registre mémoire provisoire de la phase 13 est remplacé par
 * la table `chat_reports`.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  async createReport(input: {
    messageId: string;
    reporterId: string;
    reason: string;
  }): Promise<ChatReportItem> {
    const report = await this.prisma.chatReport.create({
      data: {
        id: uuidv7(),
        messageId: input.messageId,
        reporterId: input.reporterId,
        reason: input.reason,
        status: 'open',
        createdAt: this.clock.now()
      }
    });

    await this.audit.record({
      actorId: input.reporterId,
      action: 'chat.message_reported',
      targetType: 'chat_message',
      targetId: input.messageId,
      metadata: { reportId: report.id, reason: input.reason }
    });

    return report;
  }

  async list(status?: ReportStatus): Promise<ChatReportItem[]> {
    return this.prisma.chatReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolveReport(
    reportId: string,
    actorId: string,
    status: 'reviewed' | 'dismissed',
    notes?: string
  ): Promise<ChatReportItem> {
    const report = await this.prisma.chatReport.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'Signalement introuvable'
      });
    }
    if (report.status !== 'open') {
      throw new BadRequestException({
        code: 'REPORT_ALREADY_RESOLVED',
        message: 'Ce signalement a déjà été traité'
      });
    }

    const resolved = await this.prisma.chatReport.update({
      where: { id: reportId },
      data: { status, resolvedBy: actorId, resolvedAt: this.clock.now() }
    });

    await this.audit.record({
      actorId,
      action: `moderation.report_${status}`,
      targetType: 'chat_report',
      targetId: reportId,
      metadata: { messageId: report.messageId, notes }
    });

    return resolved;
  }
}
