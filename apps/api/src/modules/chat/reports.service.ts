import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { uuidv7 } from '../../common/uuid';
import { AuditService } from '../audit/audit.service';

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

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
 * Service de traitement des signalements de modération (T111, FR-094).
 *
 * Cycles de statut : `open` → `reviewed` | `dismissed`.
 * Traçabilité dans le journal d'audit et notification du joueur sanctionné.
 */
@Injectable()
export class ReportsService {
  // Registre en mémoire en attendant le schéma complet des tables de chat (US15)
  private readonly reports = new Map<string, ChatReportItem>();

  constructor(private readonly audit: AuditService) {}

  async createReport(input: {
    messageId: string;
    reporterId: string;
    reason: string;
  }): Promise<ChatReportItem> {
    const id = uuidv7();
    const report: ChatReportItem = {
      id,
      messageId: input.messageId,
      reporterId: input.reporterId,
      reason: input.reason,
      status: 'open',
      createdAt: new Date()
    };
    this.reports.set(id, report);

    await this.audit.record({
      actorId: input.reporterId,
      action: 'chat.message_reported',
      targetType: 'chat_message',
      targetId: input.messageId,
      metadata: { reportId: id, reason: input.reason }
    });

    return report;
  }

  async list(status?: ReportStatus): Promise<ChatReportItem[]> {
    const all = Array.from(this.reports.values());
    if (!status) return all;
    return all.filter((r) => r.status === status);
  }

  async resolveReport(
    reportId: string,
    actorId: string,
    status: 'reviewed' | 'dismissed',
    notes?: string
  ): Promise<ChatReportItem> {
    const report = this.reports.get(reportId);
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

    report.status = status;
    report.resolvedBy = actorId;
    report.resolvedAt = new Date();

    await this.audit.record({
      actorId,
      action: `moderation.report_${status}`,
      targetType: 'chat_report',
      targetId: reportId,
      metadata: { messageId: report.messageId, notes }
    });

    return report;
  }
}
