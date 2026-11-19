import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser, RequirePermissions } from '../rbac/rbac.constants';
import { ChallengeValidationService } from './challenge-validation.service';
import {
  ChallengesAdminService,
  type CreateChallengeDraftInput,
  type UpdateChallengeInput
} from './challenges.admin.service';

/**
 * Contrôleur d'administration des défis (T106, FR-084 à FR-087).
 */
@Controller('admin/challenges')
export class ChallengesAdminController {
  constructor(
    private readonly challengesAdmin: ChallengesAdminService,
    private readonly validation: ChallengeValidationService
  ) {}

  @RequirePermissions('challenge:write')
  @Post()
  @HttpCode(201)
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateChallengeDraftInput
  ) {
    return this.challengesAdmin.createDraft(user.id, body);
  }

  @RequirePermissions('challenge:validate')
  @Post(':challengeId/validate')
  @HttpCode(200)
  async validate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string
  ) {
    return this.validation.validateChallenge(challengeId, user.id);
  }

  @RequirePermissions('challenge:write')
  @Patch(':challengeId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string,
    @Body() body: UpdateChallengeInput
  ) {
    return this.challengesAdmin.update(challengeId, user.id, body);
  }

  @RequirePermissions('challenge:write')
  @Delete(':challengeId')
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('challengeId') challengeId: string) {
    return this.challengesAdmin.archive(challengeId, user.id);
  }
}
