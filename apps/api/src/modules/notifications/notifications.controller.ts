import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { env } from '../../config/env';
import { Authenticated, CurrentUser, Public } from '../rbac/rbac.constants';
import { PushService, type SubscribeInput } from './push.service';

export class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  auth!: string;
}

export class PushSubscriptionDto implements SubscribeInput {
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class RevokeSubscriptionDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  endpoint!: string;
}

/** Routes de consentement Web Push (T244 / FR-104). */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly push: PushService) {}

  /** Clé publique VAPID : donnée publique, nécessaire côté navigateur. */
  @Public()
  @Get('vapid-public-key')
  vapidPublicKey(): { publicKey: string } {
    return { publicKey: env.VAPID_PUBLIC_KEY ?? '' };
  }

  @Authenticated()
  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushSubscriptionDto
  ): Promise<{ id: string; endpoint: string; createdAt: Date }> {
    return this.push.subscribe(user.id, dto);
  }

  @Authenticated()
  @Delete('subscriptions')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: RevokeSubscriptionDto
  ): Promise<{ revoked: true }> {
    await this.push.revoke(user.id, dto.endpoint);
    return { revoked: true };
  }
}
