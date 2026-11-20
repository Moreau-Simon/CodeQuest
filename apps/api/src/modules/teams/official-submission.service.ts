import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LeaderboardService } from '../leaderboards/leaderboard.service';
import { TeamsService } from './teams.service';

export interface OfficialSubmissionView {
  id: string;
  teamId: string;
  challengeId: string;
  submissionId: string;
  score: number;
  designatedBy: string | null;
  designatedAt: string;
}

/**
 * D4 — `TeamOfficialSubmission` est la source de vérité de la désignation
 * officielle ; `Submission.isOfficial` en est le miroir, mis à jour dans la
 * même transaction. Le score d'équipe est réécrit depuis la soumission
 * désignée, sans agrégation des scores individuels (FR-046, clarification 1).
 */
@Injectable()
export class OfficialSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly teams: TeamsService,
    private readonly leaderboards: LeaderboardService,
    private readonly audit: AuditService
  ) {}

  async designate(
    userId: string,
    teamId: string,
    challengeId: string,
    submissionId: string
  ): Promise<OfficialSubmissionView> {
    await this.teams.requireCaptain(teamId, userId);

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        challengeId: true,
        userId: true,
        teamId: true,
        status: true,
        score: true,
        finishedAt: true,
        createdAt: true
      }
    });
    if (
      !submission ||
      submission.challengeId !== challengeId ||
      submission.teamId !== teamId ||
      submission.status !== 'passed' ||
      submission.score === null
    ) {
      throw new BadRequestException({
        code: 'INVALID_OFFICIAL_SUBMISSION',
        message: 'La soumission désignée doit être réussie et appartenir à l’équipe sur ce défi'
      });
    }

    // Un ancien membre peut rester désigné : ses scores acquis sont conservés
    // (FR-060). En revanche une soumission externe ne peut jamais être retenue.
    const membership = await this.prisma.teamMember.findFirst({
      where: { teamId, userId: submission.userId },
      select: { id: true }
    });
    if (!membership) {
      throw new BadRequestException({
        code: 'NOT_A_TEAM_SUBMISSION',
        message: 'La soumission n’a pas été produite par un membre de l’équipe'
      });
    }

    const achievedAt = submission.finishedAt ?? submission.createdAt;
    const designatedAt = this.clock.now();
    const score = Number(submission.score);

    const record = await this.prisma.runInTransaction(async (tx) => {
      const previous = await tx.teamOfficialSubmission.findUnique({
        where: { teamId_challengeId: { teamId, challengeId } }
      });
      if (previous && previous.submissionId !== submissionId) {
        await tx.submission.update({
          where: { id: previous.submissionId },
          data: { isOfficial: false }
        });
      }

      const upserted = await tx.teamOfficialSubmission.upsert({
        where: { teamId_challengeId: { teamId, challengeId } },
        create: {
          id: uuidv7(),
          teamId,
          challengeId,
          submissionId,
          designatedBy: userId,
          designatedAt
        },
        update: { submissionId, designatedBy: userId, designatedAt }
      });

      await tx.submission.update({ where: { id: submissionId }, data: { isOfficial: true } });
      await tx.bestScore.upsert({
        where: {
          challengeId_subjectType_subjectId: {
            challengeId,
            subjectType: 'team',
            subjectId: teamId
          }
        },
        create: {
          id: uuidv7(),
          challengeId,
          subjectType: 'team',
          subjectId: teamId,
          score: submission.score!,
          submissionId,
          achievedAt
        },
        update: { score: submission.score!, submissionId, achievedAt }
      });
      return upserted;
    });

    await this.leaderboards.recordTeamScore({ teamId, challengeId, achievedAt });
    await this.audit.record({
      actorId: userId,
      action: 'team.official_submission_designated',
      targetType: 'team',
      targetId: teamId,
      metadata: { challengeId, submissionId, score }
    });

    return {
      id: record.id,
      teamId,
      challengeId,
      submissionId,
      score,
      designatedBy: record.designatedBy,
      designatedAt: record.designatedAt.toISOString()
    };
  }

  async revoke(userId: string, teamId: string, challengeId: string): Promise<void> {
    await this.teams.requireCaptain(teamId, userId);

    const existing = await this.prisma.teamOfficialSubmission.findUnique({
      where: { teamId_challengeId: { teamId, challengeId } }
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'OFFICIAL_SUBMISSION_NOT_FOUND',
        message: 'Aucune soumission officielle pour ce défi'
      });
    }

    await this.prisma.runInTransaction(async (tx) => {
      await tx.submission.update({
        where: { id: existing.submissionId },
        data: { isOfficial: false }
      });
      await tx.bestScore.deleteMany({
        where: { challengeId, subjectType: 'team', subjectId: teamId }
      });
      await tx.teamOfficialSubmission.delete({ where: { id: existing.id } });
    });

    await this.leaderboards.recordTeamScore({ teamId, challengeId, achievedAt: this.clock.now() });
    await this.audit.record({
      actorId: userId,
      action: 'team.official_submission_revoked',
      targetType: 'team',
      targetId: teamId,
      metadata: { challengeId }
    });
  }
}
