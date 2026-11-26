import { api } from './api-client';

export interface ChallengeSummary {
  id: string;
  title: string;
  theme: string;
  type: 'sorting' | 'debugging' | 'decryption' | 'steganography' | 'qr_code';
  difficulty: number;
  status: 'locked' | 'available' | 'completed';
  bestScore: number | null;
  missingPrerequisites?: string[];
}

export interface ChallengeDetail extends ChallengeSummary {
  statement: string;
  languages: string[];
  basePoints: number;
  perfMax: number;
  currentVersion?: number;
  buggyCode?: string | null;
  maxModifiedLines?: number | null;
  cipher?: string | null;
  instance?: {
    assetId: string;
    seedFingerprint: string;
    objectKey: string;
    ciphertext: string;
    sha256: string;
    cached: boolean;
  };
  hints: Array<{
    id: string;
    order?: number;
    priceBits: number;
    purchased: boolean;
    /** Présent uniquement après achat ; jamais de test caché ni de solution. */
    content?: string;
  }>;
  missingPrerequisites: string[];
}

export interface ChallengeAttempt {
  id: string;
  challengeId: string;
  startedAt: string;
  expiredAt: string;
  verdictAt: string | null;
}

export interface Submission {
  id: string;
  challengeId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'timeout' | 'rejected';
  score: number | null;
  testsPassed: number | null;
  testsTotal: number | null;
  cpuTimeMedianMs: number | null;
  verdictReason: string | null;
  createdAt: string;
  attemptId?: string | null;
  modifiedLines?: number | null;
  hintsUsed?: number;
}

export interface CatalogFilters {
  theme?: string;
  difficulty?: number;
  type?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

function queryString(filters: CatalogFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function listChallenges(
  filters: CatalogFilters = {},
  signal?: AbortSignal
): Promise<{ items: ChallengeSummary[]; nextCursor: string | null }> {
  return api.get(`/challenges${queryString(filters)}`, { signal });
}

export function getChallenge(challengeId: string, signal?: AbortSignal): Promise<ChallengeDetail> {
  return api.get<ChallengeDetail>(`/challenges/${encodeURIComponent(challengeId)}`, { signal });
}

/** Démarre explicitement l'unique essai chronométré (A5). */
export function startAttempt(challengeId: string): Promise<ChallengeAttempt> {
  return api.post<ChallengeAttempt>(`/challenges/${encodeURIComponent(challengeId)}/attempts`);
}

export function submitSolution(
  challengeId: string,
  input: { language: 'python' | 'javascript'; code: string; attemptId?: string; teamId?: string },
  idempotencyKey?: string
): Promise<Submission> {
  return api.post<Submission>(`/challenges/${encodeURIComponent(challengeId)}/submissions`, input, {
    idempotencyKey
  });
}

export function getSubmission(submissionId: string): Promise<Submission> {
  return api.get<Submission>(`/submissions/${encodeURIComponent(submissionId)}`);
}
