import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDefined, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser, Public } from '../rbac/rbac.constants';
import { AnalyticsService, type FirstAttemptStats } from './analytics.service';
import {
  LessonsService,
  type CompleteResult,
  type LessonDetail,
  type LessonProgressView,
  type LessonSummary,
  type QuizResult
} from './lessons.service';
import { PositioningService, type PositioningResult } from './positioning.service';
import type { QuizAnswers } from './quiz';

export class QuizAnswersDto {
  @IsObject()
  @IsDefined()
  answers!: QuizAnswers;
}

export class CompleteLessonDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  quizScore!: number;

  @IsOptional()
  @IsObject()
  answers?: QuizAnswers;
}

export class LessonsQueryDto {
  @IsOptional()
  @IsString()
  theme?: string;
}

/** Routes `/lessons` (T136). Lecture publique, écritures réservées aux comptes confirmés. */
@Controller('lessons')
export class LessonsController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly positioning: PositioningService,
    private readonly analytics: AnalyticsService
  ) {}

  @Public()
  @Get()
  list(
    @Query() query: LessonsQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<LessonSummary[]> {
    return this.lessons.list(user?.id, query.theme);
  }

  @Public()
  @Get('metrics/first-attempt')
  firstAttemptStats(@Query('lessonId') lessonId?: string): Promise<FirstAttemptStats> {
    return this.analytics.firstAttemptSuccessRate(lessonId);
  }

  @Public()
  @Get(':lessonId')
  detail(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user?: AuthenticatedUser
  ): Promise<LessonDetail> {
    return this.lessons.detail(lessonId, user?.id);
  }

  @Authenticated()
  @Post(':lessonId/start')
  @HttpCode(HttpStatus.OK)
  start(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<LessonProgressView> {
    return this.lessons.start(lessonId, user.id);
  }

  @Authenticated()
  @Post(':lessonId/quiz')
  @HttpCode(HttpStatus.OK)
  quiz(
    @Param('lessonId') lessonId: string,
    @Body() body: QuizAnswersDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<QuizResult> {
    return this.lessons.quiz(lessonId, user.id, body.answers);
  }

  @Authenticated()
  @Post(':lessonId/positioning')
  @HttpCode(HttpStatus.OK)
  positioningAttempt(
    @Param('lessonId') lessonId: string,
    @Body() body: QuizAnswersDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PositioningResult> {
    return this.positioning.attempt(lessonId, user.id, body.answers);
  }

  @Authenticated()
  @Post(':lessonId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('lessonId') lessonId: string,
    @Body() body: CompleteLessonDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CompleteResult> {
    return this.lessons.complete(lessonId, user.id, body);
  }
}
