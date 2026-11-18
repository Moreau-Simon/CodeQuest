import type { JobsOptions } from 'bullmq';

/** Priorités BullMQ du contrat `contracts/runner-job.md` §6. */
export const SUBMISSION_PRIORITIES = {
  event: 1,
  boss: 2,
  standard: 3,
  validation: 4
} as const;

export type SubmissionJobKind = keyof typeof SUBMISSION_PRIORITIES;

/**
 * Options d'un job de soumission : `jobId = submissionId` garantit
 * l'idempotence, `attempts = 1` empêche de rejouer un échec de code (seuls les
 * échecs d'infrastructure sont requeue par le runner).
 */
export function submissionJobOptions(submissionId: string, kind: SubmissionJobKind): JobsOptions {
  return {
    jobId: submissionId,
    priority: SUBMISSION_PRIORITIES[kind],
    attempts: 1,
    removeOnComplete: { age: 3_600, count: 10_000 },
    removeOnFail: { age: 86_400, count: 5_000 }
  };
}
