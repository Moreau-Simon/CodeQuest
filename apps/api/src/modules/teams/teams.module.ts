import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { CaptaincyService } from './captaincy.service';
import { OfficialSubmissionService } from './official-submission.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/** US8 : équipes, désignation officielle et classements d'équipe. */
@Module({
  imports: [LeaderboardsModule],
  controllers: [TeamsController],
  providers: [TeamsService, CaptaincyService, OfficialSubmissionService],
  exports: [TeamsService, CaptaincyService, OfficialSubmissionService]
})
export class TeamsModule {}
