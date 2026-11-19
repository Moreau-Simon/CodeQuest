import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RoleKey } from '@prisma/client';

/**
 * Politique de modération hiérarchique (T109, FR-090).
 *
 * Règles :
 * 1. Un modérateur ne peut pas sanctionner un administrateur.
 * 2. Un modérateur ne peut pas sanctionner un pair (autre modérateur).
 * 3. Un utilisateur ne peut pas se sanctionner lui-même.
 * 4. Les administrateurs peuvent sanctionner n'importe quel compte.
 */
@Injectable()
export class ModerationPolicy {
  assertCanSanction(
    actor: { id: string; roles: readonly (string | RoleKey)[] },
    target: { id: string; roles: readonly (string | RoleKey)[] }
  ): void {
    if (actor.id === target.id) {
      throw new ForbiddenException({
        code: 'SELF_SANCTION_FORBIDDEN',
        message: 'Vous ne pouvez pas vous sanctionner vous-même'
      });
    }

    const isActorAdmin = actor.roles.includes('admin');
    if (isActorAdmin) {
      return; // Un admin a tous les droits de modération
    }

    const isActorModerator = actor.roles.includes('moderator');
    if (!isActorModerator) {
      throw new ForbiddenException({
        code: 'MODERATION_PERMISSION_REQUIRED',
        message: 'Droits de modération requis'
      });
    }

    const isTargetAdmin = target.roles.includes('admin');
    if (isTargetAdmin) {
      throw new ForbiddenException({
        code: 'SANCTION_ADMIN_FORBIDDEN',
        message: 'Un modérateur ne peut pas sanctionner un administrateur'
      });
    }

    const isTargetModerator = target.roles.includes('moderator');
    if (isTargetModerator) {
      throw new ForbiddenException({
        code: 'SANCTION_PEER_FORBIDDEN',
        message: 'Un modérateur ne peut pas sanctionner un pair modérateur'
      });
    }
  }
}
