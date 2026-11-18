import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../rbac/rbac.constants';
import { Authenticated, Public } from '../rbac/rbac.constants';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { AuthService } from './auth.service';
import {
  PasswordResetRateLimit,
  RefreshRateLimit,
  RegisterRateLimit,
  SensitiveRateLimit
} from './auth.rate-limit';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto';
import { LoginDto, LogoutDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { REFRESH_COOKIE, clearSessionCookies, setSessionCookies } from './session.cookies';
import { SessionService, type SessionContext } from './session.service';

/**
 * Routes d'authentification (T053), conformes à `contracts/openapi.yaml`.
 * Toutes sont publiques sauf `logout`, qui exige une session valide.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService
  ) {}

  @Public()
  @RegisterRateLimit()
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() request: Request): Promise<void> {
    await this.auth.register(dto, contextOf(request));
  }

  @Public()
  @SensitiveRateLimit()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const session = await this.auth.login(dto, contextOf(request));
    setSessionCookies(response, session);
  }

  @Public()
  @RefreshRateLimit()
  @Post('refresh')
  @HttpCode(204)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    const token = readCookie(request, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Session expirée ou invalide'
      });
    }

    const session = await this.sessions.rotate(token, contextOf(request));
    setSessionCookies(response, session);
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: LogoutDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.auth.logout(user.id, user.sessionId!, dto.all === true);
    clearSessionCookies(response);
  }

  @Public()
  @PasswordResetRateLimit()
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // Même réponse, même latence perçue, que l'adresse existe ou non (FR-007).
    await this.auth.forgotPassword(dto.identifier);
  }

  @Public()
  @SensitiveRateLimit()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @SensitiveRateLimit()
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }
}

export function contextOf(request: Request): SessionContext {
  const userAgent = request.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    ipPrefix: request.ipPrefix ?? null
  };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[name];
  if (typeof value === 'string') return value;

  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}
