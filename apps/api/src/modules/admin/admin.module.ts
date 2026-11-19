import { Module } from '@nestjs/common';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditController } from './audit.controller';
import { ChallengeValidationService } from './challenge-validation.service';
import { ChallengesAdminController } from './challenges.admin.controller';
import { ChallengesAdminService } from './challenges.admin.service';
import { ModerationPolicy } from './moderation.policy';
import { StatsController } from './stats.controller';
import { UsersAdminController } from './users.admin.controller';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [ChallengesAdminController, UsersAdminController, AuditController, StatsController],
  providers: [ChallengesAdminService, ChallengeValidationService, ModerationPolicy, AesGcmService],
  exports: [ChallengesAdminService, ChallengeValidationService, ModerationPolicy]
})
export class AdminModule {}
