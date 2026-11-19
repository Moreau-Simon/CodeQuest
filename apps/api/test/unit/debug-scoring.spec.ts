import { DiffService } from '../../src/modules/submissions/diff.service';
import {
  ResolutionScoringService,
  type ResolutionScoringInput
} from '../../src/modules/scoring/resolution-scoring.service';

/**
 * T139 [P] [US7] Tests unitaires du score de débogage/décryptage (FR-038, FR-039)
 * et de A5 (clarification 2026-11-19) :
 * - chrono du `start` explicite au verdict `passed`, plafonné à `t_max_ms`
 * - abandon jusqu'à `attempt.expiredAt`
 * - pénalités indices et lignes modifiées, une seule tentative en v1
 */
describe('Score de résolution — débogage et décryptage (T139)', () => {
  const scorer = new ResolutionScoringService();
  const startedAt = new Date('2026-11-19T10:00:00.000Z');
  const at = (ms: number): Date => new Date(startedAt.getTime() + ms);

  const base = (overrides: Partial<ResolutionScoringInput> = {}): ResolutionScoringInput => ({
    basePoints: 100,
    perfMax: 50,
    testsPassed: 4,
    testsTotal: 4,
    startedAt,
    verdictAt: at(100),
    tOptMs: 100,
    tMaxMs: 1_000,
    hintsUsed: 0,
    attempts: 1,
    modifiedLines: 0,
    maxModifiedLines: 2,
    ...overrides
  });

  it('arrête le chrono au verdict passed et donne le bonus maximum au temps optimal', () => {
    const result = scorer.compute(base());

    expect(result.resolutionMs).toBe(100);
    expect(result.timeRatio).toBe(1);
    expect(result.score).toBe(150);
  });

  it('ne démarre pas à l’ouverture de la page mais au start explicite', () => {
    // `startedAt` est postérieur à une ouverture de page hypothétique : seul
    // l'écart depuis `startedAt` compte, pas depuis la création du défi.
    const result = scorer.compute(base({ startedAt: at(500), verdictAt: at(600) }));

    expect(result.resolutionMs).toBe(100);
    expect(result.score).toBe(150);
  });

  it('plafonne la durée à t_max_ms : un verdict tardif perd tout le bonus temps', () => {
    const result = scorer.compute(base({ verdictAt: at(60_000) }));

    expect(result.resolutionMs).toBe(1_000);
    expect(result.timeRatio).toBe(0);
    expect(result.score).toBe(100);
  });

  it('utilise attempt.expiredAt comme fin de chrono en cas d’abandon', () => {
    const result = scorer.compute(base({ verdictAt: undefined, expiredAt: at(2_000) }));

    expect(result.resolutionMs).toBe(1_000);
    expect(result.score).toBe(100);
  });

  it('refuse un abandon sans date d’expiration', () => {
    expect(() => scorer.compute(base({ verdictAt: undefined }))).toThrow(/expiredAt/);
  });

  it('ne récompense jamais un code qui échoue aux tests cachés', () => {
    const result = scorer.compute(base({ testsPassed: 0 }));

    expect(result.score).toBe(0);
  });

  it('pénalise 10 % de base_points par indice, dans la limite de 50 %', () => {
    expect(scorer.compute(base({ hintsUsed: 2 })).score).toBe(130);
    // 20 indices → pénalité plafonnée à 50 % de base_points (50), bonus conservé.
    expect(scorer.compute(base({ hintsUsed: 20 })).score).toBe(100);
  });

  it('perd le bonus temps et pénalise les lignes excédentaires', () => {
    const result = scorer.compute(base({ modifiedLines: 4, maxModifiedLines: 2 }));

    expect(result.bonusEligible).toBe(false);
    // 2 lignes excédentaires × 2 % de 100 = 4 points, bonus temps perdu.
    expect(result.score).toBe(96);
  });

  it('accorde le bonus temps quand la limite de lignes est respectée', () => {
    const result = scorer.compute(base({ modifiedLines: 2, maxModifiedLines: 2 }));

    expect(result.bonusEligible).toBe(true);
    expect(result.score).toBe(150);
  });

  it('rejette plusieurs tentatives : une seule autorisée en v1', () => {
    expect(() => scorer.compute(base({ attempts: 2 }))).toThrow(/une seule tentative/i);
  });

  it('rejette des bornes de temps incohérentes', () => {
    expect(() => scorer.compute(base({ tOptMs: 1_000, tMaxMs: 100 }))).toThrow(/t_opt_ms/);
  });
});

describe('Comptage des lignes modifiées (T139 / FR-038)', () => {
  const diff = new DiffService();

  it('ignore l’indentation et les espaces (diff normalisé indépendant du style)', () => {
    expect(
      diff.countModifiedLines('def solve(x):\n    return sorted(x)', 'def solve(x):\n  return sorted( x )')
    ).toBe(0);
  });

  it('compte une ligne remplacée une seule fois', () => {
    expect(diff.countModifiedLines('a\nb\nc', 'a\nB\nc')).toBe(1);
  });

  it('compte les ajouts et les suppressions', () => {
    expect(diff.countModifiedLines('a\nb', 'a\nb\nc')).toBe(1);
    expect(diff.countModifiedLines('a\nb\nc', 'a\nc')).toBe(1);
  });

  it('gère les fins de ligne CRLF', () => {
    expect(diff.countModifiedLines('a\r\nb', 'a\nb')).toBe(0);
  });
});
