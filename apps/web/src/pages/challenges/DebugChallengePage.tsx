import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { t } from '../../i18n';
import { useSubmissionVerdict } from '../../hooks/useSubmissionVerdict';
import { ApiError } from '../../services/api-client';
import {
  getChallenge,
  startAttempt,
  submitSolution,
  type ChallengeAttempt
} from '../../services/challenges';
import { CodeEditor } from '../../components/editor/CodeEditor';
import { Button, Skeleton } from '../../components/ui';
import { selectIsAuthenticated, useSessionStore } from '../../stores/session';
import { modifiedLineNumbers } from './debug-diff';

function formatRemaining(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Défi de débogage (T147, FR-037/038, A5) : éditeur préchargé avec le code
 * bogué, tentative explicite, compteur et surlignage des lignes modifiées.
 * Aucun bug, test caché ni correction n'est révélé par l'interface.
 */
export function DebugChallengePage(): JSX.Element {
  const { challengeId = '' } = useParams<{ challengeId: string }>();
  const authenticated = useSessionStore(selectIsAuthenticated);
  const user = useSessionStore((state) => state.user);

  const detail = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: ({ signal }) => getChallenge(challengeId, signal),
    enabled: challengeId.length > 0
  });

  const [language, setLanguage] = useState<'python' | 'javascript'>('python');
  const [code, setCode] = useState('');
  const [attempt, setAttempt] = useState<ChallengeAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const data = detail.data;
    if (!data?.buggyCode) return;
    setCode(data.buggyCode);
    setLanguage(
      (data.languages[0] as 'python' | 'javascript') ?? user?.preferredLanguage ?? 'python'
    );
  }, [detail.data, user?.preferredLanguage]);

  useEffect(() => {
    if (!attempt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  const modified = useMemo(
    () => modifiedLineNumbers(detail.data?.buggyCode ?? '', code),
    [detail.data?.buggyCode, code]
  );
  const limit = detail.data?.maxModifiedLines ?? null;
  const overLimit = limit !== null && modified.length > limit;
  const remainingMs = attempt ? Math.max(0, new Date(attempt.expiredAt).getTime() - now) : null;
  const expired = attempt !== null && remainingMs === 0;

  const verdict = useSubmissionVerdict(submissionId);

  const start = useMutation({
    mutationFn: () => startAttempt(challengeId),
    onSuccess: (created) => {
      setAttempt(created);
      setNow(Date.now());
      setError(null);
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError && cause.code === 'ATTEMPT_ALREADY_STARTED'
          ? t('debug.alreadyStarted')
          : cause instanceof ApiError
            ? cause.message
            : t('common.error')
      );
    }
  });

  const submit = useMutation({
    mutationFn: () =>
      submitSolution(
        challengeId,
        { language, code, ...(attempt ? { attemptId: attempt.id } : {}) },
        crypto.randomUUID()
      ),
    onSuccess: (submission) => {
      setError(null);
      setSubmissionId(submission.id);
    },
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : t('common.error'));
    }
  });

  if (detail.isPending) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-16">
        <Skeleton label={t('common.loading')} className="h-64 w-full" />
      </section>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('common.error')}</h1>
        <Link to="/challenges" className="mt-4 inline-block">
          {t('challenge.backToList')}
        </Link>
      </section>
    );
  }

  const challenge = detail.data;
  const canSubmit = authenticated && user?.emailVerified === true && attempt !== null && !expired;

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/challenges" className="text-sm">
          {t('challenge.backToList')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{challenge.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {challenge.theme} · {t('challenge.type.debugging')} ·{' '}
          {t('challenge.difficulty', { value: challenge.difficulty })}
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-xl bg-elevated p-4">
        <h2 className="text-xl font-semibold">{t('challenge.statement')}</h2>
        <p className="whitespace-pre-wrap">{challenge.statement}</p>
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-elevated p-4">
        <Button
          onClick={() => start.mutate()}
          loading={start.isPending}
          disabled={attempt !== null || !authenticated}
        >
          {attempt ? t('debug.started') : t('debug.start')}
        </Button>
        {remainingMs !== null ? (
          <p role="timer" aria-live="off" className="font-mono text-sm">
            {t('debug.remaining')} : {expired ? t('debug.expired') : formatRemaining(remainingMs)}
          </p>
        ) : (
          <p className="text-sm text-muted">{t('debug.needAttempt')}</p>
        )}
        {attempt && start.isError ? (
          <p role="status" className="text-sm text-danger">
            {t('debug.alreadyStarted')}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          <CodeEditor
            value={code}
            language={language}
            onChange={setCode}
            label={t('challenge.language')}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-sm">
              {t('challenge.language')}
              <select
                className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
                value={language}
                onChange={(event) => {
                  const next = event.target.value as 'python' | 'javascript';
                  setLanguage(next);
                  setCode(challenge.buggyCode ?? '');
                }}
              >
                {challenge.languages.map((value) => (
                  <option key={value} value={value}>
                    {value === 'python'
                      ? t('settings.languagePython')
                      : t('settings.languageJavascript')}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => submit.mutate()}
              loading={submit.isPending}
              disabled={!canSubmit}
            >
              {t('challenge.submit')}
            </Button>
          </div>
        </div>

        <aside
          className="flex flex-col gap-3 rounded-xl border border-elevated p-4"
          aria-live="polite"
        >
          <h2 className="text-lg font-semibold">{t('debug.modifiedLines')}</h2>
          <p data-testid="modified-count" className="text-sm">
            {t('debug.modifiedCount', { value: modified.length })}
          </p>
          {limit !== null ? (
            <p className={`text-sm ${overLimit ? 'text-danger' : 'text-muted'}`}>
              {overLimit ? t('debug.limitExceeded') : t('debug.limit', { value: limit })}
            </p>
          ) : null}
          {modified.length === 0 ? (
            <p className="text-sm text-muted">{t('debug.noChanges')}</p>
          ) : (
            <ol className="flex max-h-96 flex-col gap-1 overflow-auto font-mono text-xs">
              {code.split('\n').map((line, index) => (
                <li
                  key={index}
                  data-testid={modified.includes(index + 1) ? 'modified-line' : undefined}
                  className={`flex gap-2 rounded px-2 py-1 ${
                    modified.includes(index + 1) ? 'border border-danger text-danger' : 'text-muted'
                  }`}
                >
                  <span className="w-8 shrink-0 text-right">{index + 1}</span>
                  <code className="whitespace-pre-wrap">{line || ' '}</code>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      {!authenticated ? (
        <p role="status" className="text-sm">
          <Link to="/login">{t('challenge.loginToSubmit')}</Link>
        </p>
      ) : user?.emailVerified !== true ? (
        <p role="status" className="text-sm text-muted">
          {t('challenge.emailToSubmit')}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {submissionId ? (
        <section aria-live="polite" className="rounded-xl border border-elevated p-4">
          <h2 className="text-xl font-semibold">{t('challenge.verdictTitle')}</h2>
          {verdict.submission ? (
            <p className="mt-2 text-sm">
              {t(`challenge.status.${verdict.submission.status}`)} ·{' '}
              {verdict.submission.score ?? t('challenge.verdictNoScore')}
            </p>
          ) : (
            <p className="mt-2 text-sm">{t('challenge.verdictPending')}</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
