import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SanctionKind } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { channelRoom } from '../../realtime/realtime.constants';
import { ModerationPolicy } from '../admin/moderation.policy';
import { AuditService } from '../audit/audit.service';
import { ReportsService } from './reports.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface SanctionInput {
  actorId: string;
  messageId: string;
  reportId?: string;
  kind: SanctionKind;
  reason: string;
  durationMinutes?: number;
}

/**
 * T232 (FR-094) : suppression logique, mute/ban temporaire, journalisation
 * append-only et notification de l'auteur. La hiérarchie est déléguée à
 * `ModerationPolicy` (FR-090) : un modérateur ne sanctionne ni un admin ni un pair.
 */
@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly policy: ModerationPolicy,
    private readonly reports: ReportsService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtime: RealtimeGateway
  ) {}

  async sanction(input: SanctionInput): Promise<{ messageId: string; endsAt: string }> {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: input.messageId },
      select: { id: true, channelId: true, userId: true }
    });
    if (!message) {
      throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message introuvable' });
    }
    if (!message.userId) {
      throw new NotFoundException({
        code: 'AUTHOR_ANONYMIZED',
        message: 'Auteur déjà anonymisé'
      });
    }

    const userIds = [input.actorId, message.userId];
    const memberships = await this.prisma.userRole.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, role: { select: { key: true } } }
    });
    const rolesOf = (userId: string): string[] =>
      memberships
        .filter((membership) => membership.userId === userId)
        .map((membership) => membership.role.key);
    this.policy.assertCanSanction(
      { id: input.actorId, roles: rolesOf(input.actorId) },
      { id: message.userId, roles: rolesOf(message.userId) }
    );

    const durationMs =
      input.durationMinutes !== undefined
        ? Math.max(1, input.durationMinutes) * 60_000
        : input.kind === 'ban'
          ? DAY
          : HOUR;
    const endsAt = new Date(this.clock.nowMs() + durationMs);
    const deletedAt = this.clock.now();

    await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: { deletedAt, deletedBy: input.actorId }
    });
    const sanction = await this.prisma.chatSanction.create({
      data: {
        id: uuidv7(),
        userId: message.userId,
        channelId: message.channelId,
        kind: input.kind,
        reason: input.reason,
        startsAt: deletedAt,
        endsAt,
        issuedBy: input.actorId
      }
    });

    if (input.reportId) {
      await this.reports.resolveReport(input.reportId, input.actorId, 'reviewed', input.reason);
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'moderation.message_deleted',
      targetType: 'chat_message',
      targetId: message.id,
      metadata: { channelId: message.channelId }
    });
    await this.audit.record({
      actorId: input.actorId,
      action: 'moderation.sanction_issued',
      targetType: 'chat_message',
      targetId: message.id,
      metadata: {
        sanctionId: sanction.id,
        kind: input.kind,
        reason: input.reason,
        expiresAt: endsAt.toISOString(),
        reportId: input.reportId ?? null
      }
    });

    this.realtime.emitToRoom(channelRoom(message.channelId), 'chat.deleted', {
      channelId: message.channelId,
      messageId: message.id,
      deletedBy: 'moderator'
    });
    this.realtime.emitToUser(message.userId, 'chat.sanction', {
      kind: input.kind,
      expiresAt: endsAt.toISOString(),
      reason: input.reason
    });

    return { messageId: message.id, endsAt: endsAt.toISOString() };
  }
}
