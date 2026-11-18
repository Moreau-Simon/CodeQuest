/**
 * Courbe d'XP et conversion en niveaux (T129, FR-054).
 *
 * Les paliers suivent une progression arithmétique : l'incrément pour passer
 * du niveau n au niveau n+1 vaut `base + growth * (n - 1)`. Le cumul pour
 * atteindre le niveau L est donc :
 *
 *   xpForLevel(L) = base * (L - 1) + growth * (L - 1) * (L - 2) / 2
 *
 * Avec les valeurs par défaut (100, 50) : 0 / 100 / 250 / 450 / 700 …
 * La configuration est stockée dans `platform_settings` (`xp.curve`) afin de
 * pouvoir recalibrer sans migration (§ « Constantes d'équilibrage »).
 */

export interface XpCurveConfig {
  /** XP requis pour passer du niveau 1 au niveau 2. */
  base: number;
  /** Incrément appliqué à chaque palier suivant. */
  growth: number;
  /** Niveau maximal atteignable ( borne la conversion). */
  maxLevel: number;
}

export const DEFAULT_XP_CURVE: Readonly<XpCurveConfig> = Object.freeze({
  base: 100,
  growth: 50,
  maxLevel: 100
});

/** Valide une configuration partielle et applique les valeurs par défaut. */
export function normalizeXpCurve(value: unknown): XpCurveConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_XP_CURVE };
  }
  const raw = value as Record<string, unknown>;
  const base = raw.base === undefined ? DEFAULT_XP_CURVE.base : raw.base;
  const growth = raw.growth === undefined ? DEFAULT_XP_CURVE.growth : raw.growth;
  const maxLevel = raw.maxLevel === undefined ? DEFAULT_XP_CURVE.maxLevel : raw.maxLevel;

  if (!Number.isSafeInteger(base) || (base as number) < 1) {
    throw new Error('Configuration XP invalide : base doit être un entier ≥ 1');
  }
  if (!Number.isSafeInteger(growth) || (growth as number) < 0) {
    throw new Error('Configuration XP invalide : growth doit être un entier ≥ 0');
  }
  if (!Number.isSafeInteger(maxLevel) || (maxLevel as number) < 1) {
    throw new Error('Configuration XP invalide : maxLevel doit être un entier ≥ 1');
  }
  return { base: base as number, growth: growth as number, maxLevel: maxLevel as number };
}

/** XP cumulé minimal requis pour atteindre un niveau donné. */
export function xpForLevel(level: number, curve: XpCurveConfig = { ...DEFAULT_XP_CURVE }): number {
  if (!Number.isFinite(level)) return 0;
  const target = Math.min(Math.max(Math.floor(level), 1), curve.maxLevel);
  const n = target - 1;
  if (n <= 0) return 0;
  return Math.floor(curve.base * n + (curve.growth * n * (n - 1)) / 2);
}

/**
 * Niveau atteint pour un XP cumulé. La borne inférieure est 1 : une valeur
 * négative, NaN ou infinie ne peut jamais produire un niveau négatif.
 */
export function levelForXp(xp: number, curve: XpCurveConfig = { ...DEFAULT_XP_CURVE }): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  if (safeXp < curve.base || safeXp <= 0) return 1;

  let steps: number;
  if (curve.growth === 0) {
    steps = Math.floor(safeXp / curve.base);
  } else {
    // Résolution de growth*n² + (2*base - growth)*n - 2*xp = 0.
    const b = 2 * curve.base - curve.growth;
    const discriminant = b * b + 8 * curve.growth * safeXp;
    steps = Math.floor((-b + Math.sqrt(discriminant)) / (2 * curve.growth));
  }

  // Correction des arrondis flottants, puis plafonnement au niveau maximal.
  steps = Math.max(0, Math.min(steps, curve.maxLevel - 1));
  while (steps > 0 && xpForLevel(steps + 2, curve) > safeXp) steps -= 1;
  while (steps + 1 < curve.maxLevel && xpForLevel(steps + 2, curve) <= safeXp) steps += 1;
  return steps + 1;
}

/** XP restant avant le palier suivant, ou `null` au niveau maximal. */
export function xpToNextLevel(
  xp: number,
  curve: XpCurveConfig = { ...DEFAULT_XP_CURVE }
): number | null {
  const level = levelForXp(xp, curve);
  if (level >= curve.maxLevel) return null;
  return xpForLevel(level + 1, curve) - Math.max(0, Math.floor(xp));
}
