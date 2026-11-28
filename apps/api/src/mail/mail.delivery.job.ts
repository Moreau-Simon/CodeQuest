import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import { env } from '../config/env';
import { BULLMQ_CONNECTION } from '../redis/redis.constants';
import { MailService, type MailMessage } from './mail.service';

export type MailProcessor = (job: Pick<Job<MailMessage>, 'data'>) => Promise<void>;

/** Traite un job `emails` en le livrant via le transport SMTP. */
export function createMailProcessor(mail: Pick<MailService, 'deliver'>): MailProcessor {
  return async ({ data }) => {
    await mail.deliver(data);
  };
}

/**
 * Consommateur de la file d'e-mails (T036). Sans lui, `MailService.sendOrQueue`
 * dépose les confirmations dans Redis mais aucune ne part : l'inscription
 * réussit et l'utilisateur ne reçoit jamais son lien de vérification.
 */
@Injectable()
export class MailDeliveryJob implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<MailMessage>;

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: ConnectionOptions,
    @Inject(MailService) private readonly mail: MailService
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<MailMessage>(env.QUEUE_EMAILS, createMailProcessor(this.mail), {
      connection: this.connection,
      prefix: env.REDIS_PREFIX,
      concurrency: 4
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
