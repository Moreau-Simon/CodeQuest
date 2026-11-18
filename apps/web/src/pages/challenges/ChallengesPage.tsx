import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { t } from '../../i18n';
import { listChallenges, type ChallengeSummary } from '../../services/challenges';
import { Skeleton } from '../../components/ui';

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;

function ScoreBadge({ item }: { item: ChallengeSummary }): JSX.Element {
  return item.bestScore === null ? (
    <span className="text-sm text-muted">{t('challenge.none')}</span>
  ) : (
    <span className="text-sm text-ink">
      {t('challenge.bestScore')} : <strong>{item.bestScore}</strong>
    </span>
  );
}

/**
 * Catalogue (US2, T088) : liste paginée des défis publiés avec filtres de
 * thématique et de difficulté. Les tests et la solution de référence ne sont
 * jamais exposés par l'API : le catalogue ne transporte que les métadonnées.
 */
export function ChallengesPage(): JSX.Element {
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const challenges = useQuery({
    queryKey: ['challenges', { theme, difficulty }],
    queryFn: ({ signal }) =>
      listChallenges(
        {
          theme: theme || undefined,
          difficulty: difficulty ? Number(difficulty) : undefined
        },
        signal
      )
  });

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">{t('challenge.listTitle')}</h1>
        <p className="mt-1 text-muted">{t('challenge.listSubtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t('challenge.filterTheme')}
          <input
            type="text"
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            placeholder={t('challenge.allThemes')}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('challenge.filterDifficulty')}
          <select
            className="min-h-11 rounded-xl border border-elevated bg-surface px-3 py-2 text-ink"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value="">{t('challenge.allDifficulties')}</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {challenges.isPending ? (
        <Skeleton label={t('common.loading')} className="h-40 w-full" />
      ) : challenges.isError ? (
        <p role="alert">{t('common.error')}</p>
      ) : challenges.data.items.length === 0 ? (
        <p className="text-muted">{t('challenge.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {challenges.data.items.map((item) => (
            <li key={item.id} className="rounded-xl bg-elevated p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    <Link to={`/challenges/${item.id}`}>{item.title}</Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {item.theme} · {t(`challenge.type.${item.type}`)} ·{' '}
                    {t('challenge.difficulty', { value: item.difficulty })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <ScoreBadge item={item} />
                  <Link
                    to={`/challenges/${item.id}`}
                    className="text-sm font-semibold text-primary"
                  >
                    {t('challenge.open')}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
