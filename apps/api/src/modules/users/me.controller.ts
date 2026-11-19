import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { clearSessionCookies } from '../auth/session.cookies';
import { AuditService } from '../audit/audit.service';
import { AUTH_AUDIT_EVENTS } from '../auth/audit.events';
import type { SessionSummary } from '../auth/session.service';
import { Authenticated, CurrentUser } from '../rbac/rbac.constants';
import { AccountDeletionService } from './account-deletion.service';
import { DeleteAccountDto, UpdateProfileDto } from './dto/profile.dto';
import { UsersService, type Profile } from './users.service';

/**
 * Routes self-service du compte (T057).
 * `@Authenticated()` suffit : ce sont les données de l'appelant, aucune
 * permission RBAC supplémentaire. Le compte non confirmé peut lire mais pas
 * écrire (FR-003).
 */
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly deletion: AccountDeletionService,
    private readonly audit: AuditService
  ) {}

  @Authenticated()
  @Get()
  profile(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.users.profile(user.id);
  }

  @Authenticated()
  @Patch()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto
  ): Promise<Profile> {
    const profile = await this.users.update(user.id, dto);
    await this.audit.record({
      actorId: user.id,
      action: AUTH_AUDIT_EVENTS.profileUpdated,
      targetType: 'user',
      targetId: user.id,
      metadata: { fields: Object.keys(dto) }
    });
    return profile;
  }

  @Authenticated()
  @Delete()
  @HttpCode(202)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.deletion.delete(user.id, dto.password);
    clearSessionCookies(response);
  }

  @Authenticated()
  @Get('export')
  export(@CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return this.users.export(user.id);
  }

  @Authenticated()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionSummary[]> {
    return this.users.listSessions(user.id, user.sessionId);
  }

  @Authenticated()
  @Delete('sessions')
  @HttpCode(204)
  async revokeAllSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.users.revokeAllSessions(user.id);
    await this.audit.record({
      actorId: user.id,
      action: AUTH_AUDIT_EVENTS.sessionsRevokedAll,
      targetType: 'user',
      targetId: user.id
    });
  }

  @Authenticated()
  @Delete('sessions/:sessionId')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string
  ): Promise<void> {
    await this.users.revokeSession(user.id, sessionId);
    await this.audit.record({
      actorId: user.id,
      action: AUTH_AUDIT_EVENTS.sessionRevoked,
      targetType: 'session',
      targetId: sessionId
    });
  }
}
