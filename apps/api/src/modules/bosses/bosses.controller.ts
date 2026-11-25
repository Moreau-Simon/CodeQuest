import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';
import { BossService, type BossSubmissionView, type BossView } from './boss.service';
import { HealthService, type HealthView } from './health.service';

export class SubmitBossPhaseDto {
  @IsIn(['python', 'javascript'])
  language!: 'python' | 'javascript';

  @IsString()
  @MinLength(1)
  @MaxLength(131_072)
  code!: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;
}

/** Routes boss et santé du joueur (T182, FR-066 à FR-071). */
@Authenticated()
@Controller()
export class BossesController {
  constructor(
    private readonly bosses: BossService,
    private readonly health: HealthService
  ) {}

  @Get('bosses')
  list(@CurrentUser() user: AuthenticatedUser): Promise<BossView[]> {
    return this.bosses.list(user);
  }

  @Post('bosses/:bossId/phases/:phaseId/submissions')
  @HttpCode(202)
  submitPhase(
    @Param('bossId') bossId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: SubmitBossPhaseDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<BossSubmissionView> {
    return this.bosses.submitPhase(bossId, phaseId, user, dto);
  }

  @Get('me/health')
  myHealth(@CurrentUser() user: AuthenticatedUser): Promise<HealthView> {
    return this.health.read('player', user.id);
  }
}
