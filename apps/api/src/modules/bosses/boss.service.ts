import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AuditService } from '../audit/audit.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { BossGuard } from './boss.guard';
import { HealthService, type HealthSubjectType } from './health.service';
import { TeamHealthService } from './team-health.service';

export interface BossPhaseView {
  id: string;
  order: number;
  completed: boolean;
}

export interface BossView {
  id: string;
  name: string;
  maxHp: number;
  chapter: string;
  phases: BossPhaseView[];
  hpRemaining: number | null;
  defeated: boolean;
}

export interface BossSubmissionView {
  submissionId: string;
  bossPhaseId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'timeout' | 'rejected';
}

export interface SubmitBossPhaseInput {
  language: string;
  code: string;
  /** Raid d'équipe : les dégâts alimentent le pool partagé (FR-071). */
  teamId?: string;
}

interface DamageRule {
  per_100_score?: number;
  failureCost?: number;
}

/** Normalise `rewards` au format du contrat temps réel §3.3. */
function rewardsPayload(raw: unknown): Array<{ kind: string; amount: number }> {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const entry = item as Record<string, unknown>;
      return [{ kind: String(entry.kind ?? 'bits'), amount: Number(entry.amount ?? 0) }];
    });
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([kind, amount]) => ({
      kind,
      amount: Number(amount)
    }));
  }
  return [];
}

/**
 * Boss en phases ordonnées (T179, FR-066/FR-070).
 *
 * Une phase n'est jouable que lorsqu'elle est atteinte ; le score obtenu est
 * converti en dégâts par `per_100_score`, et un boss vaincu ne l'est qu'une
 * seule fois (unicité de `boss_engagements` + `defeated_at`).
 */
