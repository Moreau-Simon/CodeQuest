import { api } from './api-client';

export type LeaderboardScope = 'global' | 'theme' | 'season' | 'event' | 'team';
export type LeaderboardPeriod = 'week' | 'month' | 'season' | 'all';

export interface LeaderboardEntry {
  rank: number;
  subjectId: string;
  displayName: string;
  score: number;
  achievedAt: string;
}

export interface LeaderboardResult {
  scope: LeaderboardScope;
  scopeId: string;
  period: LeaderboardPeriod;
  subjectType: 'player' | 'team';
  items: LeaderboardEntry[];
  nextCursor: string | null;
  self: LeaderboardEntry | null;
}

export interface LeaderboardFilters {
  scope?: LeaderboardScope;
  scopeId?: string;
  period?: LeaderboardPeriod;
  cursor?: string;
  limit?: number;
}

function queryString(filters: LeaderboardFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/** Classement des joueurs (FR-045 → FR-049). */
export function getPlayerLeaderboard(
  filters: LeaderboardFilters = {},
  signal?: AbortSignal
): Promise<LeaderboardResult> {
  return api.get<LeaderboardResult>(`/leaderboards/players${queryString(filters)}`, { signal });
}

/** Classement des équipes. */
export function getTeamLeaderboard(
  filters: Omit<LeaderboardFilters, 'scope' | 'scopeId'> = {},
  signal?: AbortSignal
): Promise<LeaderboardResult> {
  return api.get<LeaderboardResult>(`/leaderboards/teams${queryString(filters)}`, { signal });
}

/** Classement dédié à un événement. */
export function getEventLeaderboard(
  eventId: string,
  filters: Omit<LeaderboardFilters, 'scope' | 'scopeId'> = {},
  signal?: AbortSignal
): Promise<LeaderboardResult> {
  return api.get<LeaderboardResult>(
    `/leaderboards/events/${encodeURIComponent(eventId)}${queryString(filters)}`,
    { signal }
  );
}
