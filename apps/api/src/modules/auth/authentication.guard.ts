import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { verifyAccessToken } from '../../common/auth/access-token';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { requestStore } from '../../common/middleware/request-context.middleware';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from './session.cookies';
import { SessionService } from './session.service';

/**
 * Authentification par cookie `access_token` (T060, FR-017).
 *
 * Le guard ne refuse jamais directement : il attache `request.user` quand la
 * session est valide, puis laisse `RbacGuard` décider (refus par défaut). Une
 * route publique avec un cookie expiré reste donc accessible en anonyme.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readCookie(request, ACCESS_COOKIE);
    if (!token) return true;

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token, env.SESSION_SECRET);
    } catch {
      return true;
    }

    if (!(await this.sessions.isActive(payload.sid, payload.sub))) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        pseudonym: true,
        status: true,
        deletedAt: true,
        roles: {
          select: {
            role: {
              select: {
                key: true,
                permissions: { select: { permission: { select: { key: true } } } }
              }
            }
          }
        }
      }
    });

    if (!user || user.deletedAt !== null || user.status === 'deleted') return true;

    const roles = user.roles.map((entry) => entry.role.key);
    const permissions = new Set(
      user.roles.flatMap((entry) => entry.role.permissions.map((link) => link.permission.key))
    );

    const authenticated: AuthenticatedUser = {
      id: user.id,
      pseudonym: user.pseudonym,
      status: user.status,
      roles,
      permissions,
      sessionId: payload.sid,
      authenticatedAt: new Date(payload.iat * 1_000)
    };

    request.user = authenticated;

    const store = requestStore.getStore();
    if (store) store.userId = authenticated.id;

    return true;
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[name];
  if (typeof value === 'string') return value;

  // Repli robuste : le parseur de cookies n'est pas disponible sur toutes les
  // connexions (tests unitaires, garde exécuté hors pipeline Express).
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
