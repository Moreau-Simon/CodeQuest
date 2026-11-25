import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { TeamsModule } from '../teams/teams.module';
import { BossGuard } from './boss.guard';
import { BossService } from './boss.service';
import { BossesController } from './bosses.controller';
import { HealthService } from './health.service';
import { TeamHealthService } from './team-health.service';

/** US10 — boss en phases, PV et pool d'équipe (T177 à T183). */
@Module({
  imports: [RealtimeModule, SubmissionsModule, TeamsModule],
  controllers: [BossesController],
  providers: [BossService, BossGuard, HealthService, TeamHealthService],
  exports: [BossService, HealthService, TeamHealthService]
})
export class BossesModule {}
