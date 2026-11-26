import { Module } from '@nestjs/common';
import { EconomyController } from './economy.controller';
import { BadgesService } from './badges.service';
import { HintPolicy } from './hint.policy';
import { LedgerService } from './ledger.service';
import { RewardsService } from './rewards.service';
import { ShopService } from './shop.service';

/** US11 — économie, boutique et badges (T188 à T194). */
@Module({
  controllers: [EconomyController],
  providers: [LedgerService, RewardsService, ShopService, HintPolicy, BadgesService],
  exports: [LedgerService, RewardsService, ShopService, HintPolicy, BadgesService]
})
export class EconomyModule {}
