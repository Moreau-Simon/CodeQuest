import { createSimilarityJob, type SimilarityCandidate } from './similarity.job';

/** T255 [US17] (FR-114) : détection asynchrone et revue humaine uniquement. */
const CANDIDATES: SimilarityCandidate[] = [
  {
    id: 's1',
    challengeId: 'c1',
    userId: 'u1',
    language: 'python',
    code: 'def solve(x):\n    return x + 1\n',
    createdAt: new Date('2026-11-27T10:00:00.000Z')
  },
  {
    id: 's2',
    challengeId: 'c1',
    userId: 'u2',
    language: 'python',
    code: 'def compute(y):\n    return y + 1\n',
    createdAt: new Date('2026-11-27T10:01:00.000Z')
  },
  {
    id: 's3',
    challengeId: 'c2',
    userId: 'u1',
    language: 'python',
    code: 'def solve(x):\n    return x + 1\n',
    createdAt: new Date('2026-11-27T10:02:00.000Z')
  }
];

describe('Job de similarité (T255 / FR-114)', () => {
  it('compare uniquement les soumissions d’un même défi et ouvre une revue humaine', async () => {
    const store = {
      findRecent: jest.fn().mockResolvedValue(CANDIDATES),
      recordFinding: jest.fn().mockResolvedValue(undefined)
    };
    const job = createSimilarityJob(store, { threshold: 0.8 });

    const result = await job.sweep();

    expect(result).toEqual({ compared: 1, findings: 1, sanctioned: 0 });
    expect(store.recordFinding).toHaveBeenCalledTimes(1);
    expect(store.recordFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: 'c1',
        submissionAId: 's1',
        submissionBId: 's2',
        status: 'open',
        review: 'human'
      })
    );
  });

  it('n’enregistre rien sous le seuil', async () => {
    const store = {
      findRecent: jest.fn().mockResolvedValue([
        CANDIDATES[0],
        { ...CANDIDATES[1], code: 'while true:\n    pass\n' }
      ]),
      recordFinding: jest.fn().mockResolvedValue(undefined)
    };
    const job = createSimilarityJob(store, { threshold: 0.95 });

    const result = await job.sweep();

    expect(result.findings).toBe(0);
    expect(store.recordFinding).not.toHaveBeenCalled();
  });
});
