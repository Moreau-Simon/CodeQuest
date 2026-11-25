import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { getEvents, joinEvent, type Event } from '../../services/events';
import { formatCountdown, formatInTimezone, serverOffset } from './countdown';

/** US9 (T172) : liste des événements, fuseau affiché et compte à rebours serveur. */
export function EventsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const events = useQuery({ queryKey: ['events'], queryFn: ({ signal }) => getEvents(signal) });

  const joining = useMutation({
    mutationFn: (eventId: string) => joinEvent(eventId),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  function renderEvent(event: Event): JSX.Element {
    const offset = serverOffset(event);
    const open = event.status === 'open';

    return (
      <li key={event.id} className="rounded-xl border border-elevated bg-surface p-4">
        <h2 className="text-xl font-semibold">{event.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {t('event.window')} :{' '}
          <time dateTime={event.startsAt}>{formatInTimezone(event.startsAt, event.timezone)}</time>
          {' → '}
          <time dateTime={event.endsAt}>{formatInTimezone(event.endsAt, event.timezone)}</time>
        </p>
        <p className="text-sm text-muted">
          {t('event.timezone')} : {event.timezone}
        </p>
        <p className="mt-2 font-medium">
          {open
            ? `${t('event.endsIn')} : ${formatCountdown(event.endsAt, offset)}`
            : t('event.closed')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Link to={`/events/${event.id}`} className="text-sm font-semibold">
            {t('event.details')}
          </Link>
          <Link to={`/events/${event.id}/results`} className="text-sm font-semibold">
            {t('event.results')}
          </Link>
          {open && !event.joined ? (
            <Button size="sm" loading={joining.isPending} onClick={() => joining.mutate(event.id)}>
              {t('event.join')}
            </Button>
          ) : null}
          {event.joined ? <span className="text-sm text-muted">{t('event.joined')}</span> : null}
        </div>
      </li>
    );
  }

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold">{t('event.title')}</h1>
        <p className="mt-2 text-muted">{t('event.subtitle')}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {events.isPending ? <Skeleton label={t('common.loading')} className="h-24 w-full" /> : null}
      {events.data?.length === 0 ? <p className="text-muted">{t('event.empty')}</p> : null}
      {events.data && events.data.length > 0 ? (
        <ul className="flex flex-col gap-4">{events.data.map(renderEvent)}</ul>
      ) : null}
    </section>
  );
}
