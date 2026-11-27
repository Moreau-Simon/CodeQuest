import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Skeleton } from '../../components/ui';
import { useBattleRoyale, type BattleLiveState } from '../../hooks/useBattleRoyale';
import { t } from '../../i18n';
import { getEvents, getEventRounds, type BattleRound, type Event } from '../../services/events';
import { useSessionStore } from '../../stores/session';
import { formatCountdown, formatInTimezone, serverOffset } from './countdown';

export interface RoundBoardProps {
  event: Event;
  rounds: BattleRound[];
  live: BattleLiveState;
  spectator?: boolean;
}

/**
 * US14 (T225) : tableau de manche partagé entre l'arène et la vue spectateur.
 * L'horloge serveur fait foi ; le socket ne fait que compléter le REST.
 */
export function RoundBoard({ event, rounds, live, spectator = false }: RoundBoardProps): JSX.Element {
  const fallbackNumber = rounds.reduce((max, round) => Math.max(max, round.roundNumber), 0);
  const number = live.active?.roundNumber ?? live.closed?.roundNumber ?? fallbackNumber;
  const current = rounds.find((round) => round.roundNumber === number) ?? rounds[0];
  const status =
    live.active?.roundNumber === number
      ? 'open'
      : live.closed?.roundNumber === number
        ? 'closed'
        : (current?.status ?? 'scheduled');
  const endsAt = live.active?.endsAt ?? current?.endsAt ?? event.endsAt;
  const challengeId = live.active?.challengeId ?? current?.challengeId ?? event.challengeIds[0] ?? '';
  const results = live.closed?.results ?? current?.results ?? [];

  return (
    <section className="rounded-xl border border-elevated p-4" aria-label={t('battle.title')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('battle.round', { round: number || 1 })}</h2>
        <span role="status" className="text-sm font-semibold">
          {t(`battle.status.${status}`)}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {t('battle.endsIn')} : {formatCountdown(endsAt, serverOffset(event))}
        {' · '}
        <time dateTime={endsAt}>{formatInTimezone(endsAt, event.timezone)}</time>
      </p>
      <p className="mt-1 text-sm">
        {t('battle.challenge')} :{' '}
        <Link to={`/challenges/${encodeURIComponent(challengeId)}`} className="font-semibold">
          {challengeId.slice(0, 8)}
        </Link>
      </p>
      {live.warningMs !== null ? (
        <p role="alert" className="mt-2 text-sm font-medium text-warning">
          {t('battle.warning')}
        </p>
      ) : null}
      {live.eliminated ? (
        <p role="status" className="mt-2 text-sm font-medium text-danger">
          {t('battle.eliminated')} ·{' '}
          <Link to={`/events/${event.id}/spectate`} className="font-semibold">
            {t('battle.spectate')}
          </Link>
        </p>
      ) : null}
      {!spectator && !live.eliminated && !live.active ? (
        <p className="mt-2 text-sm text-muted">{t('battle.waiting')}</p>
      ) : null}
      {live.winner ? (
        <p role="status" className="mt-2 font-semibold">
          {t('battle.winner', { name: live.winner.displayName })}
        </p>
      ) : null}

      <h3 className="mt-4 text-lg font-semibold">{t('battle.results')}</h3>
      {results.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{t('battle.waiting')}</p>
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col">{t('event.player')}</th>
              <th scope="col">{t('battle.score')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.subjectId}>
                <td>{result.subjectId}</td>
                <td>{result.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Arène du participant : manches synchronisées et diffusion temps réel. */
export function BattleRoyalePage(): JSX.Element {
  const { eventId = '' } = useParams();
  const selfId = useSessionStore((state) => state.user?.id ?? null);
  const events = useQuery({ queryKey: ['events'], queryFn: ({ signal }) => getEvents(signal) });
  const rounds = useQuery({
    queryKey: ['battle-rounds', eventId],
    queryFn: ({ signal }) => getEventRounds(eventId, signal)
  });
  const live = useBattleRoyale(eventId, selfId);
  const event = events.data?.find((candidate) => candidate.id === eventId);

  if (events.isPending || rounds.isPending) {
    return <Skeleton label={t('common.loading')} className="mx-auto mt-16 h-48 max-w-3xl" />;
  }
  if (!event) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('battle.title')}</h1>
        <p className="mt-2 text-muted">{t('event.empty')}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <Link to="/events" className="text-sm font-semibold">
        ← {t('battle.back')}
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">{event.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('event.serverClock')} : {formatInTimezone(event.serverNow, 'UTC')}
        </p>
      </header>
      <RoundBoard event={event} rounds={rounds.data ?? []} live={live} />
    </section>
  );
}
