import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { InstanceService } from './instance.service';
import { PrerequisiteGraphService } from './prerequisite-graph.service';
import { PrerequisiteCheckService } from './prerequisite-check.service';

@Module({
  controllers: [ChallengesController],
  providers: [
    ChallengesService,
    InstanceService,
    PrerequisiteGraphService,
    PrerequisiteCheckService
  ],
  exports: [ChallengesService, InstanceService, PrerequisiteGraphService, PrerequisiteCheckService]
})
export class ChallengesModule {}
