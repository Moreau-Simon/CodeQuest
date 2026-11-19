import type { LeaderboardScopeType, SubjectType } from '@prisma/client';

/** UUID sentinelle de la portée globale (voir `LeaderboardEntry.scopeId`). */
export const GLOBAL_SCOPE_ID = '00000000-0000-0000-0000-000000000000';

export type LeaderboardPeriod = 'week' | 'month' | 'season' | 'all';

export const LEADERBOARD_PERIODS: readonly LeaderboardPeriod[] = ['week', 'month', 'season', 'all'];

export const LEADERBOARD_SCOPES: readonly LeaderboardScopeType[] = [
  'global',
  'theme',
  'season',
  'event',
  'team'
];

/**
 * Encodage du ZSET (R7) : `score × 10^10 + (MAX_TS − ts)` où le score est en
 * centièmes de point et `MAX_TS = 9_999_999_999` secondes.
 *
 * Le multiplicateur `10^10` est supérieur à l'amplitude du départage
 * (timestamp Unix en secondes, ≈ 1,8 × 10^9) : un écart d'un centième de point
 * domine toujours le départage temporel. Le score encodé reste un entier
 * exact en double (≤ 10^15 pour un score ≤ 10 000 points, bien en dessous de
 * 2^53). Trier par score décroissant donne donc : score métier décroissant,
 * puis soumission retenue la plus ancienne d'abord (FR-048).
 */
export const SCORE_CENTS_SCALE = 10_000_000_000;
export const TIEBREAK_CEILING_SECONDS = 9_999_999_999;

export function encodeLeaderboardScore(score: number | string, tiebreakAt: Date): number {
  const cents = Math.round(Number(score) * 100);
  const seconds = Math.floor(tiebreakAt.getTime() / 1_000);
  return cents * SCORE_CENTS_SCALE + (TIEBREAK_CEILING_SECONDS - seconds);
}

export interface DecodedLeaderboardScore {
  score: number;
  achievedAt: Date;
}

export function decodeLeaderboardScore(encoded: number | string): DecodedLeaderboardScore {
  const value = Math.trunc(Number(encoded));
  const cents = Math.floor(value / SCORE_CENTS_SCALE);
  const tiebreak = value - cents * SCORE_CENTS_SCALE;
  const seconds = TIEBREAK_CEILING_SECONDS - tiebreak;
  return { score: cents / 100, achievedAt: new Date(seconds * 1_000) };
}

/** Clé Redis du classement (le préfixe global est appliqué par `RedisService`). */
export function leaderboardKey(
  scope: LeaderboardScopeType,
  scopeId: string,
  subjectType: SubjectType = 'player'
): string {
  return `lb:${scope}:${scopeId}:${subjectType}`;
}

/** Room temps réel d'une vue de classement (FR-049). */
export function leaderboardRoom(
  scope: LeaderboardScopeType,
  scopeId: string,
  subjectType: SubjectType,
  period: LeaderboardPeriod
): string {
  return `leaderboard:${scope}:${scopeId}:${subjectType}:${period}`;
}

export const LEADERBOARD_EVENTS = {
  updated: 'leaderboard.updated'
} as const;
