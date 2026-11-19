import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AUTH_AUDIT_EVENTS } from '../auth/audit.events';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../audit/audit.service';

/** Délai de rétention des données personnelles après suppression (FR-012, SC-017). */
export const DELETED_ACCOUNT_RETENTION_DAYS = 30;

/**
 * Tables conservant des scores ou messages après suppression de compte
 * (FR-013) : les lignes restent (intégrité des classements) mais la référence
 * à l'utilisateur est coupée et le libellé devient « Joueur supprimé ».
 *
 * Liste figée volontairement : les tables de phases ultérieures sont
 * détectées dynamiquement (`to_regclass`), jamais concaténées depuis une
 * entrée utilisateur.
 */
const ANONYMIZED_TABLES = [
  // `submissions` n'est pas listée : `user_id` y est NOT NULL. Les scores
  // restent classés sous le compte transformé en tombeau à la purge J+30
  // (pseudo `supprime-…`), ce qui assure l'anonymat sans casser l'intégrité.
  'best_scores',
  'team_official_submissions',
  'leaderboard_entries',
  'round_results',
  'boss_engagements',
  'player_health'
] as const;

/** Pseudonyme de remplacement à la purge (contrainte `^[a-zA-Z0-9_-]{3,20}$`). */
export function tombstonePseudonym(userId: string): string {
  return `supprime-${userId.replace(/-/g, '').slice(-8)}`;
}

/** Adresse de remplacement à la purge : domaines `.invalid` jamais routables. */
export function tombstoneEmail(userId: string): string {
  return `purged+${userId}@invalid.local`;
}

/**
 * Suppression logique du compte (T058, FR-012, FR-013, FR-115).
 *
 * - réauthentification par mot de passe (≤ 15 min : le jeton d'accès vit 15 min) ;
 * - `deleted_at` immédiat, sessions révoquées ;
 * - anonymisation immédiate des contenus conservés (« Joueur supprimé ») ;
 * - capitainerie transférée au plus ancien membre actif (FR-014) ;
 * - la purge définitive (pseudo, e-mail, secrets) est exécutée à J+30 par
 *   `AccountPurgeJob`.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  async delete(userId: string, password: string): Promise<void> {
    await this.auth.confirmPassword(userId, password);

    const now = this.clock.now();
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'deleted', deletedAt: now }
    });

    await this.sessions.revokeAll(userId, 'account_deleted');
    await this.anonymizeRetainedContent(userId, now);
    await this.transferCaptaincy(userId, now);

    await this.audit.record({
      actorId: userId,
      action: AUTH_AUDIT_EVENTS.accountDeleted,
      targetType: 'user',
      targetId: userId,
      metadata: { retentionDays: DELETED_ACCOUNT_RETENTION_DAYS }
    });
  }

  private async anonymizeRetainedContent(userId: string, now: Date): Promise<void> {
    for (const table of ANONYMIZED_TABLES) {
      if (!(await this.hasColumn(table, 'user_id'))) continue;
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "user_id" = NULL WHERE "user_id" = $1::uuid`,
        userId
      );
    }

    if (await this.hasColumn('chat_messages', 'user_id')) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "chat_messages" SET "user_id" = NULL, "author_label" = 'Joueur supprimé'
         WHERE "user_id" = $1::uuid`,
        userId
      );
    }

    void now;
  }

  private async transferCaptaincy(userId: string, now: Date): Promise<void> {
    if (!(await this.hasTable('teams')) || !(await this.hasTable('team_members'))) return;

    // Le plus ancien membre restant devient capitaine.
    await this.prisma.$executeRawUnsafe(
      `UPDATE "teams" AS t
          SET "captain_id" = (
            SELECT tm."user_id"
              FROM "team_members" tm
             WHERE tm."team_id" = t."id"
               AND tm."user_id" <> $1::uuid
               AND tm."left_at" IS NULL
             ORDER BY tm."joined_at" ASC
             LIMIT 1
          )
        WHERE t."captain_id" = $1::uuid`,
      userId
    );

    // Plus aucun remplaçant : l'équipe est dissoute.
    await this.prisma.$executeRawUnsafe(
      `UPDATE "teams" SET "disbanded_at" = $2::timestamptz WHERE "captain_id" = $1::uuid`,
      userId,
      now
    );

    await this.prisma.$executeRawUnsafe(
      `UPDATE "team_members" SET "left_at" = $2::timestamptz WHERE "user_id" = $1::uuid AND "left_at" IS NULL`,
      userId,
      now
    );
  }

  private async hasTable(table: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      `public.${table}`
    );
    return rows[0]?.present === true;
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
       ) AS present`,
      table,
      column
    );
    return rows[0]?.present === true;
  }
}
