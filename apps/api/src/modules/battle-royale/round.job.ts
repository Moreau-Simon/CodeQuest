import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { RoundService } from './round.service';

export const BATTLE_ROUND_QUEUE = 'battle-rounds';

/**
 * T220 (FR-097) : les transitions de manche sont déclenchées par une file
 * récurrente, jamais par le navigateur. Le balayage est désactivé dans les
 * tests, où l'horloge est figée et où les services sont appelés directement.
 */
@Injectable()
export class RoundJob implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly rounds: RoundService
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    this.queue = new Queue(BATTLE_ROUND_QUEUE, {
      connection: this.connection,
      prefix: env.REDIS_PREFIX
    });
    this.worker = new Worker(
      BATTLE_ROUND_QUEUE,
      async () => {
        await this.sweep();
      },
      {
        connection: this.connection,
        prefix: env.REDIS_PREFIX,
        concurrency: 1
      }
    );
    await this.queue.add(
      'sweep',
      {},
      {
        jobId: BATTLE_ROUND_QUEUE,
        repeat: { every: env.BATTLE_ROUND_SWEEP_INTERVAL_MS },
        removeOnComplete: { age: 3_600, count: 100 },
        removeOnFail: { age: 86_400, count: 100 }
      }
    );
  }

  async sweep(): Promise<number> {
    await this.rounds.openDue();
    await this.rounds.warnDue();
    const closed = await this.rounds.closeDue();
    return closed.length;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
