import {
  detectSimilarity,
  jaccardSimilarity,
  normalizeCode,
  shingles
} from '../../src/modules/anti-cheat/similarity';

/** T250 [P] [US17] (FR-114) : similarité structurelle, sans blocage automatique. */
const PYTHON_A = `
def solve(values):
    total = 0
    for item in values:
        total += item
    return total
`;

const PYTHON_B = `
// une copie avec d'autres noms et commentaires
def compute(numbers):
    result = 0
    for number in numbers:
        result += number
    return result
`;

const PYTHON_C = `
def solve(values):
    total = 1
    while total < 10:
        total *= 2
    return total
`;

describe('Similarité de soumissions (T250 / FR-114)', () => {
  it('normalise le code : commentaires, espaces, littéraux et noms ignorés', () => {
    expect(normalizeCode(PYTHON_A, 'python')).toBe(normalizeCode(PYTHON_B, 'python'));
    expect(normalizeCode(PYTHON_A, 'python')).not.toBe(normalizeCode(PYTHON_C, 'python'));
  });

  it('découpe en shingles de taille configurable', () => {
    expect(shingles('a b c d', 3)).toEqual(['a b c', 'b c d']);
    expect(shingles('a b', 3)).toEqual(['a b']);
  });

  it('calcule un indice de Jaccard borné entre 0 et 1', () => {
    expect(jaccardSimilarity('a b c', 'a b c')).toBe(1);
    expect(jaccardSimilarity('a b c', 'x y z')).toBe(0);
    expect(jaccardSimilarity('a b c d', 'a b c y')).toBeCloseTo(1 / 3);
  });

  it('détecte une copie renommée mais ne propose aucune sanction automatique', () => {
    const finding = detectSimilarity(PYTHON_A, PYTHON_B, 'python', { threshold: 0.8 });

    expect(finding.score).toBeGreaterThanOrEqual(0.8);
    expect(finding.suspicious).toBe(true);
    expect(finding.evidence).toContain('def');
    expect(finding.evidence.length).toBeLessThanOrEqual(500);
    expect(finding).not.toHaveProperty('blocked');
    expect(finding).not.toHaveProperty('sanction');
    expect(finding.review).toBe('human');
  });

  it('laisse un code différent sous le seuil', () => {
    const finding = detectSimilarity(PYTHON_A, PYTHON_C, 'python', { threshold: 0.8 });

    expect(finding.score).toBeLessThan(0.8);
    expect(finding.suspicious).toBe(false);
  });
});
