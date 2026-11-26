import { Module } from '@nestjs/common';
import { ChallengesModule } from '../challenges/challenges.module';
import { EconomyModule } from '../economy/economy.module';
import { EventsModule } from '../events/events.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { LessonsModule } from '../lessons/lessons.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { SubmissionsGateway } from '../../realtime/submissions.gateway';
import { ScoringModule } from '../scoring/scoring.module';
import { DiffService } from './diff.service';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { MembershipService } from '../teams/membership.service';
import { VerdictConsumer } from './verdict.consumer';

@Module({
  imports: [
    ChallengesModule,
    EconomyModule,
    EventsModule,
    LeaderboardsModule,
    LessonsModule,
    RealtimeModule,
    ScoringModule
  ],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    SubmissionsGateway,
    VerdictConsumer,
    DiffService,
    MembershipService
  ],
  exports: [SubmissionsService, DiffService]
})
export class SubmissionsModule {}
