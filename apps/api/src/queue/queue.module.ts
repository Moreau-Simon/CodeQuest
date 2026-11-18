import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import { env } from '../config/env';
import { EMAIL_QUEUE } from '../mail/mail.constants';
import {
  BULLMQ_CONNECTION,
  SUBMISSIONS_DLQ,
  SUBMISSIONS_QUEUE,
  SUBMISSIONS_RESULTS_QUEUE
} from './queue.constants';
import { submissionJobOptions, type SubmissionJobKind } from './queue.priorities';

@Injectable()
export class QueueService implements OnModuleDestroy {
  constructor(
    @Inject(SUBMISSIONS_QUEUE) readonly submissions: Queue,
    @Inject(SUBMISSIONS_RESULTS_QUEUE) readonly results: Queue,
    @Inject(SUBMISSIONS_DLQ) readonly deadLetter: Queue,
    @Inject(EMAIL_QUEUE) readonly emails: Queue
  ) {}

  enqueueSubmission(
    submissionId: string,
    payload: Record<string, unknown>,
    kind: SubmissionJobKind = 'standard'
  ): Promise<unknown> {
    return this.submissions.add('score', payload, submissionJobOptions(submissionId, kind));
  }

  async depths(): Promise<Record<string, number>> {
    const [submissions, results, deadLetter, emails] = await Promise.all([
      this.submissions.getWaitingCount(),
      this.results.getWaitingCount(),
      this.deadLetter.getWaitingCount(),
      this.emails.getWaitingCount()
    ]);
    return {
      [env.QUEUE_SUBMISSIONS]: submissions,
      'submissions-results': results,
      'submissions-dlq': deadLetter,
      [env.QUEUE_EMAILS]: emails
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.submissions.close(),
      this.results.close(),
      this.deadLetter.close(),
      this.emails.close()
    ]);
  }
}

function queueProvider(name: string | symbol, queueName: string) {
  return {
    provide: name,
    useFactory: (connection: ConnectionOptions) =>
      new Queue(queueName, {
        connection,
        prefix: env.REDIS_PREFIX,
        defaultJobOptions: {
          removeOnComplete: { age: 3_600, count: 10_000 },
          removeOnFail: { age: 86_400, count: 5_000 }
        }
      }),
    inject: [BULLMQ_CONNECTION]
  };
}

@Global()
@Module({
  providers: [
    queueProvider(SUBMISSIONS_QUEUE, env.QUEUE_SUBMISSIONS),
    queueProvider(SUBMISSIONS_RESULTS_QUEUE, 'submissions-results'),
    queueProvider(SUBMISSIONS_DLQ, 'submissions-dlq'),
    queueProvider(EMAIL_QUEUE, env.QUEUE_EMAILS),
    QueueService
  ],
  exports: [
    QueueService,
    SUBMISSIONS_QUEUE,
    SUBMISSIONS_RESULTS_QUEUE,
    SUBMISSIONS_DLQ,
    EMAIL_QUEUE
  ]
})
export class QueueModule {}
