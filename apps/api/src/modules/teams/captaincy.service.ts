import { Injectable } from '@nestjs/common';
import { Prisma, type Team } from '@prisma/client';
import { Clock } from '../../common/clock';

/**
 * Capitainerie (FR-014, FR-056). Le transfert à la suppression de compte est
 * déjà réalisé en SQL par `account-deletion.service.ts` (qui gère aussi
 * l'anonymisation) ; ce service couvre les départs et exclusions d'équipe.
 * Toutes les écritures se font dans la transaction du départ appelant.
 */
@Injectable()
export class CaptaincyService {
  constructor(private readonly clock: Clock) {}

  /**
   * Transfère la capitainerie au membre actif le plus ancien quand le
   * capitaine quitte l'équipe. Sans remplaçant, l'équipe est dissoute
   * logiquement afin de conserver les scores acquis (FR-060).
   *
   * @returns l'identifiant du nouveau capitaine, ou `null` si dissolution.
   */
  async transferOnDeparture(
    tx: Prisma.TransactionClient,
    teamId: string,
    leavingUserId: string,
    now: Date = this.clock.now()
  ): Promise<string | null> {
    await tx.$queryRawUnsafe('SELECT id FROM "teams" WHERE id = $1::uuid FOR UPDATE', teamId);
    const team = await tx.team.findUnique({
      where: { id: teamId },
      select: { captainId: true, disbandedAt: true }
    });
    if (!team || team.disbandedAt || team.captainId !== leavingUserId) {
      return team?.captainId ?? null;
    }

    const successor = await tx.teamMember.findFirst({
      where: { teamId, userId: { not: leavingUserId }, leftAt: null },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, userId: true }
    });

    if (!successor) {
      await tx.team.update({
        where: { id: teamId },
        data: { captainId: null, disbandedAt: now }
      });
      return null;
    }

    await tx.team.update({ where: { id: teamId }, data: { captainId: successor.userId } });
    await tx.teamMember.updateMany({
      where: { teamId, leftAt: null, role: 'captain' },
      data: { role: 'member' }
    });
    await tx.teamMember.update({ where: { id: successor.id }, data: { role: 'captain' } });
    return successor.userId;
  }
}

/** Utilisé par les tests pour vérifier l'état d'une équipe dissoute. */
export type DisbandableTeam = Pick<Team, 'captainId' | 'disbandedAt'>;
