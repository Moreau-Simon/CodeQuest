import { ScoringService } from '../../src/modules/scoring/scoring.service';

/** T068 — bornes, monotonie et arrondi de la formule de score. */
describe('ScoringService (T068)', () => {
  const service = new ScoringService();
  const base = {
    basePoints: 100,
    perfMax: 50,
    testsPassed: 10,
    testsTotal: 10,
    cpuTimeMedianMs: 500,
    tOptMs: 200,
    tMaxMs: 1_000
  };

  it('atteint le score maximal avec tous les tests et un temps optimal', () => {
    expect(service.score({ ...base, cpuTimeMedianMs: 200 })).toBe(150);
  });

  it('ne descend jamais sous zéro, même avec un temps au-delà de t_max', () => {
    expect(service.score({ ...base, cpuTimeMedianMs: 5_000 })).toBe(100);
  });

  it('proportionne la part des tests réussis', () => {
    expect(service.score({ ...base, testsPassed: 5, cpuTimeMedianMs: 1_000 })).toBe(50);
    expect(service.score({ ...base, testsPassed: 0, cpuTimeMedianMs: 1_000 })).toBe(0);
  });

  it('interpole linéairement le bonus de performance', () => {
    // (1000 − 600) / (1000 − 200) = 0,5 → 100 + 25
    const result = service.compute({ ...base, cpuTimeMedianMs: 600 });
    expect(result.perfRatio).toBeCloseTo(0.5, 10);
    expect(result.score).toBe(125);
  });

  it('borne toujours le score à base_points + perf_max', () => {
    for (const median of [-1_000, 0, 200, 600, 1_000, 10_000]) {
      const score = service.score({ ...base, cpuTimeMedianMs: median });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(base.basePoints + base.perfMax);
    }
  });

  it('arrondit au centième', () => {
    const score = service.score({
      ...base,
      testsPassed: 1,
      testsTotal: 3,
      perfMax: 0,
      cpuTimeMedianMs: 1_000
    });
    expect(score).toBe(33.33);
  });

  it('rejette des bornes de temps incohérentes', () => {
    expect(() => service.score({ ...base, tOptMs: 1_000, tMaxMs: 1_000 })).toThrow(/t_opt_ms/);
    expect(() => service.score({ ...base, testsTotal: 0 })).toThrow(/testsTotal/);
  });

  it('reste dans la tolérance de ±5 % pour une même mesure', () => {
    const reference = service.score({ ...base, cpuTimeMedianMs: 600 });
    const jittered = service.score({ ...base, cpuTimeMedianMs: 540 });
    expect(Math.abs(jittered - reference) / reference).toBeLessThanOrEqual(0.05);
  });
});
