import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { getBosses, getMyHealth, submitBossPhase, type Boss } from '../../services/bosses';
import { useSessionStore } from '../../stores/session';
import { formatCountdown } from '../events/countdown';
import { HealthBar } from './HealthBar';

/** Distingue une session expirée d'une panne de chargement. */
export function bossLoadError(error: unknown): { message: string; login: boolean } {
  if (error instanceof ApiError && error.status === 401) {
    return { message: t('common.loginRequired'), login: true };
  }
  return { message: t('boss.error.load'), login: false };
}

function submissionError(error: unknown): string {
  if (!(error instanceof ApiError)) return t('boss.error.default');
  switch (error.code) {
    case 'BOSS_KO':
      return t('boss.error.KO');
    case 'PHASE_NOT_REACHED':
      return t('boss.error.PHASE_NOT_REACHED');
    case 'BOSS_ALREADY_DEFEATED':
      return t('boss.error.ALREADY_DEFEATED');
    default:
      return t('boss.error.default');
  }
}

interface BossCardProps {
  boss: Boss;
  /** Verrouillage global : un joueur en KO ne peut pas soumettre. */
  ko: boolean;
  animated: boolean;
}

function BossCard({ boss, ko, animated }: BossCardProps): JSX.Element {
  const queryClient = useQueryClient();
  const preferredLanguage = useSessionStore((state) => state.user?.preferredLanguage ?? 'python');
  const [language, setLanguage] = useState<'python' | 'javascript'>(preferredLanguage);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(() => boss.phases.find((phase) => !phase.completed), [boss.phases]);

  const submit = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('Aucune phase à affronter');
      return submitBossPhase(boss.id, current.id, { language, code });
    },
    onSuccess: () => {
      setError(null);
      setNotice(t('boss.submitted'));
      setCode('');
      void queryClient.invalidateQueries({ queryKey: ['bosses'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'health'] });
    },
    onError: (cause: unknown) => {
      setNotice(null);
      setError(submissionError(cause));
    }
  });

  return (
    <li className="rounded-xl border border-elevated bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">{boss.name}</h2>
        {boss.defeated ? (
          <span className="rounded-full bg-elevated px-3 py-1 text-sm">{t('boss.defeated')}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {t('boss.chapter')} : {boss.chapter}
      </p>

      <div className="mt-4">
        <HealthBar
          label={t('boss.hp')}
          hp={boss.hpRemaining ?? boss.maxHp}
          maxHp={boss.maxHp}
          animated={animated}
        />
      </div>

      <h3 className="mt-5 font-semibold">{t('boss.phases')}</h3>
      <ol className="mt-2 flex flex-col gap-1 text-sm">
        {boss.phases.map((phase) => (
          <li key={phase.id} className="flex items-center gap-3">
            <span>{t('boss.phase', { order: phase.order })}</span>
            {phase.completed ? (
              <span className="text-muted">{t('boss.completed')}</span>
            ) : phase.id === current?.id ? (
              <span>{t('boss.current')}</span>
            ) : (
              <span className="text-muted">{t('boss.locked')}</span>
            )}
          </li>
        ))}
      </ol>

      {current && !boss.defeated ? (
        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <label htmlFor={`boss-language-${boss.id}`} className="text-sm font-medium">
            {t('boss.language')}
          </label>
          <select
            id={`boss-language-${boss.id}`}
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'python' | 'javascript')}
            className="rounded-xl border border-elevated bg-surface p-2"
          >
            <option value="python">{t('settings.languagePython')}</option>
            <option value="javascript">{t('settings.languageJavascript')}</option>
          </select>
          <label htmlFor={`boss-code-${boss.id}`} className="text-sm font-medium">
            {t('boss.code')}
          </label>
          <textarea
            id={`boss-code-${boss.id}`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            rows={6}
            className="rounded-xl border border-elevated bg-surface p-3 font-mono text-sm"
          />
          {error ? (
            <p role="alert" className="rounded-xl border border-danger p-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm">
              {notice}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={ko || code.trim().length === 0}
            loading={submit.isPending}
          >
            {t('boss.submit')}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** US10 (T184) : liste des boss, barre de PV serveur et compte à rebours de KO. */
export function BossPage(): JSX.Element {
  const health = useQuery({
    queryKey: ['me', 'health'],
    queryFn: ({ signal }) => getMyHealth(signal)
  });
  const bosses = useQuery({ queryKey: ['bosses'], queryFn: ({ signal }) => getBosses(signal) });
  const animated = !useSessionStore((state) => state.user?.preferences?.reducedMotion === true);

  const serverNow = health.data ? new Date(health.data.serverNow).getTime() : Date.now();
  const offset = health.data ? serverNow - Date.now() : 0;
  const koUntil = health.data?.koUntil ? new Date(health.data.koUntil).getTime() : null;
  const ko = koUntil !== null && koUntil > serverNow;
  const loadFailure = bosses.error ? bossLoadError(bosses.error) : health.error ? bossLoadError(health.error) : null;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <header>
        <h1 className="text-3xl font-semibold">{t('boss.title')}</h1>
        <p className="mt-2 text-muted">{t('boss.subtitle')}</p>
      </header>

      {loadFailure && (
        <p role="alert" className="rounded-lg bg-danger p-3 text-sm">
          {loadFailure.message}
          {loadFailure.login && (
            <>
              {' '}
              <Link to="/login" className="underline">
                {t('common.login')}
              </Link>
            </>
          )}
        </p>
      )}
      {health.isPending ? <Skeleton label={t('common.loading')} className="h-24 w-full" /> : null}
      {health.data ? (
        <div className="flex flex-col gap-2 rounded-xl border border-elevated bg-surface p-5">
          <HealthBar
            label={t('health.title')}
            hp={health.data.hp}
            maxHp={health.data.maxHp}
            animated={animated}
          />
          {ko && health.data.koUntil ? (
            <p role="status" className="text-sm text-danger">
              {t('health.ko', { countdown: formatCountdown(health.data.koUntil, offset) })}
            </p>
          ) : health.data.nextRegenAt ? (
            <p className="text-sm text-muted">
              {t('health.regen', { countdown: formatCountdown(health.data.nextRegenAt, offset) })}
            </p>
          ) : null}
        </div>
      ) : null}

      {bosses.isPending ? <Skeleton label={t('common.loading')} className="h-24 w-full" /> : null}
      {bosses.data?.length === 0 ? <p className="text-muted">{t('boss.empty')}</p> : null}
      {bosses.data && bosses.data.length > 0 ? (
        <ul className="flex flex-col gap-6">
          {bosses.data.map((boss) => (
            <BossCard key={boss.id} boss={boss} ko={ko} animated={animated} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
