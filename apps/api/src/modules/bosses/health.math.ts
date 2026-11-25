/**
 * Calcul pur des points de vie (US10, FR-067/FR-069).
 *
 * Aucune dépendance Nest ni Prisma : ces fonctions sont testées unitairement
 * (T175) et utilisées par `HealthService` pour matérialiser la régénération.
 */
export const MAX_HP = 100;
export const REGEN_INTERVAL_MS = 6 * 60_000;
export const KO_DURATION_MS = 30 * 60_000;

export interface HealthSnapshot {
  hp: number;
  maxHp: number;
  lastRegenAt: Date;
  koUntil: Date | null;
}

export interface RegenerationResult {
  hp: number;
  lastRegenAt: Date;
  koUntil: Date | null;
  /** Nombre de pas de 6 minutes effectivement régénérés. */
  ticks: number;
}

/** Borne les PV à `[0, maxHp]`. */
export function clampHp(hp: number, maxHp = MAX_HP): number {
  return Math.max(0, Math.min(maxHp, Math.round(hp)));
}

/** Déduit des dégâts (valeurs négatives ignorées) sans descendre sous zéro. */
export function damageHp(hp: number, damage: number, maxHp = MAX_HP): number {
  return clampHp(hp - Math.max(0, damage), maxHp);
}

/** Restaure des PV (potion) sans dépasser le maximum. */
export function restoreHp(hp: number, amount: number, maxHp = MAX_HP): number {
  return clampHp(hp + Math.max(0, amount), maxHp);
}

/** Échéance de fin de KO : 30 minutes après le coup fatal. */
export function koUntilFrom(now: Date): Date {
  return new Date(now.getTime() + KO_DURATION_MS);
}

/**
 * Point de départ de l'horloge de régénération pendant un KO.
 *
 * `koUntil - 6 min` fait tomber la première régénération exactement à la fin
 * du KO, puis une fois toutes les 6 minutes.
 */
export function lastRegenAtDuringKo(koUntil: Date): Date {
  return new Date(koUntil.getTime() - REGEN_INTERVAL_MS);
}

/** Base à partir de laquelle les pas de régénération sont comptés. */
function regenBase(snapshot: HealthSnapshot): Date {
  if (!snapshot.koUntil) return snapshot.lastRegenAt;
  // À l'entrée en KO, `lastRegenAt` vaut `koUntil - 6 min` : le premier pas
  // tombe à la fin du KO. Les données plus anciennes sont ramenées à cette
  // borne pour ne pas créditer toute la durée du KO.
  const earliest = lastRegenAtDuringKo(snapshot.koUntil);
  return new Date(Math.max(snapshot.lastRegenAt.getTime(), earliest.getTime()));
}

/**
 * Régénération calculée à la lecture : `ticks` pas de 6 minutes depuis la base,
 * plafonnée à `maxHp`, et suspendue tant que `now < koUntil`.
 */
export function computeRegeneration(snapshot: HealthSnapshot, now: Date): RegenerationResult {
  if (snapshot.hp >= snapshot.maxHp) {
    return { hp: snapshot.maxHp, lastRegenAt: snapshot.lastRegenAt, koUntil: null, ticks: 0 };
  }
  if (snapshot.koUntil && now.getTime() < snapshot.koUntil.getTime()) {
    return {
      hp: snapshot.hp,
      lastRegenAt: snapshot.lastRegenAt,
      koUntil: snapshot.koUntil,
      ticks: 0
    };
  }

  const base = regenBase(snapshot);
  const ticks = Math.max(0, Math.floor((now.getTime() - base.getTime()) / REGEN_INTERVAL_MS));
  if (ticks === 0) {
    return { hp: snapshot.hp, lastRegenAt: snapshot.lastRegenAt, koUntil: null, ticks: 0 };
  }

  return {
    hp: Math.min(snapshot.maxHp, snapshot.hp + ticks),
    lastRegenAt: new Date(Math.min(now.getTime(), base.getTime() + ticks * REGEN_INTERVAL_MS)),
    koUntil: null,
    ticks
  };
}

/** Prochaine échéance de régénération, ou `null` si les PV sont pleins. */
export function nextRegenerationAt(snapshot: HealthSnapshot, now: Date): Date | null {
  if (snapshot.hp >= snapshot.maxHp) return null;
  if (snapshot.koUntil && now.getTime() < snapshot.koUntil.getTime()) return snapshot.koUntil;
  return new Date(regenBase(snapshot).getTime() + REGEN_INTERVAL_MS);
}
