import { Controller, Get, Param, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser, Public } from '../rbac/rbac.constants';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import {
  ChallengesService,
  type CatalogQuery,
  type ChallengeDetail,
  type ChallengeSummary
} from './challenges.service';

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
@Public()
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

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

  @Get(':challengeId')
  detail(
    @Param('challengeId') challengeId: string,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<ChallengeDetail> {
    return this.challenges.detail(challengeId, user?.id);
  }
}
