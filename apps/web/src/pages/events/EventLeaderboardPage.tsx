import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { getEventResults, getEventSolution } from '../../services/events';

/** US9 (T173) : classement dédié, publication après clôture et corrigés débloqués. */
export function EventLeaderboardPage(): JSX.Element {
  const { eventId = '' } = useParams();
  const [activeSolution, setActiveSolution] = useState<string | null>(null);

  const results = useQuery({
    queryKey: ['event-results', eventId],
    queryFn: ({ signal }) => getEventResults(eventId, signal)
  });
  const solution = useQuery({
    queryKey: ['event-solution', eventId, activeSolution],
    queryFn: ({ signal }) => getEventSolution(eventId, activeSolution ?? '', signal),
    enabled: activeSolution !== null
  });

  if (results.isPending) {
    return <Skeleton label={t('common.loading')} className="mx-auto mt-16 h-48 max-w-3xl" />;
  }
  if (!results.data) {
    const closed = results.error instanceof ApiError && results.error.code === 'EVENT_NOT_CLOSED';
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('event.resultsTitle')}</h1>
        <p role="status" className="mt-4 text-muted">
          {closed ? t('event.notClosed') : t('common.error')}
        </p>
      </section>
    );
  }

  const data = results.data;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <Link to="/events" className="text-sm font-semibold">
        ← {t('event.back')}
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">{t('event.resultsTitle')}</h1>
        <p className="mt-1 text-sm text-muted">
          {data.status} · {t('event.published')}
        </p>
      </header>

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('event.rewards')}</h2>
        <p className="mt-1 font-mono text-sm">{JSON.stringify(data.rewards)}</p>
      </section>

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('leaderboard.title')}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t('leaderboard.title')}</caption>
            <thead>
              <tr className="border-b border-elevated text-sm text-muted">
                <th scope="col" className="py-2 pr-4">
                  {t('event.rank')}
                </th>
                <th scope="col" className="py-2 pr-4">
                  {t('event.player')}
                </th>
                <th scope="col" className="py-2 text-right">
                  {t('event.score')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.leaderboard.items.map((item) => (
                <tr key={item.subjectId} className="border-b border-elevated/60">
                  <td className="py-2 pr-4 font-mono">{item.rank}</td>
                  <td className="py-2 pr-4 font-medium">{item.displayName}</td>
                  <td className="py-2 text-right font-mono">{item.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('event.solutions')}</h2>
        <ul className="mt-2 flex flex-col gap-3">
          {data.solutions.map((entry) => (
            <li key={entry.challengeId} className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm">{entry.challengeId.slice(0, 8)}</span>
              {entry.unlocked ? (
                <Button size="sm" variant="secondary" onClick={() => setActiveSolution(entry.challengeId)}>
                  {t('event.showSolution')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {solution.isPending ? <Skeleton label={t('common.loading')} className="mt-3 h-16 w-full" /> : null}
        {solution.data ? <pre className="mt-3 overflow-x-auto rounded bg-elevated p-3 text-sm">{solution.data.solution}</pre> : null}
        {solution.error ? <p role="alert" className="mt-3 text-sm text-danger">{t('common.error')}</p> : null}
      </section>
    </section>
  );
}
