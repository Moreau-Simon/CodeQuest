import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';
import { SubmissionsService, type SubmissionView } from './submissions.service';

export class CreateSubmissionDto {
  @IsIn(['python', 'javascript'])
  language!: 'python' | 'javascript';

  @IsString()
  @MaxLength(131_072)
  code!: string;

  /** Essai démarré explicitement, obligatoire pour les défis chronométrés (A5). */
  @IsOptional()
  @IsUUID('7')
  attemptId?: string;
}

/** Soumissions (T077) : `202` à la création, lecture de repli du temps réel. */
@Controller()
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Authenticated()
  @Post('challenges/:challengeId/submissions')
  @HttpCode(202)
  create(
    @Param('challengeId') challengeId: string,
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<SubmissionView> {
    return this.submissions.create(challengeId, user, dto, idempotencyKey);
  }

  @Authenticated()
  @Get('submissions/:submissionId')
  get(
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<SubmissionView> {
    return this.submissions.get(submissionId, user);
  }
}
