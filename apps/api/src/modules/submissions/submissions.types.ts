/** Charge utile du job de soumission (contrat `runner-job.md` §2). */
export interface SubmissionJob {
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
    /** Chiffré AES-GCM : jamais les tests en clair (FR-110). */
    ciphertextBase64: string;
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

export type SubmissionVerdictStatus = 'passed' | 'failed' | 'error' | 'timeout' | 'rejected';

/** Résultat brut du runner (contrat §3) ; aucun score n'y figure. */
export interface SubmissionResult {
  kind?: 'verdict' | 'started';
  submissionId: string;
  userId?: string;
  status?: SubmissionVerdictStatus;
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

export const SUBMISSION_LIMITS = {
  wallTimeMs: 10_000,
  cpuTimeMs: 5_000,
  memoryMb: 512,
  pidsMax: 64,
  outputBytes: 1_048_576
} as const;

export const MAX_CODE_BYTES = 128 * 1024;
