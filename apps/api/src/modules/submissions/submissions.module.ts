import { Module } from '@nestjs/common';
import { ChallengesModule } from '../challenges/challenges.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { SubmissionsGateway } from '../../realtime/submissions.gateway';
import { ScoringModule } from '../scoring/scoring.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { VerdictConsumer } from './verdict.consumer';

@Module({
  imports: [ChallengesModule, LeaderboardsModule, RealtimeModule, ScoringModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsGateway, VerdictConsumer],
  exports: [SubmissionsService]
})
export class SubmissionsModule {}
