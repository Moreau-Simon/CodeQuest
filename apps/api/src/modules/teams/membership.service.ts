import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RetainedScoreView {
  challengeId: string;
  subjectType: 'player' | 'team';
  subjectId: string;
  score: number;
}

export interface MembershipSnapshot {
  retained: number;
  canContribute: boolean;
}

/**
 * FR-060 : un départ logique (`TeamMember.leftAt`) ne supprime aucun score.
 * Ce service expose les scores conservés et refuse toute nouvelle contribution
 * au titre de l'équipe aux joueurs qui n'en sont plus membres actifs.
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vérifie qu'un joueur peut encore contribuer au titre de l'équipe. */
  async assertCanContribute(teamId: string, userId: string): Promise<void> {
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, leftAt: null },
      select: { id: true }
    });
    if (!member) {
      throw new ForbiddenException({
        code: 'NOT_TEAM_MEMBER',
        message: 'Le joueur n’est plus membre de cette équipe'
      });
    }
  }

  /**
   * Scores individuels du joueur et scores de l'équipe conservés après un
   * départ ou une exclusion. Aucune ligne n'est supprimée : `BestScore` et
   * `TeamOfficialSubmission` survivent au `leftAt`.
   */
  async retainedScores(teamId: string, userId: string): Promise<RetainedScoreView[]> {
    const rows = await this.prisma.bestScore.findMany({
      where: {
        OR: [
          { subjectType: 'team', subjectId: teamId },
          { subjectType: 'player', subjectId: userId }
        ]
      },
      select: { challengeId: true, subjectType: true, subjectId: true, score: true },
      orderBy: [{ challengeId: 'asc' }, { subjectType: 'asc' }]
    });

    return rows.map((row) => ({
      challengeId: row.challengeId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      score: Number(row.score)
    }));
  }

  /** Instantané utilisé lors d'un départ : scores conservés, contribution fermée. */
  async snapshotAfterLeave(teamId: string, userId: string): Promise<MembershipSnapshot> {
    const retained = await this.retainedScores(teamId, userId);
    const stillActive = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, leftAt: null },
      select: { id: true }
    });
    return { retained: retained.length, canContribute: stillActive !== null };
  }
}
