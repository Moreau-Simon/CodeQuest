import {
  eliminationCount,
  selectEliminated,
  type EliminationCandidate
} from '../../src/modules/battle-royale/elimination.rule';

/**
 * T216 [P] [US14] — écrit avant l'implémentation (constitution IV).
 *
 * FR-098 / clarification 4 : une élimination par manche jusqu'à 50 restants,
 * puis 10 % arrondis au supérieur ; départage par la soumission la plus tardive.
 */
const candidate = (id: string, score: number, submittedAt: string): EliminationCandidate => ({
  subjectType: 'player',
  subjectId: id,
  score,
  submittedAt
});

describe('Règle d’élimination battle royale (T216)', () => {
  it('élimine une seule personne jusqu’à 50 participants restants', () => {
    expect(eliminationCount(2)).toBe(1);
    expect(eliminationCount(8)).toBe(1);
    expect(eliminationCount(50)).toBe(1);
  });

  it('élimine 10 % arrondis au supérieur au-delà de 50 participants', () => {
    expect(eliminationCount(51)).toBe(6);
    expect(eliminationCount(120)).toBe(12);
    expect(eliminationCount(101)).toBe(11);
  });

  it('accepte une règle paramétrable sans dépasser les participants restants', () => {
    expect(eliminationCount(40, { threshold: 10, percent: 25 })).toBe(10);
    expect(eliminationCount(2, { threshold: 10, percent: 25 })).toBe(1);
    expect(eliminationCount(1)).toBe(0);
  });

  it('élimine le score le plus faible', () => {
    const results = [candidate('a', 900, '2026-01-01T10:00:00Z'), candidate('b', 780, '2026-01-01T10:01:00Z')];
    expect(selectEliminated(results).map((entry) => entry.subjectId)).toEqual(['b']);
  });

  it('départage les scores égaux par la soumission la plus tardive', () => {
    const results = [
      candidate('early', 500, '2026-01-01T10:00:00Z'),
      candidate('late', 500, '2026-01-01T10:05:00Z'),
      candidate('high', 900, '2026-01-01T10:02:00Z')
    ];
    expect(selectEliminated(results).map((entry) => entry.subjectId)).toEqual(['late']);
  });

  it('élimine plusieurs personnes quand la règle le demande', () => {
    const results = [
      candidate('a', 100, '2026-01-01T10:00:00Z'),
      candidate('b', 200, '2026-01-01T10:01:00Z'),
      candidate('c', 300, '2026-01-01T10:02:00Z'),
      candidate('d', 400, '2026-01-01T10:03:00Z')
    ];
    expect(selectEliminated(results, { threshold: 1, percent: 50 }).map((entry) => entry.subjectId)).toEqual([
      'a',
      'b'
    ]);
  });

  it('rejette une règle invalide plutôt que de deviner', () => {
    expect(() => eliminationCount(8, { threshold: 0, percent: 10 })).toThrow(/règle/i);
    expect(() => eliminationCount(8, { threshold: 50, percent: 0 })).toThrow(/règle/i);
  });
});
