import { Body, Controller, Get, HttpCode, HttpStatus, Headers, Param, Post } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';
import { BadgesService } from './badges.service';
import { LedgerService, type WalletView } from './ledger.service';
import { ShopService, type PurchaseView, type ShopItemView } from './shop.service';

export class PurchaseDto {
  @IsOptional()
  @IsUUID('7')
  teamId?: string;
}

/** Portefeuille, boutique et inventaire (US11, FR-073 à FR-076). */
@Authenticated()
@Controller()
export class EconomyController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly shop: ShopService,
    private readonly badges: BadgesService
  ) {}

  @Get('me/wallet')
  async wallet(@CurrentUser() user: AuthenticatedUser): Promise<WalletView> {
    return this.ledger.read(user.id);
  }

  @Get('me/badges')
  async badgesOf(@CurrentUser() user: AuthenticatedUser): Promise<{ keys: string[] }> {
    return { keys: await this.badges.evaluate(user.id) };
  }

  @Get('shop')
  listShop(): Promise<ShopItemView[]> {
    return this.shop.list();
  }

  @Post('shop/:itemId/purchase')
  purchase(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: PurchaseDto
  ): Promise<PurchaseView> {
    return this.shop.purchase(itemId, user, idempotencyKey, { teamId: body.teamId });
  }

  @Post('me/inventory/:itemId/equip')
  @HttpCode(HttpStatus.OK)
  equip(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<{ itemId: string; equipped: boolean }> {
    return this.shop.equip(itemId, user.id);
  }
}
