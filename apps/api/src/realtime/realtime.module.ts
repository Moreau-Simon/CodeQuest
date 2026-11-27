import { forwardRef, Module } from '@nestjs/common';
import { ChatModule } from '../modules/chat/chat.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeSessions } from './realtime.sessions';
import { YjsProvider } from './yjs.provider';

@Module({
  imports: [forwardRef(() => ChatModule)],
  providers: [RealtimeSessions, RealtimeGateway, YjsProvider],
  exports: [RealtimeSessions, RealtimeGateway, YjsProvider]
})
export class RealtimeModule {}
