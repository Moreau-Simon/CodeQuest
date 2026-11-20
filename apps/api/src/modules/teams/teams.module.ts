import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { CaptaincyService } from './captaincy.service';
import { ContributionService } from './contribution.service';
import { MembershipService } from './membership.service';
import { OfficialSubmissionService } from './official-submission.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

/** US8 : équipes, désignation officielle, contribution et classements d'équipe. */
@Module({
  imports: [LeaderboardsModule],
  controllers: [TeamsController],
  providers: [
    TeamsService,
    CaptaincyService,
    OfficialSubmissionService,
    MembershipService,
    ContributionService
  ],
  exports: [
    TeamsService,
    CaptaincyService,
    OfficialSubmissionService,
    MembershipService,
    ContributionService
  ]
})
export class TeamsModule {}
