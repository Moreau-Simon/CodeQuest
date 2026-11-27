import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { PushService } from './push.service';

export const NOTIFICATIONS_SWEEP_QUEUE = 'notifications-sweep';

/**
 * Balayage périodique FR-104 : événements à venir et fins de KO.
 * La déduplication est persistée en base, donc un redémarrage ne renvoie pas
 * les notifications déjà émises.
 */
@Injectable()
export class NotificationsJob implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly push: PushService
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(NOTIFICATIONS_SWEEP_QUEUE, {
      connection: this.connection,
      prefix: env.REDIS_PREFIX
    });
    this.worker = new Worker(
      NOTIFICATIONS_SWEEP_QUEUE,
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
        jobId: NOTIFICATIONS_SWEEP_QUEUE,
        repeat: { every: env.NOTIFICATION_SWEEP_INTERVAL_MS },
        removeOnComplete: { age: 3_600, count: 100 },
        removeOnFail: { age: 86_400, count: 100 }
      }
    );
  }

  async sweep(): Promise<number> {
    const upcoming = await this.push.notifyUpcomingEvents();
    const koEnded = await this.push.notifyKoEnded();
    return upcoming + koEnded;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
