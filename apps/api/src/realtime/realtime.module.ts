import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeSessions } from './realtime.sessions';
import { YjsProvider } from './yjs.provider';

@Module({
  providers: [RealtimeSessions, RealtimeGateway, YjsProvider],
  exports: [RealtimeSessions, RealtimeGateway, YjsProvider]
})
export class RealtimeModule {}
