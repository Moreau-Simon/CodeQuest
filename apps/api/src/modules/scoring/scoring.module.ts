import { Module } from '@nestjs/common';
import { ResolutionScoringService } from './resolution-scoring.service';
import { ScoringService } from './scoring.service';

@Module({
  providers: [ScoringService, ResolutionScoringService],
  exports: [ScoringService, ResolutionScoringService]
})
export class ScoringModule {}
