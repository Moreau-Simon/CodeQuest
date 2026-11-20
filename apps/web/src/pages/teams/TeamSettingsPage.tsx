import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import {
  getContributions,
  getTeam,
  inviteMember,
  leaveTeam,
  transferCaptain,
  type TeamInvitation
} from '../../services/teams';
import { useSessionStore } from '../../stores/session';

/** US8 (FR-055 à FR-060) : invitations, capitainerie et contributions d'une équipe. */
export function TeamSettingsPage(): JSX.Element {
  const { teamId = '' } = useParams<{ teamId: string }>();
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const [pseudonym, setPseudonym] = useState('');
  const [invitation, setInvitation] = useState<TeamInvitation | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
  };

  const team = useQuery({ queryKey: ['team', teamId], queryFn: ({ signal }) => getTeam(teamId, signal) });
  const contributions = useQuery({
    queryKey: ['team', teamId, 'contributions'],
    queryFn: ({ signal }) => getContributions(teamId, signal)
  });

  const invite = useMutation({
    mutationFn: () => inviteMember(teamId, { pseudonym: pseudonym || undefined }),
    onSuccess: (result) => {
      setInvitation(result);
      setError(null);
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  const transfer = useMutation({
    mutationFn: () => transferCaptain(teamId, transferTo),
    onSuccess: () => {
      setTransferTo('');
      setError(null);
      invalidate();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  const leave = useMutation({
    mutationFn: () => leaveTeam(teamId, user?.id ?? ''),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (cause) => setError(cause instanceof ApiError ? cause.message : t('common.error'))
  });

  if (team.isPending) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <Skeleton label={t('common.loading')} className="h-48 w-full" />
      </section>
    );
  }

  if (team.isError || !team.data) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('common.error')}</h1>
        <Link to="/teams" className="mt-4 inline-block">
          {t('team.back')}
        </Link>
      </section>
    );
  }

  const current = team.data;
  const isCaptain = current.captainId === user?.id;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-16">
      <header>
        <Link to="/teams" className="text-sm">
          {t('team.back')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">
          {current.name} <span className="text-lg text-muted">[{current.tag}]</span>
        </h1>
        <p className="mt-2 text-sm text-muted">{t('team.collabHint')}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('team.members')}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {current.members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{member.pseudonym}</span>
              {member.userId === current.captainId ? (
                <span className="rounded-full bg-elevated px-2 py-1 text-xs">{t('team.captain')}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <Button className="mt-4" variant="ghost" onClick={() => leave.mutate()} loading={leave.isPending}>
          {t('team.leave')}
        </Button>
      </section>

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('team.inviteTitle')}</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate();
          }}
        >
          <label className="flex flex-1 flex-col gap-1 text-sm">
            {t('team.invitePseudonym')}
            <Input value={pseudonym} onChange={(event) => setPseudonym(event.target.value)} />
          </label>
          <Button type="submit" loading={invite.isPending}>
            {t('team.invite')}
          </Button>
        </form>
        {invitation ? (
          <dl className="mt-4 grid gap-2 break-all text-sm">
            <div>
              <dt className="text-muted">{t('team.inviteToken')} : </dt>
              <dd className="font-mono">{invitation.token}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('team.inviteUrl')} : </dt>
              <dd className="font-mono">{invitation.inviteUrl}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      {isCaptain ? (
        <section className="rounded-xl border border-elevated p-4">
          <h2 className="text-xl font-semibold">{t('team.transferTitle')}</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              {t('team.members')}
              <select
                className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
              >
                <option value="">—</option>
                {current.members
                  .filter((member) => member.userId !== current.captainId)
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.pseudonym}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              onClick={() => transfer.mutate()}
              loading={transfer.isPending}
              disabled={!transferTo}
            >
              {t('team.transfer')}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('team.contributionsTitle')}</h2>
        {contributions.isPending ? (
          <Skeleton label={t('common.loading')} className="mt-4 h-20 w-full" />
        ) : contributions.data?.length ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="text-left">
                  {t('team.contribution.player')}
                </th>
                <th scope="col">{t('team.contribution.keptLines')}</th>
                <th scope="col">{t('team.contribution.successes')}</th>
                <th scope="col">{t('team.contribution.assistance')}</th>
                <th scope="col">{t('team.contribution.coefficient')}</th>
                <th scope="col">{t('team.contribution.score')}</th>
              </tr>
            </thead>
            <tbody>
              {contributions.data.map((row) => (
                <tr key={row.userId} className="border-t border-elevated text-center">
                  <td className="text-left">
                    {current.members.find((member) => member.userId === row.userId)?.pseudonym ??
                      row.userId.slice(0, 8)}
                  </td>
                  <td>{row.keptLines}</td>
                  <td>{row.successes}</td>
                  <td>{row.assistance}</td>
                  <td>{row.coefficient}</td>
                  <td className="font-semibold">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-muted">{t('common.noData')}</p>
        )}
      </section>
    </section>
  );
}
