import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { getEvents, startEvent } from '../../services/events';
import { formatCountdown, formatInTimezone, serverOffset } from './countdown';

/** US9 (T172) : détail, confirmation explicite et chrono calculé sur l'horloge serveur. */
export function EventDetailPage(): JSX.Element {
  const { eventId = '' } = useParams();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const events = useQuery({ queryKey: ['events'], queryFn: ({ signal }) => getEvents(signal) });
  const event = events.data?.find((candidate) => candidate.id === eventId);

  const starting = useMutation({
    mutationFn: () => startEvent(eventId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  const started = starting.isSuccess || event?.attemptConsumed === true;

  if (events.isPending) {
    return <Skeleton label={t('common.loading')} className="mx-auto mt-16 h-48 max-w-3xl" />;
  }
  if (!event) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('event.detailTitle')}</h1>
        <p className="mt-2 text-muted">{t('event.empty')}</p>
      </section>
    );
  }

  const offset = serverOffset(event);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <Link to="/events" className="text-sm font-semibold">
        ← {t('event.back')}
      </Link>
      <header>
        <h1 className="text-3xl font-semibold">{event.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {t('event.window')} :{' '}
          <time dateTime={event.startsAt}>{formatInTimezone(event.startsAt, event.timezone)}</time>
          {' → '}
          <time dateTime={event.endsAt}>{formatInTimezone(event.endsAt, event.timezone)}</time> ·{' '}
          {event.timezone}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t('event.serverClock')} : {formatInTimezone(event.serverNow, 'UTC')}
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('event.challenges')}</h2>
        <ul className="mt-2 flex flex-wrap gap-4">
          {event.challengeIds.map((challengeId) => (
            <li key={challengeId}>
              <Link to={`/challenges/${challengeId}`} className="text-sm font-semibold">
                {challengeId.slice(0, 8)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-elevated p-4">
        {started ? (
          <p role="status" className="font-medium">
            {t('event.attemptConsumed')}
          </p>
        ) : (
          <>
            <p className="font-medium">{t('event.attemptHint')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('event.endsIn')} : {formatCountdown(event.endsAt, offset)}
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(change) => setConfirmed(change.target.checked)}
                className="mt-1"
              />
              {t('event.confirmStart')}
            </label>
            <Button
              className="mt-4"
              disabled={!confirmed}
              loading={starting.isPending}
              onClick={() => starting.mutate()}
            >
              {t('event.startAttempt')}
            </Button>
          </>
        )}
      </section>

      <Link to={`/events/${eventId}/results`} className="text-sm font-semibold">
        {t('event.results')}
      </Link>
    </section>
  );
}
