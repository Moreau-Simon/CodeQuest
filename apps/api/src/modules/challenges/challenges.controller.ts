import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  Authenticated,
  CurrentUser,
  Public
} from '../rbac/rbac.constants';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  ChallengesService,
  type AttemptView,
  type CatalogQuery,
  type ChallengeDetail,
  type ChallengeSummary
} from './challenges.service';
import { InstanceService } from './instance.service';

export class CatalogQueryDto implements CatalogQuery {
  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @IsOptional()
  @IsIn(['sorting', 'debugging', 'decryption', 'steganography', 'qr_code'])
  type?: string;

  @IsOptional()
  @IsIn(['locked', 'available', 'completed'])
  status?: 'locked' | 'available' | 'completed';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Catalogue public (US2, US5). Un compte non confirmé peut consulter mais
 * jamais soumettre (FR-003) : la contrainte est portée par la soumission.
 */
@Controller('challenges')
export class ChallengesController {
  constructor(
    private readonly challenges: ChallengesService,
    private readonly instances: InstanceService
  ) {}

  @Public()
  @Get()
  list(
    @Query() query: CatalogQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<{
    items: ChallengeSummary[];
    nextCursor: string | null;
  }> {
    return this.challenges.list(query, user?.id);
  }

  @Public()
  @Get(':challengeId')
  async detail(
    @Param('challengeId') challengeId: string,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<ChallengeDetail> {
    const detail = await this.challenges.detail(challengeId, user?.id);

    // FR-040 : l'instance de décryptage est générée pour ce joueur uniquement,
    // à partir d'une graine serveur qui ne quitte jamais l'API.
    if (detail.type === 'decryption' && detail.cipher && user) {
      detail.instance = await this.instances.generate({
        challengeId,
        challengeVersion: detail.currentVersion,
        subjectType: 'player',
        subjectId: user.id,
        cipher: detail.cipher
      });
    }

    return detail;
  }

  /** Déclenchement explicite de l'essai (A5) : réservé aux comptes authentifiés. */
  @Authenticated()
  @Post(':challengeId/attempts')
  start(
    @Param('challengeId') challengeId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AttemptView> {
    return this.challenges.startAttempt(challengeId, user);
  }
}
