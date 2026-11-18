import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { Clock } from '../../common/clock';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_AUDIT_EVENTS } from '../auth/audit.events';
import { AuditService } from '../audit/audit.service';
import {
  DELETED_ACCOUNT_RETENTION_DAYS,
  tombstoneEmail,
  tombstonePseudonym
} from './account-deletion.service';

export const ACCOUNT_PURGE_JOB = 'account-purge';
export const ACCOUNT_PURGE_SCHEDULE = '0 3 * * *';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Purge définitive à J+30 (T059, SC-017).
 *
 * La ligne `users` est conservée en tombeau pseudonyme plutôt que supprimée :
 * le journal d'audit append-only référence `actor_id` avec `ON DELETE SET
 * NULL`, et ce `SET NULL` déclencherait le trigger interdisant toute mise à
 * jour d'`audit_logs`. La purge libère donc l'e-mail et le pseudo d'origine,
 * efface les secrets et détache les sessions — les données personnelles ne
 * sont plus récupérables.
 */
@Injectable()
export class AccountPurgeJob implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      ACCOUNT_PURGE_JOB,
      async (job) => {
        if (job.name === ACCOUNT_PURGE_JOB) await this.run();
      },
      { connection: this.connection }
    );

    const queue = new Queue(ACCOUNT_PURGE_JOB, {
      connection: this.connection,
      defaultJobOptions: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } }
    });
    try {
      await queue.upsertJobScheduler(
        ACCOUNT_PURGE_JOB,
        { pattern: ACCOUNT_PURGE_SCHEDULE, tz: 'UTC' },
        { name: ACCOUNT_PURGE_JOB }
      );
    } finally {
      await queue.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  /** Purge les comptes dont la suppression logique date de plus de 30 jours. */
  async run(): Promise<number> {
    const now = this.clock.now();
    const threshold = new Date(now.getTime() - DELETED_ACCOUNT_RETENTION_DAYS * DAY_MS);

    const expired = await this.prisma.user.findMany({
      where: { status: 'deleted', deletedAt: { lte: threshold } },
      select: { id: true, email: true, pseudonym: true }
    });

    let purged = 0;
    for (const user of expired) {
      await this.prisma.$transaction([
        this.prisma.session.deleteMany({ where: { userId: user.id } }),
        this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        this.prisma.pushSubscription.deleteMany({ where: { userId: user.id } }),
        this.prisma.user.update({
          where: { id: user.id },
          data: {
            email: tombstoneEmail(user.id),
            pseudonym: tombstonePseudonym(user.id),
            passwordHash: '!purged',
            emailVerifiedAt: null,
            avatarKey: null,
            preferences: {},
            deletedAt: now
          }
        })
      ]);

      await this.audit.record({
        actorId: null,
        action: AUTH_AUDIT_EVENTS.accountPurged,
        targetType: 'user',
        targetId: user.id,
        metadata: { retentionDays: DELETED_ACCOUNT_RETENTION_DAYS }
      });

      purged += 1;
    }

    return purged;
  }
}
