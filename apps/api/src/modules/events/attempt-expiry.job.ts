import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env';
import { BULLMQ_CONNECTION } from '../../redis/redis.constants';
import { AttemptService } from './attempt.service';
import { ResultsService } from './results.service';

export const EVENT_ATTEMPT_EXPIRY_QUEUE = 'events-attempt-expiry';

/**
 * Expiration des essais d'événement (T168, FR-062, FR-065).
 *
 * Une file BullMQ récurrente (et non un `setInterval`) garantit une seule
 * exécution par fenêtre en production. À la fin de la fenêtre, l'essai est
 * marqué consommé même si le navigateur a été fermé : aucune reprise n'est
 * possible, conformément à la clarification 2.
 */
@Injectable()
export class AttemptExpiryJob implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly attempts: AttemptService,
    private readonly results: ResultsService
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = new Queue(EVENT_ATTEMPT_EXPIRY_QUEUE, {
      connection: this.connection,
      prefix: env.REDIS_PREFIX
    });
    this.worker = new Worker(
      EVENT_ATTEMPT_EXPIRY_QUEUE,
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
      'expire',
      {},
      {
        jobId: EVENT_ATTEMPT_EXPIRY_QUEUE,
        repeat: { every: env.EVENT_ATTEMPT_SWEEP_INTERVAL_MS },
        removeOnComplete: { age: 3_600, count: 100 },
        removeOnFail: { age: 86_400, count: 100 }
      }
    );
  }

  /**
   * Exécute un balayage immédiat (aussi appelé directement par les tests) puis
   * publie les résultats des événements qui viennent de clore (FR-064).
   */
  async sweep(): Promise<number> {
    const closedIds = await this.attempts.sweep();
    for (const eventId of closedIds) {
      await this.results.publish(eventId);
    }
    return closedIds.length;
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
