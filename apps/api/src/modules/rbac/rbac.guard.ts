import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTHENTICATED_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from './rbac.constants';

/**
 * Guard RBAC global (T034, FR-019).
 *
 * Refus par défaut : toute route sans `@Public()`, `@Authenticated()` ou
 * `@RequirePermissions(...)` est refusée. Les permissions effectives sont
 * calculées par la couche d'authentification (jointure `user_roles` →
 * `role_permissions`) et attachées à `request.user.permissions`.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    const authenticatedOnly =
      this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets) === true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);

    if ((!required || required.length === 0) && !authenticatedOnly) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Aucune permission n'est déclarée pour cette route (refus par défaut)"
      });
    }

    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentification requise'
      });
    }

    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Ce compte ne peut plus accéder à la plateforme'
      });
    }

    if (authenticatedOnly && (!required || required.length === 0)) {
      return true;
    }

    const missing = (required ?? []).filter((permission) => !user.permissions.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'Permission insuffisante pour cette action',
        details: { missing }
      });
    }

    return true;
  }
}
