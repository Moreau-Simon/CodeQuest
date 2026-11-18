import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { PositioningService } from './positioning.service';
import { XpService } from './xp.service';

/**
 * US6 — cours, progression, positionnement, XP et analytics.
 * `XpService` et `AnalyticsService` sont exportés pour le consommateur de
 * verdicts : l'XP et la mesure SC-010 suivent la soumission retenue.
 */
@Module({
  controllers: [LessonsController],
  providers: [LessonsService, PositioningService, XpService, AnalyticsService],
  exports: [LessonsService, XpService, AnalyticsService]
})
export class LessonsModule {}
