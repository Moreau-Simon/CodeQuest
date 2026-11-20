import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Authenticated, CurrentUser, Public } from '../rbac/rbac.constants';
import { OfficialSubmissionService, type OfficialSubmissionView } from './official-submission.service';
import { TeamsService, type InvitationView, type TeamView } from './teams.service';

export class CreateTeamDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(6)
  tag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  logo?: string;
}

export class InviteDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  pseudonym?: string;
}

export class JoinTeamDto {
  @IsString()
  @MinLength(10)
  token!: string;
}

export class TransferCaptainDto {
  @IsUUID()
  userId!: string;
}

export class DesignateOfficialDto {
  @IsUUID()
  challengeId!: string;

  @IsUUID()
  submissionId!: string;
}

/** Routes équipes (FR-055 à FR-058). Refus par défaut sauf la lecture publique. */
@Authenticated()
@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teams: TeamsService,
    private readonly official: OfficialSubmissionService
  ) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTeamDto): Promise<TeamView> {
    return this.teams.create(user.id, dto);
  }

  @Public()
  @Get(':teamId')
  get(@Param('teamId') teamId: string): Promise<TeamView> {
    return this.teams.get(teamId);
  }

  @Post(':teamId/invitations')
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: InviteDto
  ): Promise<InvitationView> {
    return this.teams.invite(user.id, teamId, dto.pseudonym);
  }

  @Post(':teamId/members')
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: JoinTeamDto
  ): Promise<TeamView> {
    return this.teams.join(user.id, teamId, dto.token);
  }

  @Delete(':teamId/members/:userId')
  @HttpCode(204)
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string
  ): Promise<void> {
    return this.teams.leave(user.id, teamId, userId);
  }

  @Patch(':teamId/captain')
  transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: TransferCaptainDto
  ): Promise<TeamView> {
    return this.teams.transferCaptaincy(user.id, teamId, dto.userId);
  }

  @Post(':teamId/official-submission')
  @HttpCode(200)
  designate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: DesignateOfficialDto
  ): Promise<OfficialSubmissionView> {
    return this.official.designate(user.id, teamId, dto.challengeId, dto.submissionId);
  }

  @Delete(':teamId/official-submission/:challengeId')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Param('challengeId') challengeId: string
  ): Promise<void> {
    return this.official.revoke(user.id, teamId, challengeId);
  }
}
