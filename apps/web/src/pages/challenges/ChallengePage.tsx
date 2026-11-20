import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n';
import { useCollaborativeDoc } from '../../hooks/useCollaborativeDoc';
import { useSubmissionVerdict } from '../../hooks/useSubmissionVerdict';
import { ApiError } from '../../services/api-client';
import { getChallenge, submitSolution, type Submission } from '../../services/challenges';
import { CodeEditor } from '../../components/editor/CodeEditor';
import { Button, Skeleton } from '../../components/ui';
import { useSessionStore, selectIsAuthenticated } from '../../stores/session';

const DEFAULT_CODE: Record<'python' | 'javascript', string> = {
  python: 'def solve(values):\n    # Votre solution ici\n    return values\n',
  javascript: 'function solve(values) {\n  // Votre solution ici\n  return values;\n}\n'
};

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function formatCpu(value: number | null): string {
  return value === null ? '—' : `${value} ms`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

/**
 * Panneau de verdict (T088) : statut, score, tests, temps CPU médian et motif
 * filtré. Aucun test caché, aucune sortie attendue n'est jamais rendue.
 */
function VerdictPanel({
  submission,
  error
}: {
  submission: Submission | null;
  error: string | null;
}): JSX.Element {
  if (error) {
    return (
      <section aria-live="polite" className="rounded-xl border border-elevated p-4">
        <h2 className="text-xl font-semibold">{t('challenge.verdictTitle')}</h2>
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      </section>
    );
  }

  if (!submission) return <></>;

  const pending = submission.status === 'pending' || submission.status === 'running';

  return (
    <section aria-live="polite" className="rounded-xl border border-elevated p-4">
      <h2 className="text-xl font-semibold">{t('challenge.verdictTitle')}</h2>
      <p className="mt-1 text-sm text-muted">
        {t(`challenge.status.${submission.status}`)} · {formatDate(submission.createdAt)}
      </p>

      {pending ? (
        <p className="mt-3">{t('challenge.verdictPending')}</p>
      ) : (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted">{t('challenge.verdictScore')} : </dt>
            <dd className="inline font-semibold">
              {submission.score === null ? t('challenge.verdictNoScore') : submission.score}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted">{t('challenge.verdictTests')} : </dt>
            <dd className="inline">
              {submission.testsPassed ?? 0}/{submission.testsTotal ?? 0}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted">{t('challenge.verdictCpu')} : </dt>
            <dd className="inline">{formatCpu(submission.cpuTimeMedianMs)}</dd>
          </div>
          {submission.verdictReason ? (
            <div className="sm:col-span-2">
              <dt className="inline text-muted">{t('challenge.verdictReason')} : </dt>
              <dd className="inline">{submission.verdictReason}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

/**
 * Défi (T088) : énoncé, éditeur et soumission. Le verdict arrive par Socket.IO
 * avec repli par interrogation ; un compte non confirmé peut lire l'énoncé mais
 * pas soumettre (FR-003).
 */
export function ChallengePage(): JSX.Element {
  const { challengeId = '' } = useParams<{ challengeId: string }>();
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get('teamId') ?? undefined;
  const authenticated = useSessionStore(selectIsAuthenticated);
  const user = useSessionStore((state) => state.user);

  const detail = useQuery({
    queryKey: ['challenge', challengeId],
    queryFn: ({ signal }) => getChallenge(challengeId, signal),
    enabled: challengeId.length > 0
  });

  const [language, setLanguage] = useState<'python' | 'javascript'>(
    user?.preferredLanguage ?? 'python'
  );
  const [code, setCode] = useState(DEFAULT_CODE[user?.preferredLanguage ?? 'python']);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail.data) return;
    if (!detail.data.languages.includes(language) && detail.data.languages[0]) {
      setLanguage(detail.data.languages[0] as 'python' | 'javascript');
    }
  }, [detail.data, language]);

  const verdict = useSubmissionVerdict(submissionId);
  const collaborative = useCollaborativeDoc({
    teamId,
    challengeId,
    initialCode: DEFAULT_CODE[language],
    enabled: Boolean(teamId) && authenticated
  });

  const submit = useMutation({
    mutationFn: () =>
      submitSolution(
        challengeId,
        { language, code: collaborative.doc ? collaborative.text : code, teamId },
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

  function changeLanguage(next: 'python' | 'javascript'): void {
    setLanguage(next);
    setCode(DEFAULT_CODE[next]);
  }

  if (detail.isPending) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <Skeleton label={t('common.loading')} className="h-64 w-full" />
      </section>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold">{t('common.error')}</h1>
        <Link to="/challenges" className="mt-4 inline-block">
          {t('challenge.backToList')}
        </Link>
      </section>
    );
  }

  const challenge = detail.data;
  const canSubmit =
    authenticated && user?.emailVerified === true && challenge.languages.includes(language);

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/challenges" className="text-sm">
          {t('challenge.backToList')}
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{challenge.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {challenge.theme} · {t(`challenge.type.${challenge.type}`)} ·{' '}
          {t('challenge.difficulty', { value: challenge.difficulty })}
        </p>
        {challenge.type === 'debugging' ? (
          <Link
            to={`/challenges/${challengeId}/debug`}
            className="mt-2 inline-block text-sm font-semibold"
          >
            {t('challenge.debugLink')}
          </Link>
        ) : null}
      </div>

      <section className="flex flex-col gap-2 rounded-xl bg-elevated p-4">
        <h2 className="text-xl font-semibold">{t('challenge.statement')}</h2>
        <p className="whitespace-pre-wrap">{challenge.statement}</p>
        <dl className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
          <div>
            <dt className="inline">{t('challenge.points')} : </dt>
            <dd className="inline">{challenge.basePoints}</dd>
          </div>
          <div>
            <dt className="inline">{t('challenge.perfBonus')} : </dt>
            <dd className="inline">{challenge.perfMax}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t('challenge.language')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
            value={language}
            onChange={(event) => changeLanguage(event.target.value as 'python' | 'javascript')}
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
        <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!canSubmit}>
          {submit.isPending ? t('challenge.submitting') : t('challenge.submit')}
        </Button>
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

      {collaborative.doc ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span data-testid="collab-status">
            {collaborative.connected ? t('collab.connected') : t('collab.disconnected')}
          </span>
          {collaborative.cursors.length > 0 ? (
            <ul data-testid="remote-cursors" className="flex flex-wrap gap-2">
              {collaborative.cursors.map((cursor) => (
                <li
                  key={cursor.userId}
                  data-testid="remote-cursor"
                  className="rounded-full bg-elevated px-2 py-1 text-xs"
                >
                  {t('collab.cursor', { line: cursor.line + 1, ch: cursor.ch + 1 })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <CodeEditor
        value={collaborative.doc ? collaborative.text : code}
        language={language}
        onChange={collaborative.doc ? undefined : setCode}
        sharedDoc={collaborative.doc}
        onCursor={collaborative.sendCursor}
      />

      {submissionId ? <VerdictPanel submission={verdict.submission} error={verdict.error} /> : null}
    </section>
  );
}
