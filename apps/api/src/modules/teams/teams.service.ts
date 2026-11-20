import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Clock } from '../../common/clock';
import { env } from '../../config/env';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CaptaincyService } from './captaincy.service';

export const TEAM_MIN_SIZE = 2;
export const TEAM_MAX_SIZE = 5;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_SIZE_SETTING_KEY = 'team.max_size';

export interface CreateTeamInput {
  name: string;
  tag: string;
  description?: string;
  logo?: string;
}

export interface TeamMemberView {
  userId: string;
  pseudonym: string;
  role: 'captain' | 'member';
  joinedAt: string;
}

export interface TeamView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logoKey: string | null;
  captainId: string | null;
  members: TeamMemberView[];
  createdAt: string;
  disbandedAt: string | null;
}

export interface InvitationView {
  token: string;
  inviteUrl: string;
  teamId: string;
  expiresAt: string;
}

/**
 * Équipes (FR-055, FR-056, FR-014). Les contraintes concurrentielles sont
 * portées par la base : index partiel `UNIQUE (user_id) WHERE left_at IS NULL`
 * et verrouillage de la ligne `teams` pendant l'adhésion et le transfert.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly captaincy: CaptaincyService
  ) {}

  /** Taille maximale configurable via `platform_settings` (par défaut 5). */
  async maxSize(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: MAX_SIZE_SETTING_KEY }
    });
    const raw = setting?.value;
    const config = raw as { maxSize?: unknown } | null;
    const candidate = typeof raw === 'number' ? raw : config?.maxSize ?? TEAM_MAX_SIZE;
    const parsed = Number(candidate);
    return Number.isInteger(parsed) ? Math.min(10, Math.max(TEAM_MIN_SIZE, parsed)) : TEAM_MAX_SIZE;
  }

  async create(userId: string, input: CreateTeamInput): Promise<TeamView> {
    if (input.name.trim().length < 3 || input.name.trim().length > 40) {
      throw new BadRequestException({ code: 'TEAM_NAME_INVALID', message: 'Nom d’équipe invalide' });
    }
    if (input.tag.trim().length < 2 || input.tag.trim().length > 6) {
      throw new BadRequestException({ code: 'TEAM_TAG_INVALID', message: 'Tag d’équipe invalide' });
    }

    let teamId: string;
    try {
      teamId = await this.prisma.runInTransaction(async (tx) => {
        const active = await tx.teamMember.findFirst({
          where: { userId, leftAt: null },
          select: { id: true }
        });
        if (active) {
          throw new ConflictException({
            code: 'ALREADY_IN_TEAM',
            message: 'Un joueur ne peut appartenir qu’à une seule équipe active'
          });
        }

        const id = uuidv7();
        await tx.team.create({
          data: {
            id,
            name: input.name.trim(),
            tag: input.tag.trim().toUpperCase(),
            description: input.description ?? null,
            logoKey: input.logo ?? null,
            captainId: userId
          }
        });
        await tx.teamMember.create({
          data: { id: uuidv7(), teamId: id, userId, role: 'captain' }
        });
        return id;
      });
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }

    await this.audit.record({ actorId: userId, action: 'team.created', targetType: 'team', targetId: teamId });
    return this.get(teamId);
  }

  async get(teamId: string): Promise<TeamView> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, disbandedAt: null },
      include: {
        members: {
          where: { leftAt: null },
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { pseudonym: true } } }
        }
      }
    });
    if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' });
    return this.toView(team);
  }

  async invite(captainId: string, teamId: string, pseudonym?: string): Promise<InvitationView> {
    await this.requireCaptain(teamId, captainId);

    let invitedUserId: string | null = null;
    if (pseudonym?.trim()) {
      const invited = await this.prisma.user.findFirst({
        where: { pseudonym: pseudonym.trim() },
        select: { id: true }
      });
      if (!invited) {
        throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Joueur introuvable' });
      }
      invitedUserId = invited.id;
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(this.clock.nowMs() + INVITATION_TTL_MS);
    await this.prisma.teamInvitation.create({
      data: {
        id: uuidv7(),
        teamId,
        tokenHash: this.hashToken(token),
        invitedUserId,
        invitedPseudonym: pseudonym?.trim() || null,
        createdBy: captainId,
        expiresAt
      }
    });

    await this.audit.record({
      actorId: captainId,
      action: 'team.invitation_created',
      targetType: 'team',
      targetId: teamId
    });
    return {
      token,
      inviteUrl: `${env.PUBLIC_APP_URL}/teams/join?token=${encodeURIComponent(token)}`,
      teamId,
      expiresAt: expiresAt.toISOString()
    };
  }

  async join(userId: string, teamId: string, token: string): Promise<TeamView> {
    const invitation = await this.prisma.teamInvitation.findUnique({
      where: { tokenHash: this.hashToken(token) }
    });
    if (
      !invitation ||
      invitation.teamId !== teamId ||
      invitation.acceptedAt ||
      invitation.declinedAt ||
      invitation.expiresAt <= this.clock.now()
    ) {
      throw new BadRequestException({
        code: 'INVALID_INVITATION',
        message: 'Invitation invalide ou expirée'
      });
    }
    if (invitation.invitedUserId && invitation.invitedUserId !== userId) {
      throw new ForbiddenException({
        code: 'INVITATION_FOR_SOMEONE_ELSE',
        message: 'Cette invitation est nominative'
      });
    }

    const joinedTeamId = await this.prisma.runInTransaction(
      async (tx) => {
        const team = await tx.team.findFirst({
          where: { id: invitation.teamId, disbandedAt: null },
          select: { id: true }
        });
        if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' });

        // Verrouille l'équipe : deux adhésions concurrentes ne peuvent pas
        // dépasser la taille maximale.
        await tx.$queryRawUnsafe('SELECT id FROM "teams" WHERE id = $1::uuid FOR UPDATE', team.id);

        const active = await tx.teamMember.findFirst({
          where: { userId, leftAt: null },
          select: { id: true }
        });
        if (active) {
          throw new ConflictException({
            code: 'ALREADY_IN_TEAM',
            message: 'Un joueur ne peut appartenir qu’à une seule équipe active'
          });
        }

        const members = await tx.teamMember.count({ where: { teamId: team.id, leftAt: null } });
        const limit = await this.maxSize();
        if (members >= limit) {
          throw new ConflictException({
            code: 'TEAM_FULL',
            message: `L’équipe est complète (${limit} membres maximum)`,
            details: { limit }
          });
        }

        await tx.teamMember.create({
          data: { id: uuidv7(), teamId: team.id, userId, role: 'member' }
        });
        await tx.teamInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: this.clock.now() }
        });
        return team.id;
      },
      { isolationLevel: 'Serializable' }
    );

    await this.audit.record({
      actorId: userId,
      action: 'team.joined',
      targetType: 'team',
      targetId: joinedTeamId
    });
    return this.get(joinedTeamId);
  }

  async leave(userId: string, teamId: string, targetUserId?: string): Promise<void> {
    if (targetUserId && targetUserId !== userId) await this.requireCaptain(teamId, userId);

    const leavingId = targetUserId ?? userId;
    await this.prisma.runInTransaction(
      async (tx) => {
        const team = await tx.team.findFirst({
          where: { id: teamId, disbandedAt: null },
          select: { id: true, captainId: true }
        });
        if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' });

        await tx.$queryRawUnsafe('SELECT id FROM "teams" WHERE id = $1::uuid FOR UPDATE', team.id);

        const member = await tx.teamMember.findFirst({
          where: { teamId, userId: leavingId, leftAt: null },
          select: { id: true, role: true }
        });
        if (!member) {
          throw new NotFoundException({ code: 'TEAM_MEMBER_NOT_FOUND', message: 'Membre introuvable' });
        }

        await this.captaincy.transferOnDeparture(tx, teamId, leavingId);

        await tx.teamMember.update({
          where: { id: member.id },
          data: { leftAt: this.clock.now(), role: 'member' }
        });
      },
      { isolationLevel: 'Serializable' }
    );

    await this.audit.record({ actorId: userId, action: 'team.left', targetType: 'team', targetId: teamId });
  }

  async transferCaptaincy(actorId: string, teamId: string, userId: string): Promise<TeamView> {
    await this.requireCaptain(teamId, actorId);

    await this.prisma.runInTransaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM "teams" WHERE id = $1::uuid FOR UPDATE', teamId);
        const successor = await tx.teamMember.findFirst({
          where: { teamId, userId, leftAt: null },
          select: { id: true }
        });
        if (!successor) {
          throw new NotFoundException({ code: 'TEAM_MEMBER_NOT_FOUND', message: 'Membre introuvable' });
        }
        await tx.team.update({ where: { id: teamId }, data: { captainId: userId } });
        await tx.teamMember.updateMany({
          where: { teamId, leftAt: null, role: 'captain' },
          data: { role: 'member' }
        });
        await tx.teamMember.update({ where: { id: successor.id }, data: { role: 'captain' } });
      },
      { isolationLevel: 'Serializable' }
    );

    await this.audit.record({
      actorId,
      action: 'team.captain_transferred',
      targetType: 'team',
      targetId: teamId,
      metadata: { userId }
    });
    return this.get(teamId);
  }

  /** Vérifie qu'un joueur est capitaine actif de l'équipe. */
  async requireCaptain(teamId: string, userId: string): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, disbandedAt: null },
      select: { captainId: true }
    });
    if (!team) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable' });
    if (team.captainId !== userId) {
      throw new ForbiddenException({
        code: 'NOT_CAPTAIN',
        message: 'Seul le capitaine peut effectuer cette action'
      });
    }
  }

  /** Vérifie qu'un joueur est membre actif de l'équipe. */
  async requireActiveMember(teamId: string, userId: string): Promise<void> {
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private rethrowUnique(error: unknown): void {
    if (!this.prisma.isUniqueConstraintError(error)) return;
    const target = this.prisma.uniqueConstraintTarget(error).join(',');
    if (target.includes('name')) {
      throw new ConflictException({ code: 'TEAM_NAME_TAKEN', message: 'Ce nom d’équipe est déjà pris' });
    }
    if (target.includes('tag')) {
      throw new ConflictException({ code: 'TEAM_TAG_TAKEN', message: 'Ce tag d’équipe est déjà pris' });
    }
    if (target.includes('user_id')) {
      throw new ConflictException({
        code: 'ALREADY_IN_TEAM',
        message: 'Un joueur ne peut appartenir qu’à une seule équipe active'
      });
    }
  }

  private toView(team: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    logoKey: string | null;
    captainId: string | null;
    createdAt: Date;
    disbandedAt: Date | null;
    members: Array<{
      userId: string;
      role: 'captain' | 'member';
      joinedAt: Date;
      user: { pseudonym: string };
    }>;
  }): TeamView {
    return {
      id: team.id,
      name: team.name,
      tag: team.tag,
      description: team.description,
      logoKey: team.logoKey,
      captainId: team.captainId,
      createdAt: team.createdAt.toISOString(),
      disbandedAt: team.disbandedAt?.toISOString() ?? null,
      members: team.members.map((member) => ({
        userId: member.userId,
        pseudonym: member.user.pseudonym,
        role: member.role,
        joinedAt: member.joinedAt.toISOString()
      }))
    };
  }
}
