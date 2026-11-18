import type { Job, Queue } from 'bullmq';

/** Résultat brut renvoyé à l'API (contrat `runner-job.md` §3). */
export interface RunnerResult {
  kind?: 'verdict' | 'started';
  submissionId: string;
  userId?: string;
  status?: 'passed' | 'failed' | 'error' | 'timeout' | 'rejected';
  cpuTimesMs?: number[];
  cpuTimeMedianMs?: number;
  cpuTimeStdDevMs?: number;
  testsPassed?: number;
  testsTotal?: number;
  verdictReason?: string | null;
  failure?: { kind: string; message: string } | null;
  sandbox?: Record<string, unknown>;
  measuredAt?: string;
  runnerId?: string;
}

export interface ResultPublisher {
  publish(result: RunnerResult): Promise<unknown>;
}

/** Publication des verdicts vers la file `submissions-results`. */
export class BullResultPublisher implements ResultPublisher {
  constructor(private readonly queue: Queue) {}

  publish(result: RunnerResult): Promise<unknown> {
    return this.queue.add('result', result, {
      jobId: `${result.submissionId}-${result.kind ?? 'verdict'}`,
      attempts: 1,
      removeOnComplete: { age: 3_600, count: 10_000 },
      removeOnFail: { age: 86_400, count: 5_000 }
    });
  }
}

export interface SubmissionJobData {
  jobId: string;
  submissionId: string;
  challengeId: string;
  challengeVersionId: string;
  language: 'python' | 'javascript';
  code: string;
  limits: {
    wallTimeMs: number;
    cpuTimeMs: number;
    memoryMb: number;
    pidsMax: number;
    outputBytes: number;
  };
  testsRef: {
    ciphertextKey: string;
    keyId: string;
    sha256: string;
    ciphertextBase64?: string;
  };
  runs: number;
  mode: 'score' | 'validate' | 'sample';
  context: {
    subjectType: 'player' | 'team';
    subjectId: string;
    eventId: string | null;
    isEventAttempt: boolean;
  };
  enqueuedAt: string;
}

export type SubmissionJob = Job<SubmissionJobData>;
