import { Module } from '@nestjs/common';
import { AssetProxyController } from './asset-proxy.controller';
import { AssetProxyService } from './asset-proxy.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { ASSETS_FETCH, InstanceService } from './instance.service';
import { PrerequisiteGraphService } from './prerequisite-graph.service';
import { PrerequisiteCheckService } from './prerequisite-check.service';

@Module({
  controllers: [ChallengesController, AssetProxyController],
  providers: [
    { provide: ASSETS_FETCH, useValue: globalThis.fetch },
    AssetProxyService,
    ChallengesService,
    InstanceService,
    PrerequisiteGraphService,
    PrerequisiteCheckService
  ],
  exports: [
    AssetProxyService,
    ChallengesService,
    InstanceService,
    PrerequisiteGraphService,
    PrerequisiteCheckService
  ]
})
export class ChallengesModule {}
