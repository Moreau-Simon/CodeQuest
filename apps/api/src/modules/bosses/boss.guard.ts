import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { HealthService } from './health.service';

/**
 * Porte d'accès aux boss (T180, FR-068) : un joueur en KO ne peut ni attaquer
 * ni soumettre une phase, et le message affiche le temps de récupération restant.
 */
@Injectable()
export class BossGuard {
  constructor(
    private readonly health: HealthService,
    private readonly clock: Clock
  ) {}

  async assertPlayable(user: AuthenticatedUser): Promise<void> {
    if (user.status === 'pending') {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour affronter un boss'
      });
    }
    if (user.status === 'suspended' || user.status === 'deleted') {
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Ce compte ne peut pas affronter un boss'
      });
    }

    const view = await this.health.read('player', user.id);
    if (view.hp === 0 && view.koUntil && new Date(view.koUntil).getTime() > this.clock.nowMs()) {
      const remainingMs = new Date(view.koUntil).getTime() - this.clock.nowMs();
      const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
      throw new ForbiddenException({
        code: 'BOSS_KO',
        message: `Boss inaccessible : récupération encore nécessaire (${remainingMinutes} min)`,
        details: {
          koUntil: view.koUntil,
          remainingMinutes,
          reason: 'boss_failure'
        }
      });
    }
  }
}
