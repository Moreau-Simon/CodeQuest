import { uuidv7 } from '../../common/uuid';
import { detectSimilarity, type SimilarityFinding, type SupportedLanguage } from './similarity';

/** T255 [US17] (FR-114) : détection asynchrone, sans sanction automatique. */
export interface SimilarityCandidate {
  readonly id: string;
  readonly challengeId: string;
  readonly userId: string;
  readonly language: SupportedLanguage;
  readonly code: string;
  readonly createdAt: Date;
}

export interface SimilarityRecord extends SimilarityFinding {
  readonly id: string;
  readonly challengeId: string;
  readonly submissionAId: string;
  readonly submissionBId: string;
  readonly status: 'open';
}

export interface SimilarityStore {
  findRecent(limit?: number): Promise<readonly SimilarityCandidate[]>;
  recordFinding(finding: SimilarityRecord): Promise<void>;
}

export interface SimilarityJobOptions {
  readonly threshold?: number;
  readonly shingleSize?: number;
  readonly limit?: number;
  readonly windowMs?: number;
}

export interface SimilarityJobResult {
  readonly compared: number;
  readonly findings: number;
  /** Toujours 0 : la décision revient à un humain (FR-114). */
  readonly sanctioned: 0;
}

/**
 * Compare les soumissions récentes d'un même défi. Les paires suspectes sont
 * enregistrées comme `open` et jamais `sanctioned` : seul un modérateur pourra
 * donner suite.
 */
export function createSimilarityJob(store: SimilarityStore, options: SimilarityJobOptions = {}) {
  const threshold = options.threshold ?? 0.8;
  const windowMs = options.windowMs ?? 24 * 60 * 60 * 1000;

  return {
    async sweep(now: Date = new Date()): Promise<SimilarityJobResult> {
      const candidates = await store.findRecent(options.limit ?? 500);
      const byChallenge = new Map<string, SimilarityCandidate[]>();
      for (const candidate of candidates) {
        if (now.getTime() - candidate.createdAt.getTime() > windowMs) continue;
        const group = byChallenge.get(candidate.challengeId) ?? [];
        group.push(candidate);
        byChallenge.set(candidate.challengeId, group);
      }

      let compared = 0;
      let findings = 0;
      for (const group of byChallenge.values()) {
        for (let left = 0; left < group.length; left += 1) {
          for (let right = left + 1; right < group.length; right += 1) {
            const a = group[left]!;
            const b = group[right]!;
            if (a.userId === b.userId || a.language !== b.language) continue;
            compared += 1;
            const result = detectSimilarity(a.code, b.code, a.language, {
              threshold,
              shingleSize: options.shingleSize
            });
            if (!result.suspicious) continue;
            await store.recordFinding({
              ...result,
              id: uuidv7(),
              challengeId: a.challengeId,
              submissionAId: a.id,
              submissionBId: b.id,
              status: 'open'
            });
            findings += 1;
          }
        }
      }

      return { compared, findings, sanctioned: 0 };
    }
  };
}
