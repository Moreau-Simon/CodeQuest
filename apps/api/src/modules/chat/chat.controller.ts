import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  Query
} from '@nestjs/common';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { type ChatChannelView, type ChatHistoryView, ChatService } from './chat.service';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';

export class ChatReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ChatSanctionDto {
  @IsIn(['mute', 'ban'])
  kind!: 'mute' | 'ban';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}

/** US15 : routes REST de lecture et de signalement (le envoi passe par le socket). */
@Controller('channels')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Authenticated()
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<ChatChannelView[]> {
    return this.chat.listChannels(user.id);
  }

  @Authenticated()
  @Get(':channelId/messages')
  history(
    @Param('channelId') channelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string
  ): Promise<ChatHistoryView> {
    return this.chat.history(channelId, user.id, cursor);
  }

  @Authenticated()
  @Post(':channelId/messages/:messageId/reports')
  @HttpCode(HttpStatus.CREATED)
  async report(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatReportDto
  ): Promise<{ reported: true }> {
    await this.chat.assertAccess(channelId, user.id);
    await this.chat.report({
      channelId,
      messageId,
      reporterId: user.id,
      reason: dto.reason
    });
    return { reported: true };
  }
}
