import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { NotificationsJob } from './notifications.job';
import { NotificationsController } from './notifications.controller';
import { PUSH_TRANSPORT } from './push.transport';
import { PushService } from './push.service';
import { WebPushTransport } from './web-push.transport';

/** US16 (T244) : abonnements et notifications Web Push/in-app (FR-104). */
@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [
    PushService,
    WebPushTransport,
    { provide: PUSH_TRANSPORT, useExisting: WebPushTransport },
    NotificationsJob
  ],
  exports: [PushService]
})
export class NotificationsModule {}
