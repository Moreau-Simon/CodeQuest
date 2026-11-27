import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Skeleton } from '../../components/ui';
import { useBattleRoyale } from '../../hooks/useBattleRoyale';
import { t } from '../../i18n';
import { getEvents, getEventRounds } from '../../services/events';
import { useSessionStore } from '../../stores/session';
import { RoundBoard } from './BattleRoyalePage';

/**
 * US14 (T225, FR-099) : vue en lecture seule des joueurs éliminés.
 * Aucun contrôle de soumission n'est rendu : le refus est aussi appliqué côté
 * serveur par `AttemptService`.
 */
export function SpectatorView(): JSX.Element {
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
        <h1 className="text-3xl font-semibold">{t('battle.spectatorTitle')}</h1>
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
        <p role="status" className="mt-1 text-sm text-muted">
          {t('battle.spectatorTitle')} · {t('battle.readOnly')}
        </p>
      </header>
      <RoundBoard event={event} rounds={rounds.data ?? []} live={live} spectator />
    </section>
  );
}
