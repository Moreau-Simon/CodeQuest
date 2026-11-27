import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, RequirePermissions } from '../rbac/rbac.constants';
import { ChatSanctionDto } from './chat.controller';
import { ModerationService } from './moderation.service';

/** US15 : modération depuis l'administration, réservée à `chat:moderate`. */
@Controller('admin/chat')
export class ChatAdminController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('messages/:messageId/sanctions')
  @RequirePermissions('chat:moderate')
  @HttpCode(HttpStatus.OK)
  sanction(
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChatSanctionDto
  ): Promise<{ messageId: string; endsAt: string }> {
    return this.moderation.sanction({
      actorId: user.id,
      messageId,
      kind: dto.kind,
      reason: dto.reason,
      durationMinutes: dto.durationMinutes
    });
  }
}
