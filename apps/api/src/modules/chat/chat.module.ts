import { forwardRef, Module } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { RealtimeModule } from '../../realtime/realtime.module';
import { AdminModule } from '../admin/admin.module';
import { ChatAdminController } from './chat-admin.controller';
import { ChatController } from './chat.controller';
import { ChatRateLimitService } from './chat-rate-limit.service';
import { ChatService } from './chat.service';
import { ModerationService } from './moderation.service';
import { ReportsService } from './reports.service';
import { VoiceService } from './voice.service';

/** US15 (T229–T236) : chat textuel, modération et salons vocaux. */
@Module({
  imports: [forwardRef(() => RealtimeModule), AdminModule],
  controllers: [ChatController, ChatAdminController],
  providers: [
    RateLimitService,
    ChatService,
    ChatRateLimitService,
    ModerationService,
    ReportsService,
    VoiceService
  ],
  exports: [ChatService, ChatRateLimitService, ModerationService, ReportsService, VoiceService]
})
export class ChatModule {}
