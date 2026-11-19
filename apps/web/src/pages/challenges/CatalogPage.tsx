import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { listChallenges, type ChallengeSummary } from '../../services/challenges';

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
const TYPES = ['sorting', 'debugging', 'decryption', 'steganography', 'qr_code'] as const;
const STATUSES = ['available', 'completed', 'locked'] as const;

function DifficultyBadge({ difficulty }: { difficulty: number }): JSX.Element {
  const color =
    difficulty <= 2
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
      : difficulty <= 3
        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';

  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${color}`}
      title={t('challenge.difficulty', { value: difficulty })}
    >
      ★ {difficulty}/5
    </span>
  );
}

function StatusBadge({ item }: { item: ChallengeSummary }): JSX.Element {
  if (item.status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        ✓ {t('challenge.status.completed')}
      </span>
    );
  }

  if (item.status === 'locked') {
    const tooltip =
      item.missingPrerequisites && item.missingPrerequisites.length > 0
        ? `${t('challenge.lockedTooltip')}\n• ${item.missingPrerequisites.join('\n• ')}`
        : t('challenge.locked');

    return (
      <span
        tabIndex={0}
        title={tooltip}
        className="group relative inline-flex cursor-help items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      >
        🔒 {t('challenge.status.locked')}
        {item.missingPrerequisites && item.missingPrerequisites.length > 0 && (
          <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-64 rounded-xl border border-elevated bg-surface p-3 text-left text-xs font-normal text-ink shadow-xl group-hover:block group-focus:block">
            <p className="font-semibold text-ink">{t('challenge.lockedTooltip')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              {item.missingPrerequisites.map((prereq, index) => (
                <li key={index}>{prereq}</li>
              ))}
            </ul>
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
      {t('challenge.status.available')}
    </span>
  );
}

/**
 * Catalogue complet des défis (US5, T127).
 * Filtres multi-critères, tri, badges de statut avec prérequis au survol.
 */
export function CatalogPage(): JSX.Element {
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const challenges = useQuery({
    queryKey: ['challenges', { theme, difficulty, type, status }],
    queryFn: ({ signal }) =>
      listChallenges(
        {
          theme: theme || undefined,
          difficulty: difficulty ? Number(difficulty) : undefined,
          type: type || undefined,
          status: status || undefined
        },
        signal
      )
  });

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('challenge.listTitle')}</h1>
        <p className="mt-1 text-muted">{t('challenge.listSubtitle')}</p>
      </div>

      {/* Barre de filtres */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('challenge.filterTheme')}
          <input
            type="text"
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink transition focus:border-primary focus:outline-none"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder={t('challenge.allThemes')}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('challenge.filterDifficulty')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink transition focus:border-primary focus:outline-none"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">{t('challenge.allDifficulties')}</option>
            {DIFFICULTIES.map((val) => (
              <option key={val} value={val}>
                {t('challenge.difficulty', { value: val })}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('challenge.filterType')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink transition focus:border-primary focus:outline-none"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{t('challenge.allTypes')}</option>
            {TYPES.map((tVal) => (
              <option key={tVal} value={tVal}>
                {t(`challenge.type.${tVal}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('challenge.filterStatus')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink transition focus:border-primary focus:outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t('challenge.allStatuses')}</option>
            {STATUSES.map((sVal) => (
              <option key={sVal} value={sVal}>
                {t(`challenge.status.${sVal}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Liste des défis */}
      {challenges.isPending ? (
        <Skeleton label={t('common.loading')} className="h-48 w-full" />
      ) : challenges.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-600"
        >
          {t('common.error')}
        </div>
      ) : challenges.data.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-elevated p-8 text-center text-muted">
          {t('challenge.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {challenges.data.items.map((item) => {
            const isLocked = item.status === 'locked';

            return (
              <article
                key={item.id}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-elevated p-5 transition ${
                  isLocked ? 'bg-surface/50 opacity-80' : 'bg-surface hover:border-primary/40'
                }`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <DifficultyBadge difficulty={item.difficulty} />
                    <span className="text-xs text-muted">
                      {item.theme} · {t(`challenge.type.${item.type}`)}
                    </span>
                    <StatusBadge item={item} />
                  </div>

                  <h2 className="text-xl font-semibold text-ink">
                    {isLocked ? (
                      <span className="text-muted">{item.title}</span>
                    ) : (
                      <Link
                        to={`/challenges/${item.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                    )}
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {item.bestScore !== null ? (
                    <span className="text-sm font-medium text-ink">
                      {t('challenge.bestScore')} :{' '}
                      <strong className="text-primary">{item.bestScore}</strong>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{t('challenge.none')}</span>
                  )}

                  {isLocked ? (
                    <span className="cursor-not-allowed rounded-xl bg-elevated px-4 py-2 text-sm font-medium text-muted">
                      {t('challenge.locked')}
                    </span>
                  ) : (
                    <Link
                      to={`/challenges/${item.id}`}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-surface transition hover:brightness-110"
                    >
                      {t('challenge.open')}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
