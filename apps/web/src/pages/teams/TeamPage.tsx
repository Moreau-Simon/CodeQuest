import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Input, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { createTeam, getTeams, joinTeam, type Team } from '../../services/teams';

/** US8 (FR-055 à FR-058) : liste des équipes, création et adhésion par jeton. */
export function TeamPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [joinId, setJoinId] = useState('');
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [error, setError] = useState<string | null>(null);

  const teams = useQuery({ queryKey: ['teams'], queryFn: ({ signal }) => getTeams(signal) });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  const creation = useMutation({
    mutationFn: () => createTeam({ name, tag, description: description || undefined }),
    onSuccess: () => {
      setName('');
      setTag('');
      setDescription('');
      setError(null);
      invalidate();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  const joining = useMutation({
    mutationFn: () => joinTeam(joinId, token),
    onSuccess: () => {
      setJoinId('');
      setToken('');
      setError(null);
      invalidate();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  function renderTeam(team: Team): JSX.Element {
    return (
      <li key={team.id} className="rounded-xl border border-elevated bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">
              {team.name} <span className="text-sm text-muted">[{team.tag}]</span>
            </h3>
            <p className="text-sm text-muted">
              {team.members.length} {t('team.members').toLowerCase()} · {t('team.captain')} :{' '}
              {team.members.find((member) => member.userId === team.captainId)?.pseudonym ?? '—'}
            </p>
          </div>
          <Link to={`/teams/${team.id}`} className="text-sm font-semibold">
            {t('team.settings')}
          </Link>
        </div>
        {team.description ? <p className="mt-2 text-sm">{team.description}</p> : null}
      </li>
    );
  }

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold">{t('team.title')}</h1>
        <p className="mt-2 text-muted">{t('team.subtitle')}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('team.createTitle')}</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            creation.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t('team.name')}
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('team.tag')}
            <Input value={tag} onChange={(event) => setTag(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('team.description')}
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="flex items-end">
            <Button type="submit" loading={creation.isPending}>
              {creation.isPending ? t('team.creating') : t('team.create')}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('team.joinTitle')}</h2>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            joining.mutate();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t('team.joinTeamId')}
            <Input value={joinId} onChange={(event) => setJoinId(event.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t('team.token')}
            <Input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <div className="flex items-end">
            <Button type="submit" loading={joining.isPending}>
              {joining.isPending ? t('team.joining') : t('team.join')}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold">{t('team.title')}</h2>
        {teams.isPending ? (
          <Skeleton label={t('common.loading')} className="mt-4 h-24 w-full" />
        ) : teams.isError ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {t('team.error')}
          </p>
        ) : teams.data?.length ? (
          <ul className="mt-4 flex flex-col gap-3">{teams.data.map(renderTeam)}</ul>
        ) : (
          <p className="mt-4 text-muted">{t('team.empty')}</p>
        )}
      </section>
    </section>
  );
}
