import {
  DEFAULT_XP_CURVE,
  levelForXp,
  normalizeXpCurve,
  xpForLevel,
  xpToNextLevel,
  type XpCurveConfig
} from '../../src/modules/lessons/xp-curve';

/**
 * T129 [P] [US6] Tests unitaires de la courbe d'XP (FR-054)
 * - monotonie du niveau et des paliers
 * - paliers déterministes et paramétrables via PlatformSetting
 * - aucun niveau négatif, même avec une entrée invalide
 */
describe('Courbe d’XP et niveaux (T129)', () => {
  it('fixe des paliers déterministes avec la courbe par défaut', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(4)).toBe(450);
    expect(xpForLevel(5)).toBe(700);
  });

  it('convertit un XP cumulé en niveau sans saut ni régression', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
    expect(levelForXp(449)).toBe(3);
    expect(levelForXp(450)).toBe(4);
  });

  it('est monotone sur toute la plage testée (XP et paliers)', () => {
    let previousLevel = 0;
    let previousThreshold = -1;
    for (let xp = 0; xp <= 10_000; xp += 25) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(previousLevel);
      previousLevel = level;
    }
    for (let level = 1; level <= DEFAULT_XP_CURVE.maxLevel; level += 1) {
      const threshold = xpForLevel(level);
      expect(threshold).toBeGreaterThan(previousThreshold);
      previousThreshold = threshold;
    }
  });

  it('ne produit jamais de niveau négatif, même avec une entrée invalide', () => {
    expect(levelForXp(-10)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelForXp(Number.POSITIVE_INFINITY)).toBe(1);
    expect(levelForXp(0, { base: 100, growth: 50, maxLevel: 100 })).toBe(1);
  });

  it('plafonne le niveau à maxLevel', () => {
    expect(levelForXp(1_000_000)).toBe(DEFAULT_XP_CURVE.maxLevel);
    expect(xpToNextLevel(1_000_000)).toBeNull();
  });

  it('accepte une courbe paramétrable sans croissance (paliers linéaires)', () => {
    const linear: XpCurveConfig = { base: 10, growth: 0, maxLevel: 5 };
    expect(xpForLevel(1, linear)).toBe(0);
    expect(xpForLevel(2, linear)).toBe(10);
    expect(xpForLevel(5, linear)).toBe(40);
    expect(levelForXp(29, linear)).toBe(3);
    expect(levelForXp(10_000, linear)).toBe(5);
  });

  it('calcule l’XP restant avant le palier suivant', () => {
    expect(xpToNextLevel(0)).toBe(100);
    expect(xpToNextLevel(100)).toBe(150);
    expect(xpToNextLevel(249)).toBe(1);
  });

  it('valide et assainit la configuration stockée dans PlatformSetting', () => {
    expect(normalizeXpCurve({ base: 50, growth: 25, maxLevel: 20 })).toEqual({
      base: 50,
      growth: 25,
      maxLevel: 20
    });
    expect(normalizeXpCurve(null)).toEqual(DEFAULT_XP_CURVE);
    expect(() => normalizeXpCurve({ base: 0, growth: 10, maxLevel: 10 })).toThrow(/base/i);
    expect(() => normalizeXpCurve({ base: 10, growth: -1, maxLevel: 10 })).toThrow(/growth/i);
    expect(() => normalizeXpCurve({ base: 10, growth: 10, maxLevel: 0 })).toThrow(/maxLevel/i);
  });
});
