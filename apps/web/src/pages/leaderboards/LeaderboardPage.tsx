import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { t } from '../../i18n';
import { Skeleton } from '../../components/ui';
import {
  getEventLeaderboard,
  getPlayerLeaderboard,
  getTeamLeaderboard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardResult,
  type LeaderboardScope
} from '../../services/leaderboards';

type Tab = 'players' | 'teams' | 'events';

const PERIODS: LeaderboardPeriod[] = ['week', 'month', 'season', 'all'];
const PLAYER_SCOPES: LeaderboardScope[] = ['global', 'theme', 'season'];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatScore(score: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(score);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function EntryTable({ items }: { items: LeaderboardEntry[] }): JSX.Element {
  if (items.length === 0) {
    return <p className="text-muted">{t('leaderboard.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t('leaderboard.tableCaption')}</caption>
        <thead>
          <tr className="border-b border-elevated text-sm text-muted">
            <th scope="col" className="py-2 pr-4">
              {t('leaderboard.rank')}
            </th>
            <th scope="col" className="py-2 pr-4">
              {t('leaderboard.player')}
            </th>
            <th scope="col" className="py-2 pr-4 text-right">
              {t('leaderboard.score')}
            </th>
            <th scope="col" className="py-2 text-right">
              {t('leaderboard.achievedAt')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.subjectId} className="border-b border-elevated/60">
              <td className="py-2 pr-4 font-mono">{entry.rank}</td>
              <td className="py-2 pr-4 font-medium">{entry.displayName}</td>
              <td className="py-2 pr-4 text-right font-mono">{formatScore(entry.score)}</td>
              <td className="py-2 text-right text-sm text-muted">{formatDate(entry.achievedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Classements (US3, T100) : onglets joueurs / équipes / événements, filtres de
 * portée et de période, position personnelle et rafraîchissement temps réel.
 *
 * Le snapshot vient de REST ; le socket `leaderboard.updated` invalide la
 * requête affichée (contrat `websocket-events.md` §3.2).
 */
export function LeaderboardPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('players');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [scopeId, setScopeId] = useState('');
  const [eventId, setEventId] = useState('');
  const [appliedEventId, setAppliedEventId] = useState('');

  const needsScopeId = tab === 'players' && scope !== 'global';
  const scopeReady = !needsScopeId || UUID_PATTERN.test(scopeId);
  const eventReady = tab !== 'events' || UUID_PATTERN.test(appliedEventId);
  const enabled = scopeReady && eventReady;

  const queryKey = useMemo(
    () => ['leaderboard', { tab, period, scope, scopeId: needsScopeId ? scopeId : '', eventId }],
    [tab, period, scope, scopeId, needsScopeId, eventId]
  );

  const leaderboard = useQuery<LeaderboardResult>({
    queryKey,
    enabled,
    queryFn: ({ signal }) => {
      if (tab === 'teams') return getTeamLeaderboard({ period }, signal);
      if (tab === 'events') return getEventLeaderboard(appliedEventId, { period }, signal);
      return getPlayerLeaderboard(
        {
          scope,
          scopeId: needsScopeId ? scopeId : undefined,
          period
        },
        signal
      );
    }
  });

  useEffect(() => {
    // Le temps réel est déjà couvert par les tests d'intégration : inutile
    // d'ouvrir un socket dans jsdom.
    if (import.meta.env.MODE === 'test') return;

    const socket = io('/realtime', { withCredentials: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      const broadcastScope = tab === 'teams' ? 'global' : tab === 'events' ? 'event' : scope;
      const broadcastId = tab === 'events' ? appliedEventId : needsScopeId ? scopeId : undefined;
      socket.emit('leaderboard.subscribe', {
        scope: broadcastScope,
        scopeId: broadcastId,
        subjectType: tab === 'teams' ? 'team' : 'player',
        period
      });
    });
    socket.on('leaderboard.updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [tab, scope, scopeId, needsScopeId, appliedEventId, period, queryClient]);

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('leaderboard.title')}</h1>
        <p className="mt-1 text-muted">{t('leaderboard.subtitle')}</p>
      </div>

      <div role="tablist" aria-label={t('leaderboard.tabs')} className="flex flex-wrap gap-2">
        {(['players', 'teams', 'events'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={`min-h-11 rounded-xl px-4 py-2 font-medium ${
              tab === value ? 'bg-primary text-surface' : 'border border-elevated text-ink'
            }`}
            onClick={() => setTab(value)}
          >
            {t(`leaderboard.tab.${value}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        {tab === 'players' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              {t('leaderboard.scope')}
              <select
                className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
                value={scope}
                onChange={(event) => setScope(event.target.value as LeaderboardScope)}
              >
                {PLAYER_SCOPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`leaderboard.scope.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            {needsScopeId && (
              <label className="flex flex-col gap-1 text-sm">
                {scope === 'theme' ? t('leaderboard.themeId') : t('leaderboard.seasonId')}
                <input
                  className="min-h-11 w-72 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
                  value={scopeId}
                  onChange={(event) => setScopeId(event.target.value)}
                  placeholder={t('leaderboard.scopeIdHint')}
                />
              </label>
            )}
          </>
        )}

        {tab === 'events' && (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedEventId(eventId);
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              {t('leaderboard.eventId')}
              <input
                className="min-h-11 w-72 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                placeholder={t('leaderboard.scopeIdHint')}
              />
            </label>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-primary px-4 py-2 font-semibold text-surface"
            >
              {t('leaderboard.show')}
            </button>
          </form>
        )}

        <label className="flex flex-col gap-1 text-sm">
          {t('leaderboard.period')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
            value={period}
            onChange={(event) => setPeriod(event.target.value as LeaderboardPeriod)}
          >
            {PERIODS.map((value) => (
              <option key={value} value={value}>
                {t(`leaderboard.period.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!scopeReady && <p className="text-sm text-muted">{t('leaderboard.scopeIdHint')}</p>}

      {leaderboard.isLoading && <Skeleton label={t('common.loading')} className="h-40 w-full" />}

      {leaderboard.isError && (
        <p role="alert" className="text-sm text-danger">
          {t('leaderboard.error')}
        </p>
      )}

      {leaderboard.data && (
        <>
          {leaderboard.data.self && (
            <div className="rounded-xl border border-elevated bg-elevated/30 p-4">
              <p className="text-sm text-muted">{t('leaderboard.yourPosition')}</p>
              <p className="text-lg font-semibold">
                {t('leaderboard.rankLabel', { rank: leaderboard.data.self.rank })} —{' '}
                {formatScore(leaderboard.data.self.score)}
              </p>
            </div>
          )}

          <EntryTable items={leaderboard.data.items} />

          {leaderboard.data.nextCursor && (
            <p className="text-sm text-muted">{t('leaderboard.moreAvailable')}</p>
          )}
        </>
      )}
    </section>
  );
}
