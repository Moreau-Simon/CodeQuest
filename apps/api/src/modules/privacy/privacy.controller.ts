import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AuditService } from '../audit/audit.service';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';
import { ConsentService } from './consent.service';

const PURPOSES = ['analytics', 'notifications', 'research'] as const;

class ConsentDto {
  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @IsBoolean()
  granted!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}

class RectifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pseudonym?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;
}

/** Routes self-service RGPD (T256, FR-115). L'effacement reste sur `DELETE /me`. */
@Controller('privacy')
export class PrivacyController {
  constructor(
    private readonly consents: ConsentService,
    private readonly audit: AuditService
  ) {}

  @Authenticated()
  @Get('consents')
  listConsents(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.consents.getConsents(user.id);
  }

  @Authenticated()
  @Post('consents')
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConsentDto
  ): Promise<void> {
    await this.consents.recordConsent(user.id, dto.purpose, dto.granted, dto.source);
    await this.audit.record({
      actorId: user.id,
      action: 'privacy.consent_recorded',
      targetType: 'user',
      targetId: user.id,
      metadata: { purpose: dto.purpose, granted: dto.granted }
    });
  }

  @Authenticated()
  @Get('export')
  export(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.consents.exportData(user.id);
  }

  @Authenticated()
  @Patch('me')
  @HttpCode(204)
  async rectify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RectifyDto
  ): Promise<void> {
    await this.consents.rectify(user.id, dto);
    await this.audit.record({
      actorId: user.id,
      action: 'privacy.data_rectified',
      targetType: 'user',
      targetId: user.id,
      metadata: { fields: Object.keys(dto) }
    });
  }
}
