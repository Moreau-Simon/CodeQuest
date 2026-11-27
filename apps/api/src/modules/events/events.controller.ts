import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { BattleRoundView } from '../battle-royale/round.service';
import { RoundService } from '../battle-royale/round.service';
import { Authenticated, CurrentUser, Public, RequirePermissions } from '../rbac/rbac.constants';
import { AttemptService, type EventAttemptView } from './attempt.service';
import {
  EventsService,
  type EventParticipationView,
  type EventView
} from './events.service';
import { ResultsService, type EventResultsView, type EventSolutionView } from './results.service';

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsIn(['standard', 'battle_royale'])
  type!: 'standard' | 'battle_royale';

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  challengeIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(2)
  minParticipants?: number;

  @IsOptional()
  @IsObject()
  rewards?: Record<string, unknown>;
}

/** Routes événements (FR-061 à FR-065). Refus par défaut sauf la liste publique. */
@Authenticated()
@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly attempts: AttemptService,
    private readonly results: ResultsService,
    private readonly rounds: RoundService
  ) {}

  @Public()
  @Get()
  list(@CurrentUser() user?: AuthenticatedUser): Promise<EventView[]> {
    return this.events.list(user?.id);
  }

  @Post(':eventId/join')
  @HttpCode(201)
  join(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EventParticipationView> {
    return this.events.join(eventId, user);
  }

  @Post(':eventId/start')
  @HttpCode(200)
  start(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EventAttemptView> {
    return this.attempts.start(eventId, user);
  }

  @Get(':eventId/rounds')
  roundsFor(@Param('eventId') eventId: string): Promise<BattleRoundView[]> {
    return this.rounds.list(eventId);
  }

  @Get(':eventId/results')
  resultsFor(@Param('eventId') eventId: string): Promise<EventResultsView> {
    return this.results.get(eventId);
  }

  @Get(':eventId/challenges/:challengeId/solution')
  solutionFor(
    @Param('eventId') eventId: string,
    @Param('challengeId') challengeId: string
  ): Promise<EventSolutionView> {
    return this.results.solution(eventId, challengeId);
  }
}

/** Création d'événement : nécessite le droit de publication de défis. */
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('challenge:write')
  create(@Body() dto: CreateEventDto, @CurrentUser() user: AuthenticatedUser): Promise<EventView> {
    return this.events.create(dto, user);
  }
}
