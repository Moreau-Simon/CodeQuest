import { Injectable } from '@nestjs/common';
import { MembershipService } from '../teams/membership.service';
import { HealthService, type HealthSubjectType, type HealthView } from './health.service';

/**
 * Pool de PV partagé d'une équipe (T181, FR-071).
 *
 * Le subject `team` porte un unique `player_health` : tous les membres voient
 * la même barre, et seuls les membres actifs peuvent l'alimenter.
 */
@Injectable()
export class TeamHealthService {
  constructor(
    private readonly health: HealthService,
    private readonly membership: MembershipService
  ) {}

  read(teamId: string): Promise<HealthView> {
    return this.health.read('team', teamId);
  }

  async damage(teamId: string, userId: string, amount: number, reason: string): Promise<HealthView> {
    await this.membership.assertCanContribute(teamId, userId);
    return this.health.damage('team', teamId, amount, reason);
  }

  restore(teamId: string, amount: number, source: string): Promise<HealthView> {
    return this.health.restore('team', teamId, amount, source);
  }

  /** Vérifie qu'un joueur peut contribuer au pool sans le modifier. */
  async assertCanContribute(teamId: string, userId: string): Promise<void> {
    await this.membership.assertCanContribute(teamId, userId);
  }

  subject(teamId: string): { subjectType: HealthSubjectType; subjectId: string } {
    return { subjectType: 'team', subjectId: teamId };
  }
}
