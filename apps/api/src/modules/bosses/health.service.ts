import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  computeRegeneration,
  damageHp,
  koUntilFrom,
  lastRegenAtDuringKo,
  nextRegenerationAt,
  restoreHp
} from './health.math';

export type HealthSubjectType = 'player' | 'team';

export interface HealthSubject {
  subjectType: HealthSubjectType;
  subjectId: string;
}

export interface HealthView {
  hp: number;
  maxHp: number;
  koUntil: string | null;
  nextRegenAt: string | null;
  /** Horloge serveur : le compte à rebours ne dépend pas du navigateur. */
  serverNow: string;
}

interface HealthRow {
  id: string;
  hp: number;
  maxHp: number;
  koUntil: Date | null;
  lastRegenAt: Date;
}

/**
 * Points de vie des joueurs et des pools d'équipe (T178, FR-067/FR-069).
 *
 * La régénération est calculée à la lecture puis matérialisée en base. Les
 * mutations verrouillent la ligne pour rendre doubles clics et doubles potions
 * idempotents, et les événements temps réel ne sont émis qu'après commit (T095).
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly gateway: RealtimeGateway
  ) {}

  /** Lit l'état courant, en matérialisant les pas de régénération échus. */
  async read(subjectType: HealthSubjectType, subjectId: string): Promise<HealthView> {
    const now = this.clock.now();
    return this.prisma.runInTransaction(async (tx) => {
      const initial = await this.ensureRow(tx, { subjectType, subjectId }, now);
      const row = await this.lockAndReload(tx, initial.id);
      const regen = computeRegeneration(row, now);
      if (regen.ticks > 0 || regen.koUntil !== row.koUntil) {
        await tx.playerHealth.update({
          where: { id: row.id },
          data: {
            hp: regen.hp,
            lastRegenAt: regen.lastRegenAt,
            koUntil: regen.koUntil
          }
        });
      }
      return this.toView({ ...row, ...regen }, now);
    });
  }

  /** Déduit des dégâts (échec de boss) et ouvre un KO si les PV tombent à zéro. */
  async damage(
    subjectType: HealthSubjectType,
    subjectId: string,
    amount: number,
    reason: string
  ): Promise<HealthView> {
    const now = this.clock.now();
    const result = await this.prisma.runInTransaction(async (tx) => {
      const initial = await this.ensureRow(tx, { subjectType, subjectId }, now);
      const row = await this.lockAndReload(tx, initial.id);
      const regen = computeRegeneration(row, now);
      const hp = damageHp(regen.hp, amount, row.maxHp);
      const koUntil = hp === 0 ? koUntilFrom(now) : null;
      const lastRegenAt = koUntil ? lastRegenAtDuringKo(koUntil) : regen.lastRegenAt;

      await tx.playerHealth.update({
        where: { id: row.id },
        data: { hp, koUntil, lastRegenAt }
      });

      return { before: regen.hp, hp, maxHp: row.maxHp, koUntil, lastRegenAt };
    });

    const subject = { subjectType, subjectId };
    await this.emit(subject, 'health.changed', {
      hp: result.hp,
      maxHp: result.maxHp,
      delta: result.hp - result.before,
      reason,
      koUntil: result.koUntil?.toISOString() ?? null
    });
    if (result.hp === 0) {
      await this.emit(subject, 'health.ko', {
        hp: 0,
        koUntil: result.koUntil?.toISOString() ?? null,
        reason
      });
    }

    return this.toView(
      {
        id: '',
        hp: result.hp,
        maxHp: result.maxHp,
        koUntil: result.koUntil,
        lastRegenAt: result.lastRegenAt
      },
      now
    );
  }

  /** Restaure instantanément des PV (potion) et lève un KO en cours. */
  async restore(
    subjectType: HealthSubjectType,
    subjectId: string,
    amount: number,
    source: string
  ): Promise<HealthView> {
    const now = this.clock.now();
    const result = await this.prisma.runInTransaction(async (tx) => {
      const initial = await this.ensureRow(tx, { subjectType, subjectId }, now);
      const row = await this.lockAndReload(tx, initial.id);
      const regen = computeRegeneration(row, now);
      const hp = restoreHp(regen.hp, amount, row.maxHp);

      await tx.playerHealth.update({
        where: { id: row.id },
        data: { hp, koUntil: null, lastRegenAt: now }
      });
      return { hp, maxHp: row.maxHp };
    });

    await this.emit({ subjectType, subjectId }, 'health.restored', {
      hp: result.hp,
      source,
      koUntil: null
    });

    return this.toView(
      {
        id: '',
        hp: result.hp,
        maxHp: result.maxHp,
        koUntil: null,
        lastRegenAt: now
      },
      now
    );
  }

  private async ensureRow(
    tx: Prisma.TransactionClient,
    subject: HealthSubject,
    now: Date
  ): Promise<HealthRow> {
    return tx.playerHealth.upsert({
      where: {
        subjectType_subjectId: {
          subjectType: subject.subjectType,
          subjectId: subject.subjectId
        }
      },
      create: {
        id: uuidv7(),
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        hp: 100,
        maxHp: 100,
        lastRegenAt: now
      },
      update: {}
    });
  }

  private async lockAndReload(tx: Prisma.TransactionClient, id: string): Promise<HealthRow> {
    await tx.$queryRawUnsafe('SELECT id FROM "player_health" WHERE id = $1::uuid FOR UPDATE', id);
    return tx.playerHealth.findUniqueOrThrow({ where: { id } });
  }

  private async emit(subject: HealthSubject, type: string, data: Record<string, unknown>): Promise<void> {
    if (subject.subjectType === 'player') {
      this.gateway.emitToUser(subject.subjectId, type, data);
      return;
    }

    // FR-071 : le pool d'équipe est diffusé à la room et à chaque membre actif.
    this.gateway.emitToRoom(`team:${subject.subjectId}`, type, data);
    const members = await this.prisma.teamMember.findMany({
      where: { teamId: subject.subjectId, leftAt: null },
      select: { userId: true }
    });
    for (const member of members) {
      this.gateway.emitToUser(member.userId, type, data);
    }
  }

  private toView(row: HealthRow, now: Date): HealthView {
    return {
      hp: row.hp,
      maxHp: row.maxHp,
      koUntil: row.koUntil?.toISOString() ?? null,
      nextRegenAt: nextRegenerationAt(row, now)?.toISOString() ?? null,
      serverNow: now.toISOString()
    };
  }
}
