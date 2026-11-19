import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { LeaderboardService } from './leaderboard.service';

export const LEADERBOARD_REBUILD_QUEUE = 'leaderboards-rebuild';

/**
 * Reconstruction périodique des classements (T098, FR-049, SC-009).
 *
 * Le job réécrit `leaderboard_entries` et les ZSET depuis `best_scores`, puis
 * vérifie l'identité des deux vues. Une file BullMQ (et non un `setInterval`)
 * garantit qu'une seule instance exécute la reconstruction en production.
 */
@Injectable()
export class LeaderboardRebuildJob implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly leaderboards: LeaderboardService
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(LEADERBOARD_REBUILD_QUEUE, {
      connection: this.connection,
      prefix: env.REDIS_PREFIX
    });
    this.worker = new Worker(
      LEADERBOARD_REBUILD_QUEUE,
      async () => this.leaderboards.rebuildAll(),
      {
        connection: this.connection,
        prefix: env.REDIS_PREFIX,
        concurrency: 1
      }
    );

    await this.queue.add(
      'rebuild',
      {},
      {
        jobId: LEADERBOARD_REBUILD_QUEUE,
        repeat: { every: env.LEADERBOARD_REBUILD_INTERVAL_MS },
        removeOnComplete: { age: 3_600, count: 100 },
        removeOnFail: { age: 86_400, count: 100 }
      }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
