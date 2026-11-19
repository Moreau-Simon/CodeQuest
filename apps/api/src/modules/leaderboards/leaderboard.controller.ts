import { Controller, Get, Param, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { CurrentUser, Public } from '../rbac/rbac.constants';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { LeaderboardScopeType } from '@prisma/client';
import {
  LEADERBOARD_PERIODS,
  LEADERBOARD_SCOPES,
  type LeaderboardPeriod
} from './leaderboard.constants';
import { LeaderboardService, type LeaderboardResult } from './leaderboard.service';

export class LeaderboardQueryDto {
  @IsOptional()
  @IsIn([...LEADERBOARD_SCOPES])
  scope?: LeaderboardScopeType;

  @IsOptional()
  @IsUUID()
  scopeId?: string;

  @IsOptional()
  @IsIn([...LEADERBOARD_PERIODS])
  period?: LeaderboardPeriod;

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

export class TeamLeaderboardQueryDto {
  @IsOptional()
  @IsIn([...LEADERBOARD_PERIODS])
  period?: LeaderboardPeriod;

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

export class EventLeaderboardQueryDto {
  @IsOptional()
  @IsIn([...LEADERBOARD_PERIODS])
  period?: LeaderboardPeriod;

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
 * Classements publics (US3, T096). Les filtres de portée et de période sont
 * validés avant toute requête ; une portée non globale exige un `scopeId`.
 */
@Public()
@Controller('leaderboards')
export class LeaderboardController {
  constructor(private readonly leaderboards: LeaderboardService) {}

  @Get('players')
  players(
    @Query() query: LeaderboardQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<LeaderboardResult> {
    return this.leaderboards.query({
      scope: query.scope ?? 'global',
      scopeId: query.scopeId,
      period: query.period ?? 'all',
      cursor: query.cursor,
      limit: query.limit,
      subjectType: 'player',
      viewerId: user?.id
    });
  }

  @Get('teams')
  teams(
    @Query() query: TeamLeaderboardQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<LeaderboardResult> {
    return this.leaderboards.query({
      scope: 'global',
      period: query.period ?? 'all',
      cursor: query.cursor,
      limit: query.limit,
      subjectType: 'team',
      viewerId: user?.id
    });
  }

  @Get('events/:eventId')
  event(
    @Param('eventId') eventId: string,
    @Query() query: EventLeaderboardQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<LeaderboardResult> {
    return this.leaderboards.query({
      scope: 'event',
      scopeId: eventId,
      period: query.period ?? 'all',
      cursor: query.cursor,
      limit: query.limit,
      subjectType: 'player',
      viewerId: user?.id
    });
  }
}
