import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { PrerequisiteGraphService } from './prerequisite-graph.service';
import { PrerequisiteCheckService } from './prerequisite-check.service';

@Module({
  controllers: [ChallengesController],
  providers: [ChallengesService, PrerequisiteGraphService, PrerequisiteCheckService],
  exports: [ChallengesService, PrerequisiteGraphService, PrerequisiteCheckService]
})
export class ChallengesModule {}