@Injectable()
export class BossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly submissions: SubmissionsService,
    private readonly guard: BossGuard,
    private readonly health: HealthService,
    private readonly teamHealth: TeamHealthService,
    private readonly gateway: RealtimeGateway,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  async list(user: AuthenticatedUser): Promise<BossView[]> {
    const bosses = await this.prisma.boss.findMany({
      orderBy: { name: 'asc' },
      include: {
        chapter: { select: { slug: true } },
        phases: {
          orderBy: { order: 'asc' },
          select: { id: true, order: true }
        },
        engagements: {
          where: { subjectType: 'player', subjectId: user.id },
          take: 1
        }
      }
    });

    return bosses.map((boss) => {
      const engagement = boss.engagements[0];
      return {
        id: boss.id,
        name: boss.name,
        maxHp: boss.maxHp,
        chapter: boss.chapter.slug,
        phases: boss.phases.map((phase) => ({
          id: phase.id,
          order: phase.order,
          completed: engagement ? phase.order < engagement.phaseReached : false
        })),
        hpRemaining: engagement?.bossHpRemaining ?? null,
        defeated: Boolean(engagement?.defeatedAt)
      };
    });
  }

  async submitPhase(
    bossId: string,
    phaseId: string,
    user: AuthenticatedUser,
    input: SubmitBossPhaseInput,
    idempotencyKey?: string
  ): Promise<BossSubmissionView> {
    await this.guard.assertPlayable(user);

    const phase = await this.prisma.bossPhase.findUnique({
      where: { id: phaseId },
      include: { boss: { select: { id: true, maxHp: true } } }
    });
    if (!phase || phase.bossId !== bossId) {
      throw new NotFoundException({
        code: 'BOSS_PHASE_NOT_FOUND',
        message: 'Phase de boss introuvable'
      });
    }

    const subjectType: HealthSubjectType = input.teamId ? 'team' : 'player';
    const subjectId = input.teamId ?? user.id;
    const key = { bossId, subjectType, subjectId };
    const engagement = await this.prisma.bossEngagement.findUnique({
      where: { bossId_subjectType_subjectId: key }
    });
    if (engagement?.defeatedAt) {
      throw new ConflictException({
        code: 'BOSS_ALREADY_DEFEATED',
        message: 'Ce boss est déjà vaincu'
      });
    }

    const expectedOrder = engagement?.phaseReached ?? 1;
    if (phase.order !== expectedOrder) {
      throw new ForbiddenException({
        code: 'PHASE_NOT_REACHED',
        message: `La phase ${expectedOrder} doit être terminée avant celle-ci`,
        details: { phaseOrder: phase.order, expectedOrder }
      });
    }

    if (input.teamId) {
      await this.teamHealth.assertCanContribute(input.teamId, user.id);
    }

    // La soumission est créée avant l'engagement : si le dépôt échoue (code
    // vide, défi non publié), aucune progression n'est enregistrée.
    const submission = await this.submissions.create(
      phase.challengeId,
      user,
      { language: input.language, code: input.code, bossPhaseId: phaseId, teamId: input.teamId },
      idempotencyKey
    );

    await this.prisma.bossEngagement.upsert({
      where: { bossId_subjectType_subjectId: key },
      create: {
        id: uuidv7(),
        ...key,
        bossHpRemaining: phase.boss.maxHp,
        phaseReached: expectedOrder
      },
      update: {}
    });

    return { submissionId: submission.id, bossPhaseId: phaseId, status: submission.status };
  }

  /**
   * Applique un verdict de phase. Appelé par le consommateur de verdicts
   * uniquement pour les soumissions reliées à `boss_phase_id`.
   */
  async applyPhaseVerdict(
    submissionId: string,
    status: 'passed' | 'failed',
    score: number
  ): Promise<void> {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!submission?.bossPhaseId) return;

    const phase = await this.prisma.bossPhase.findUnique({
      where: { id: submission.bossPhaseId },
      include: { boss: { select: { id: true, rewards: true } } }
    });
    if (!phase) return;

    const subjectType: HealthSubjectType = submission.teamId ? 'team' : 'player';
    const subjectId = submission.teamId ?? submission.userId;
    const rule = (phase.damageRule ?? {}) as unknown as DamageRule;

    if (status === 'failed') {
      // FR-067 : le coût d'échec ne touche que le boss (ou un event hardcore),
      // jamais un défi standard.
      await this.health.damage(subjectType, subjectId, rule.failureCost ?? 15, 'boss_failure');
      return;
    }
    if (status !== 'passed') return;

    const key = { bossId: phase.bossId, subjectType, subjectId };
    const engagement = await this.prisma.bossEngagement.findUnique({
      where: { bossId_subjectType_subjectId: key }
    });
    if (!engagement || engagement.defeatedAt) return;

    const phaseCount = await this.prisma.bossPhase.count({ where: { bossId: phase.bossId } });
    const damage = Math.max(0, Math.round((score * (rule.per_100_score ?? 5)) / 100));
    const rawRemaining = Math.max(
      0,
      (engagement.bossHpRemaining ?? 0) - damage
    );
    const defeated = rawRemaining === 0 || phase.order >= phaseCount;
    const bossHpRemaining = defeated ? 0 : rawRemaining;

    await this.prisma.bossEngagement.update({
      where: { id: engagement.id },
      data: {
        bossHpRemaining,
        phaseReached: defeated ? phaseCount + 1 : phase.order + 1,
        ...(defeated ? { defeatedAt: this.clock.now() } : {})
      }
    });

    await this.emit(subjectType, subjectId, 'boss.phase.cleared', {
      bossId: phase.bossId,
      phaseOrder: phase.order,
      bossHpRemaining,
      damageApplied: damage
    });
    if (defeated) {
      await this.emit(subjectType, subjectId, 'boss.defeated', {
        bossId: phase.bossId,
        rewards: rewardsPayload(phase.boss.rewards)
      });
      await this.audit.record({
        actorId: subjectType === 'player' ? subjectId : null,
        action: 'boss.defeated',
        targetType: 'boss',
        targetId: phase.bossId,
        metadata: { subjectType, subjectId, phaseOrder: phase.order }
      });
    }
  }

  private async emit(
    subjectType: HealthSubjectType,
    subjectId: string,
    type: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (subjectType === 'player') {
      this.gateway.emitToUser(subjectId, type, data);
      return;
    }
    this.gateway.emitToRoom(`team:${subjectId}`, type, data);
    const members = await this.prisma.teamMember.findMany({
      where: { teamId: subjectId, leftAt: null },
      select: { userId: true }
    });
    for (const member of members) {
      this.gateway.emitToUser(member.userId, type, data);
    }
  }
}
