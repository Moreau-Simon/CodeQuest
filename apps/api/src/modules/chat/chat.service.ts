import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { ChatChannel } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ReportsService } from './reports.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatChannelView {
  id: string;
  name: string;
  kind: 'global' | 'team' | 'event' | 'spectator';
  canWrite: boolean;
}

export interface ChatMessageView {
  id: string;
  channelId: string;
  authorName: string;
  body: string;
  createdAt: string;
  deleted: boolean;
}

export interface ChatHistoryView {
  items: ChatMessageView[];
  nextCursor: string | null;
}

export type ChatSendResult = ChatMessageView;

/** FR-092 : refus d'un canal dont le compte n'est pas dans l'audience. */
export function forbiddenRoom(): ForbiddenException {
  return new ForbiddenException({ code: 'FORBIDDEN_ROOM', message: 'Canal non autorisé' });
}

/**
 * T230 (FR-091/FR-092) : envoi idempotent, historique paginé et contrôle de
 * l'audience côté serveur. Le socket n'est qu'un transport : toute écriture
 * repasse par ce service.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly rateLimit: ChatRateLimitService,
    private readonly reports: ReportsService
  ) {}

  /** Canaux accessibles au compte : le serveur filtre toute audience (FR-092). */
  async listChannels(userId: string): Promise<ChatChannelView[]> {
    const channels = await this.prisma.chatChannel.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }]
    });
    const accessible: ChatChannelView[] = [];
    for (const channel of channels) {
      try {
        await this.assertAccess(channel.id, userId);
      } catch {
        continue;
      }
      accessible.push({
        id: channel.id,
        name: channel.name,
        kind: channel.kind,
        canWrite: channel.kind !== 'spectator'
      });
    }
    return accessible;
  }

  async assertAccess(channelId: string, userId: string): Promise<ChatChannel> {
    if (!UUID_PATTERN.test(channelId)) {
      throw new BadRequestException({ code: 'INVALID_PAYLOAD', message: 'Canal invalide' });
    }
    const channel = await this.prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw forbiddenRoom();

    if (channel.kind === 'global') return channel;
    if (!channel.scopeId) throw forbiddenRoom();

    if (channel.kind === 'team') {
      const membership = await this.prisma.teamMember.findFirst({
        where: { teamId: channel.scopeId, userId, leftAt: null },
        select: { id: true }
      });
      if (membership) return channel;
      throw forbiddenRoom();
    }

    const participation = await this.prisma.eventParticipant.findUnique({
      where: {
        eventId_subjectType_subjectId: {
          eventId: channel.scopeId,
          subjectType: 'player',
          subjectId: userId
        }
      },
      select: { eliminatedAt: true }
    });
    if (!participation) throw forbiddenRoom();
    if (channel.kind === 'spectator' && participation.eliminatedAt) return channel;
    if (channel.kind === 'event' && !participation.eliminatedAt) return channel;
    throw forbiddenRoom();
  }

  async send(input: {
    channelId: string;
    userId: string;
    body: unknown;
    clientMessageId: unknown;
    address: string;
  }): Promise<ChatSendResult> {
    const { channelId, userId, address } = input;
    if (
      typeof input.body !== 'string' ||
      input.body.trim().length < 1 ||
      input.body.length > 2_000
    ) {
      throw new BadRequestException({
        code: 'INVALID_PAYLOAD',
        message: 'Message entre 1 et 2 000 caractères requis'
      });
    }
    if (typeof input.clientMessageId !== 'string' || !UUID_PATTERN.test(input.clientMessageId)) {
      throw new BadRequestException({
        code: 'INVALID_PAYLOAD',
        message: 'clientMessageId UUID requis'
      });
    }

    const channel = await this.assertAccess(channelId, userId);
    if (channel.kind === 'spectator') throw forbiddenRoom();

    // Rejeu : même réponse, aucune écriture et aucune consommation de débit.
    const existing = await this.prisma.chatMessage.findUnique({
      where: {
        channelId_clientMessageId: { channelId, clientMessageId: input.clientMessageId }
      }
    });
    if (existing) return this.toView(existing);

    await this.rateLimit.assertCanSend(userId, address);
    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pseudonym: true }
    });
    const message = await this.prisma.chatMessage.create({
      data: {
        id: uuidv7(),
        channelId,
        userId,
        authorLabel: author.pseudonym,
        body: input.body,
        clientMessageId: input.clientMessageId,
        createdAt: this.clock.now()
      }
    });
    return this.toView(message);
  }

  async history(
    channelId: string,
    userId: string,
    cursor?: string,
    limit = 50
  ): Promise<ChatHistoryView> {
    await this.assertAccess(channelId, userId);
    const take = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
    const cursorMessage = cursor
      ? await this.prisma.chatMessage.findUnique({ where: { id: cursor }, select: { createdAt: true } })
      : null;
    if (cursor && !cursorMessage) {
      throw new NotFoundException({ code: 'CURSOR_NOT_FOUND', message: 'Curseur introuvable' });
    }

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        channelId,
        ...(cursorMessage ? { createdAt: { lt: cursorMessage.createdAt } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1
    });
    const hasMore = rows.length > take;
    const page = rows.slice(0, take).reverse();
    return {
      items: page.map((row) => this.toView(row)),
      nextCursor: hasMore ? (page[0]?.id ?? null) : null
    };
  }

  /** Libellé affiché pour un indicateur de frappe (jamais persisté). */
  async authorName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { pseudonym: true }
    });
    return user.pseudonym;
  }

  async report(input: {
    channelId: string;
    messageId: string;
    reporterId: string;
    reason: string;
  }): Promise<void> {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: input.messageId },
      select: { channelId: true }
    });
    if (!message || message.channelId !== input.channelId) {
      throw new NotFoundException({ code: 'MESSAGE_NOT_FOUND', message: 'Message introuvable' });
    }
    await this.reports.createReport({
      messageId: input.messageId,
      reporterId: input.reporterId,
      reason: input.reason
    });
  }

  private toView(message: {
    id: string;
    channelId: string;
    authorLabel: string;
    body: string;
    createdAt: Date;
    deletedAt: Date | null;
  }): ChatMessageView {
    return {
      id: message.id,
      channelId: message.channelId,
      authorName: message.authorLabel,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      deleted: message.deletedAt !== null
    };
  }
}
