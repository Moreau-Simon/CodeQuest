import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_XP_CURVE,
  levelForXp,
  normalizeXpCurve,
  type XpCurveConfig
} from './xp-curve';

export const XP_CURVE_SETTING_KEY = 'xp.curve';
export const XP_AWARD_ACTION = 'xp.awarded';

export interface XpAward {
  awarded: boolean;
  granted: number;
  xp: number;
  level: number;
  previousLevel: number;
}

/**
 * Attribution d'XP et recalcul du niveau (T135, FR-054).
 *
 * - source unique : `users.xp` / `users.level`, mis à jour dans une transaction ;
 * - courbe lisible dans `platform_settings` (`xp.curve`), sans migration ;
 * - attribution idempotente par (utilisateur, défi), traces dans l'audit ;
 * - déblocage des chapitres de lore conditionnés par le niveau.
 */
@Injectable()
export class XpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /** Courbe active, avec repli sur les valeurs par défaut si le réglage est corrompu. */
  async curve(): Promise<XpCurveConfig> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: XP_CURVE_SETTING_KEY }
    });
    if (!setting) return { ...DEFAULT_XP_CURVE };
    try {
      return normalizeXpCurve(setting.value);
    } catch {
      return { ...DEFAULT_XP_CURVE };
    }
  }

  /** XP accordé pour un défi réussi : au moins 10, sinon proportionnel au score. */
  xpForChallenge(score: number): number {
    return Number.isFinite(score) ? Math.max(10, Math.round(score)) : 10;
  }

  async awardForChallenge(input: {
    userId: string;
    challengeId: string;
    score: number;
  }): Promise<XpAward> {
    const curve = await this.curve();
    const granted = this.xpForChallenge(input.score);

    return this.prisma.runInTransaction(async (tx) => {
      const alreadyAwarded = await tx.auditLog.findFirst({
        where: {
          actorId: input.userId,
          action: XP_AWARD_ACTION,
          targetType: 'challenge',
          targetId: input.challengeId
        },
        select: { id: true }
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { xp: true, level: true }
      });

      if (alreadyAwarded) {
        return {
          awarded: false,
          granted: 0,
          xp: user.xp,
          level: user.level,
          previousLevel: user.level
        };
      }

      const xp = user.xp + granted;
      const level = levelForXp(xp, curve);
      await tx.user.update({ where: { id: input.userId }, data: { xp, level } });
      await tx.auditLog.create({
        data: {
          id: uuidv7(),
          actorId: input.userId,
          action: XP_AWARD_ACTION,
          targetType: 'challenge',
          targetId: input.challengeId,
          metadata: {
            granted,
            score: input.score,
            xp,
            level,
            previousXp: user.xp,
            previousLevel: user.level
          }
        }
      });

      // FR-054 : le niveau débloque les zones de lore correspondantes.
      const chapters = await tx.loreChapter.findMany({
        where: { requiredLevel: { lte: level } },
        select: { id: true }
      });
      if (chapters.length > 0) {
        await tx.loreProgress.createMany({
          data: chapters.map((chapter) => ({ userId: input.userId, chapterId: chapter.id })),
          skipDuplicates: true
        });
      }

      return { awarded: true, granted, xp, level, previousLevel: user.level };
    });
  }

  /** Recalcule le niveau courant (utile après changement de la courbe). */
  async recomputeLevel(userId: string): Promise<{ xp: number; level: number }> {
    const curve = await this.curve();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { xp: true }
    });
    const level = levelForXp(user.xp, curve);
    await this.prisma.user.update({ where: { id: userId }, data: { level } });
    await this.audit.record({
      actorId: userId,
      action: 'xp.level.recomputed',
      targetType: 'user',
      targetId: userId,
      metadata: { xp: user.xp, level }
    });
    return { xp: user.xp, level };
  }
}
