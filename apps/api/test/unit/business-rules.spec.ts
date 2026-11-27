import type { Event } from '@prisma/client';
import { EliminationService } from '../../src/modules/battle-royale/elimination.service';
import {
  eliminationCount,
  normalizeRule,
  subjectKey
} from '../../src/modules/battle-royale/elimination.rule';
import { ResolutionScoringService } from '../../src/modules/scoring/resolution-scoring.service';
import { ScoringService } from '../../src/modules/scoring/scoring.service';

/** T264 — complète les branches métier non encore exercées (élimination, scoring). */
const event = (eliminationRule: unknown = null): Pick<Event, 'eliminationRule'> =>
  ({ eliminationRule } as Pick<Event, 'eliminationRule'>);

describe('Normalisation de la règle d’élimination (T264)', () => {
  it('applique la règle par défaut pour toute valeur absente ou non objétique', () => {
    expect(normalizeRule()).toEqual({ threshold: 50, percent: 10 });
    expect(normalizeRule(null)).toEqual({ threshold: 50, percent: 10 });
    expect(normalizeRule('invalide')).toEqual({ threshold: 50, percent: 10 });
    expect(normalizeRule({ percent: 20 })).toEqual({ threshold: 50, percent: 20 });
    expect(normalizeRule({ threshold: 10 })).toEqual({ threshold: 10, percent: 10 });
  });

  it('rejette les seuils et pourcentages hors domaine', () => {
    for (const rule of [
      { threshold: 1.5, percent: 10 },
      { threshold: 0, percent: 10 },
      { threshold: 50, percent: Number.NaN },
      { threshold: 50, percent: 0 },
      { threshold: 50, percent: 101 }
    ]) {
      expect(() => normalizeRule(rule)).toThrow(/élimination/i);
    }
  });

  it('ne réduit jamais au-delà du nombre de participants', () => {
    expect(eliminationCount(-1)).toBe(0);
    expect(eliminationCount(1.5)).toBe(0);
    expect(eliminationCount(0)).toBe(0);
    expect(eliminationCount(1)).toBe(0);
    expect(eliminationCount(40, { threshold: 50, percent: 90 })).toBe(1);
    expect(eliminationCount(60, { threshold: 50, percent: 90 })).toBe(54);
  });

  it('départage des scores et horodatages identiques par identifiant', () => {
    const service = new EliminationService();
    const candidates = [
      { subjectType: 'player' as const, subjectId: 'b', score: 10, submittedAt: '2026-01-01T00:00:00Z' },
      { subjectType: 'player' as const, subjectId: 'a', score: 10, submittedAt: '2026-01-01T00:00:00Z' },
      { subjectType: 'player' as const, subjectId: 'c', score: 90, submittedAt: '2026-01-01T00:00:00Z' }
    ];
    expect(service.select(candidates, event()).map((entry) => entry.subjectId)).toEqual(['a']);
    expect(subjectKey(candidates[0]!)).toBe('player:b');
  });

  it('lit la règle de l’événement sans jamais la deviner à partir du hasard', () => {
    const service = new EliminationService();
    expect(service.ruleFor(event())).toEqual({ threshold: 50, percent: 10 });
    expect(service.ruleFor(event({ threshold: 8, percent: 25 }))).toEqual({
      threshold: 8,
      percent: 25
    });
    expect(() => service.ruleFor(event({ threshold: 0 }))).toThrow(/élimination/i);
  });
});

describe('Bornes de validation du scoring (T264)', () => {
  const scorer = new ScoringService();
  const base = {
    basePoints: 100,
    perfMax: 50,
    testsPassed: 8,
    testsTotal: 10,
    cpuTimeMedianMs: 500,
    tOptMs: 200,
    tMaxMs: 1_000
  };

  it('rejette des points négatifs et des bornes de temps nulles', () => {
    expect(() => scorer.compute({ ...base, basePoints: -1 })).toThrow(/positifs/);
    expect(() => scorer.compute({ ...base, perfMax: -1 })).toThrow(/positifs/);
    expect(() => scorer.compute({ ...base, tOptMs: 0 })).toThrow(/t_opt_ms/);
  });

  it('borne le ratio de tests et le bonus de performance', () => {
    const excess = scorer.compute({ ...base, testsPassed: 50 });
    expect(excess.testsRatio).toBe(1);
    expect(scorer.compute({ ...base, cpuTimeMedianMs: -500 }).perfRatio).toBe(1);
    expect(scorer.score(base)).toBeCloseTo(111.25, 2);
  });
});

describe('Validation du score de résolution (T264)', () => {
  const scorer = new ResolutionScoringService();
  const startedAt = new Date('2031-06-03T10:00:00Z');
  const at = (ms: number): Date => new Date(startedAt.getTime() + ms);
  const base = (overrides: Partial<Parameters<ResolutionScoringService['compute']>[0]> = {}) => ({
    basePoints: 100,
    perfMax: 50,
    testsPassed: 4,
    testsTotal: 4,
    startedAt,
    verdictAt: at(100),
    tOptMs: 100,
    tMaxMs: 1_000,
    ...overrides
  });

  it('rejette les entrées incohérentes avant tout calcul', () => {
    expect(() => scorer.compute(base({ basePoints: -1 }))).toThrow(/positifs/);
    expect(() => scorer.compute(base({ perfMax: -1 }))).toThrow(/positifs/);
    expect(() => scorer.compute(base({ testsTotal: 0 }))).toThrow(/testsTotal/);
    expect(() => scorer.compute(base({ tOptMs: 0 }))).toThrow(/t_opt_ms/);
    expect(() => scorer.compute(base({ startedAt: new Date('invalide') }))).toThrow(/startedAt/);
    expect(() => scorer.compute(base({ verdictAt: undefined }))).toThrow(/expiredAt/);
    expect(() =>
      scorer.compute(base({ verdictAt: undefined, expiredAt: new Date('invalide') }))
    ).toThrow(/expiredAt/);
    expect(() => scorer.compute(base({ attempts: 0 }))).toThrow(/tentative/);
  });

  it('clamp les pénalités et la durée de résolution', () => {
    const capped = scorer.compute(base({ hintsUsed: 50, modifiedLines: 500, maxModifiedLines: 1 }));
    expect(capped.hintPenalty).toBe(50);
    expect(capped.linePenalty).toBe(50);
    expect(capped.score).toBe(0);
    expect(scorer.compute(base({ hintsUsed: -3, modifiedLines: -4 })).score).toBe(150);
    expect(scorer.compute(base({ verdictAt: at(-5_000) })).resolutionMs).toBe(0);
  });

  it('considère la limite de lignes par défaut comme illimitée', () => {
    const result = scorer.compute(base({ modifiedLines: 100, maxModifiedLines: undefined }));
    expect(result.bonusEligible).toBe(true);
    expect(result.linePenalty).toBe(0);
    expect(result.score).toBe(150);
  });

  it('refuse le bonus temps quand aucun test n’est réussi', () => {
    const result = scorer.compute(base({ testsPassed: 0, verdictAt: at(100) }));
    expect(result.score).toBe(0);
    expect(result.timeRatio).toBe(1);
  });
});
