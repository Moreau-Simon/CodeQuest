import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { LeaderboardGateway } from '../../realtime/leaderboard.gateway';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardRebuildJob } from './rebuild.job';

@Module({
  imports: [RealtimeModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardGateway, LeaderboardRebuildJob],
  exports: [LeaderboardService]
})
export class LeaderboardsModule {}
