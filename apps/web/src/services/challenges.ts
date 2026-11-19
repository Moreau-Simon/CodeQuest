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
  hints: Array<{ id: string; priceBits: number; purchased: boolean }>;
  missingPrerequisites: string[];
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

export function submitSolution(
  challengeId: string,
  input: { language: 'python' | 'javascript'; code: string },
  idempotencyKey?: string
): Promise<Submission> {
  return api.post<Submission>(`/challenges/${encodeURIComponent(challengeId)}/submissions`, input, {
    idempotencyKey
  });
}

export function getSubmission(submissionId: string): Promise<Submission> {
  return api.get<Submission>(`/submissions/${encodeURIComponent(submissionId)}`);
}
