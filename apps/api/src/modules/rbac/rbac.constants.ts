import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

export const IS_PUBLIC_KEY = 'cq:isPublic';
export const PERMISSIONS_KEY = 'cq:permissions';
export const AUTHENTICATED_KEY = 'cq:authenticated';

/** Route accessible sans authentification (health, login, inscription…). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route réservée aux comptes authentifiés, sans permission RBAC particulière
 * (ex. gestion de son propre profil). Le refus par défaut reste appliqué aux
 * routes qui ne déclarent ni `@Public()`, ni `@Authenticated()`, ni
 * `@RequirePermissions(...)`.
 */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_KEY, true);

/**
 * Déclare les permissions obligatoires. Sans ce décorateur (et sans
 * `@Public()`), le guard refuse la route par défaut.
 */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Injecte l'utilisateur authentifié (ou `undefined` sur une route publique). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<Request>().user
);
