import { Module } from '@nestjs/common';
import { RealtimeModule } from '../../realtime/realtime.module';
import { BattleRoyaleGateway } from '../../realtime/battle-royale.gateway';
import { EliminationService } from './elimination.service';
import { EligibilityService } from './eligibility.service';
import { RoundJob } from './round.job';
import { RoundService } from './round.service';
import { SpectatorService } from './spectator.service';

/** US14 (T220–T224) : battle royale synchronisée et spectateurs. */
@Module({
  imports: [RealtimeModule],
  providers: [
    BattleRoyaleGateway,
    EliminationService,
    EligibilityService,
    SpectatorService,
    RoundService,
    RoundJob
  ],
  exports: [
    BattleRoyaleGateway,
    EliminationService,
    EligibilityService,
    SpectatorService,
    RoundService
  ]
})
export class BattleRoyaleModule {}
