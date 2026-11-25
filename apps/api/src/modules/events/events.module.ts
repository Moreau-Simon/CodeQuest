import { Module } from '@nestjs/common';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { AuditModule } from '../audit/audit.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { AttemptExpiryJob } from './attempt-expiry.job';
import { AttemptService } from './attempt.service';
import { AdminEventsController, EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ResultsService } from './results.service';

/** US9 — événements à essai unique (T167 à T170). */
@Module({
  imports: [AuditModule, LeaderboardsModule],
  controllers: [EventsController, AdminEventsController],
  providers: [EventsService, AttemptService, ResultsService, AttemptExpiryJob, AesGcmService],
  exports: [EventsService, AttemptService, ResultsService]
})
export class EventsModule {}
