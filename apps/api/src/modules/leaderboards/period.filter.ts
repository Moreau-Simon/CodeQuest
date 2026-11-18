import type { LeaderboardPeriod } from './leaderboard.constants';

export interface PeriodWindow {
  since: Date | null;
  until: Date | null;
  /** Vrai si la période ne peut rien contenir (aucune saison active). */
  empty: boolean;
}

/** Lundi 00:00:00 UTC de la semaine ISO contenant `now`. */
export function startOfIsoWeekUtc(now: Date): Date {
  const day = now.getUTCDay(); // 0 = dimanche
  const daysSinceMonday = (day + 6) % 7;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday)
  );
}

/** Premier jour du mois à 00:00:00 UTC. */
export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface SeasonWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Fenêtre temporelle d'un filtre de période (FR-047).
 *
 * `season` utilise la saison de la portée si elle est fournie, sinon la saison
 * active à `now`. Aucune saison active ⇒ fenêtre vide (le classement renvoie
 * `items: []` plutôt que de retomber silencieusement sur « tout »).
 */
export function periodWindow(
  period: LeaderboardPeriod,
  now: Date,
  activeSeason?: SeasonWindow | null
): PeriodWindow {
  switch (period) {
    case 'week':
      return { since: startOfIsoWeekUtc(now), until: null, empty: false };
    case 'month':
      return { since: startOfMonthUtc(now), until: null, empty: false };
    case 'season':
      if (!activeSeason) return { since: null, until: null, empty: true };
      return { since: activeSeason.startsAt, until: activeSeason.endsAt, empty: false };
    case 'all':
    default:
      return { since: null, until: null, empty: false };
  }
}
