import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { t } from '../../i18n';
import { listSessions, revokeAllSessions, revokeSession } from '../../services/auth';
import { ApiError } from '../../services/api-client';
import { Button, Skeleton } from '../../components/ui';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

/**
 * Sessions actives (T062) : appareil, dates, préfixe IP, révocation unitaire
 * et globale. La session courante est signalée et ne peut pas être révoquée
 * seule depuis cet écran (la déconnexion le fait).
 */
export function SessionsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const sessions = useQuery({ queryKey: ['me', 'sessions'], queryFn: () => listSessions() });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });

  const revokeOne = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: invalidate,
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  const revokeAll = useMutation({
    mutationFn: () => revokeAllSessions(),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ['session', 'me'] });
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('settings.sessionsTitle')}</h1>
        <p className="mt-1 text-muted">{t('settings.sessionsSubtitle')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {sessions.isPending ? (
        <Skeleton label={t('common.loading')} className="h-32 w-full" />
      ) : sessions.isError ? (
        <p role="alert">{t('common.error')}</p>
      ) : sessions.data.length === 0 ? (
        <p>{t('settings.noSessions')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-3 rounded-xl bg-elevated p-4 sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <p className="font-semibold">
                  {session.userAgent ?? t('settings.unknownDevice')}
                  {session.current ? (
                    <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-surface">
                      {t('settings.sessionCurrent')}
                    </span>
                  ) : null}
                </p>
                <dl className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-3">
                  <div>
                    <dt className="inline">{t('settings.sessionIp')} : </dt>
                    <dd className="inline">{session.ipPrefix ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t('settings.sessionCreated')} : </dt>
                    <dd className="inline">{formatDate(session.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline">{t('settings.sessionLastUsed')} : </dt>
                    <dd className="inline">{formatDate(session.lastUsedAt)}</dd>
                  </div>
                </dl>
              </div>

              {!session.current ? (
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`${t('settings.revoke')} : ${session.userAgent ?? session.id}`}
                  loading={revokeOne.isPending && revokeOne.variables === session.id}
                  onClick={() => revokeOne.mutate(session.id)}
                >
                  {t('settings.revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" loading={revokeAll.isPending} onClick={() => revokeAll.mutate()}>
        {t('settings.revokeAll')}
      </Button>
    </section>
  );
}
