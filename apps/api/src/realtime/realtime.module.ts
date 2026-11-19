import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeSessions } from './realtime.sessions';

@Module({
  providers: [RealtimeSessions, RealtimeGateway],
  exports: [RealtimeSessions, RealtimeGateway]
})
export class RealtimeModule {}
