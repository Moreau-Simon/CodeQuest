import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RbacGuard } from './rbac.guard';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  } as unknown as ExecutionContext;
}

function reflectorWith(metadata: {
  isPublic?: boolean;
  permissions?: string[];
  authenticated?: boolean;
}) {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'cq:isPublic') return metadata.isPublic;
      if (key === 'cq:permissions') return metadata.permissions;
      if (key === 'cq:authenticated') return metadata.authenticated;
      return undefined;
    })
  } as unknown as Reflector;
}

const player: AuthenticatedUser = {
  id: 'user-1',
  pseudonym: 'ada',
  status: 'active',
  roles: ['player'],
  permissions: new Set(['challenge:read'])
};

describe('RbacGuard', () => {
  it('laisse passer une route @Public()', async () => {
    const guard = new RbacGuard(reflectorWith({ isPublic: true }));
    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
  });

  it('refuse par défaut une route sans permission déclarée', async () => {
    const guard = new RbacGuard(reflectorWith({}));
    await expect(guard.canActivate(contextFor(player))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un utilisateur non authentifié', async () => {
    const guard = new RbacGuard(reflectorWith({ permissions: ['challenge:read'] }));
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('autorise quand la permission est détenue', async () => {
    const guard = new RbacGuard(reflectorWith({ permissions: ['challenge:read'] }));
    await expect(guard.canActivate(contextFor(player))).resolves.toBe(true);
  });

  it('refuse quand une permission manque et détaille les permissions absentes', async () => {
    const guard = new RbacGuard(
      reflectorWith({ permissions: ['challenge:read', 'challenge:write'] })
    );
    await expect(guard.canActivate(contextFor(player))).rejects.toMatchObject({
      response: {
        code: 'MISSING_PERMISSION',
        details: { missing: ['challenge:write'] }
      }
    });
  });

  it('refuse un compte suspendu ou supprimé même avec les permissions', async () => {
    const guard = new RbacGuard(reflectorWith({ permissions: ['challenge:read'] }));
    await expect(
      guard.canActivate(contextFor({ ...player, status: 'suspended' }))
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autorise une route @Authenticated() sans permission particulière', async () => {
    const guard = new RbacGuard(reflectorWith({ authenticated: true }));
    await expect(guard.canActivate(contextFor(player))).resolves.toBe(true);
  });

  it('refuse une route @Authenticated() sans session', async () => {
    const guard = new RbacGuard(reflectorWith({ authenticated: true }));
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
