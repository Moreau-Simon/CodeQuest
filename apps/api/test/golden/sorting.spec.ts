import { ScoringService } from '../../src/modules/scoring/scoring.service';

/**
 * T069 — Golden tests de non-régression des trois profils de soumission d'un
 * défi de tri : correct lent, correct optimal, incorrect. Les valeurs sont
 * figées pour détecter toute dérive silencieuse de la formule.
 */
describe('golden — tri (T069)', () => {
  const service = new ScoringService();
  const challenge = {
    basePoints: 300,
    perfMax: 120,
    testsTotal: 20,
    tOptMs: 150,
    tMaxMs: 2_000
  };

  it('correct lent (1 500 ms, 20/20)', () => {
    const result = service.compute({
      ...challenge,
      testsPassed: 20,
      cpuTimeMedianMs: 1_500
    });
    expect(result.score).toBe(332.43);
    expect(result.perfRatio).toBeCloseTo(0.27027027, 8);
  });

  it('correct optimal (150 ms, 20/20)', () => {
    expect(service.score({ ...challenge, testsPassed: 20, cpuTimeMedianMs: 150 })).toBe(420);
  });

  it('incorrect (0/20) : aucun score, même rapide', () => {
    expect(service.score({ ...challenge, testsPassed: 0, cpuTimeMedianMs: 100 })).toBe(0);
  });

  it('partiel (10/20, 1 000 ms)', () => {
    expect(service.score({ ...challenge, testsPassed: 10, cpuTimeMedianMs: 1_000 })).toBe(214.86);
  });
});
