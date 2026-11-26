import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { useAmbientAudio } from '../../hooks/useAmbientAudio';
import { t } from '../../i18n';
import { listLoreChapters } from '../../services/lore';

/** Catalogue du lore (T202) : lecture publique, audio uniquement à la demande. */
export function LorePage(): JSX.Element {
  const {
    data: chapters,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['lore'],
    queryFn: ({ signal }) => listLoreChapters(signal)
  });
  const audio = useAmbientAudio('regions/codex');

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div data-cq-animated className="max-w-2xl">
          <h1 className="text-4xl font-bold tracking-tight">{t('lore.title')}</h1>
          <p className="mt-2 text-muted">{t('lore.subtitle')}</p>
        </div>
        <div className="rounded-xl border border-elevated p-4">
          <Button
            variant="secondary"
            aria-pressed={audio.started}
            onClick={audio.started ? audio.stop : audio.start}
          >
            {audio.started ? t('audio.disable') : t('audio.enable')}
          </Button>
          <p
            role="status"
            aria-label={t('audio.statusLabel')}
            aria-live="polite"
            className="mt-2 text-sm"
          >
            {audio.started ? t('audio.on') : t('audio.off')}
          </p>
          <p className="mt-1 text-xs text-muted">{t('audio.visualEquivalent')}</p>
        </div>
      </div>

      {isLoading ? <Skeleton className="mt-8" label={t('common.loading')} /> : null}
      {isError ? (
        <p role="alert" className="mt-8 text-danger">
          {t('common.error')}
        </p>
      ) : null}

      {chapters ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <Link
                to={`/lore/${chapter.id}`}
                className="block rounded-xl border border-elevated p-4 no-underline hover:border-primary"
              >
                <h2 className="text-lg font-semibold text-ink">{chapter.title}</h2>
                <p className="mt-1 text-sm text-muted">
                  {t('lore.requiredLevel', { level: chapter.requiredLevel ?? 1 })}
                </p>
                {chapter.unlocked && chapter.content ? (
                  <p className="mt-2 text-sm text-ink">
                    {chapter.content
                      .replace(/^#{1,3}\s+/gm, '')
                      .split('\n')
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(' ')}
                  </p>
                ) : null}
                <p className="mt-2 text-sm">
                  {chapter.read
                    ? t('lore.read')
                    : chapter.unlocked
                      ? t('lore.available')
                      : t('lore.locked')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
