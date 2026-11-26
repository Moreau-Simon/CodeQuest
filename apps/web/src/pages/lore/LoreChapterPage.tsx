import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { useAmbientAudio } from '../../hooks/useAmbientAudio';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import { listLoreChapters, markChapterRead } from '../../services/lore';
import { selectIsAuthenticated, useSessionStore } from '../../stores/session';
import { MarkdownContent } from '../lessons/LessonPage';

/** Détail d'un chapitre (T202) : contenu texte et lecture persistée. */
export function LoreChapterPage(): JSX.Element {
  const { chapterId } = useParams();
  const authenticated = useSessionStore(selectIsAuthenticated);
  const queryClient = useQueryClient();
  const {
    data: chapters,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['lore', chapterId],
    queryFn: ({ signal }) => listLoreChapters(signal)
  });
  const chapter = chapters?.find((candidate) => candidate.id === chapterId);
  const audio = useAmbientAudio(chapter?.audioKey);
  const read = useMutation({
    mutationFn: () => markChapterRead(chapterId ?? ''),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lore'] }),
        queryClient.invalidateQueries({ queryKey: ['lore', chapterId] })
      ]);
      audio.playEffect('success');
    }
  });

  if (isLoading)
    return <Skeleton className="mx-auto mt-12 max-w-3xl" label={t('common.loading')} />;
  if (isError || !chapter) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-12">
        <p role="alert" className="text-danger">
          {t('lore.notFound')}
        </p>
        <Link to="/lore" className="mt-4 inline-block text-primary">
          {t('lore.back')}
        </Link>
      </section>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">
        {t('lore.requiredLevel', { level: chapter.requiredLevel ?? 1 })}
      </p>
      <h1 className="mt-1 text-3xl font-semibold">{chapter.title}</h1>

      {chapter.unlocked ? (
        <>
          <div className="mt-8">
            <MarkdownContent source={chapter.content ?? ''} />
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => read.mutate()}
              disabled={!authenticated || chapter.read || read.isPending}
              loading={read.isPending}
            >
              {chapter.read ? t('lore.read') : t('lore.markRead')}
            </Button>
            <Button variant="secondary" onClick={() => audio.speak(chapter.content ?? '')}>
              {t('lore.listen')}
            </Button>
            {chapter.read ? (
              <p role="status" className="text-sm text-success">
                {t('lore.readDone')}
              </p>
            ) : null}
            {read.isError ? (
              <p role="alert" className="text-sm text-danger">
                {read.error instanceof ApiError ? read.error.message : t('common.error')}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p role="status" className="mt-8 rounded-xl border border-elevated p-4">
          {t('lore.lockedDetail', { level: chapter.requiredLevel ?? 1 })}
        </p>
      )}

      <p className="mt-8 text-xs text-muted">{t('audio.visualEquivalent')}</p>
      <Link to="/lore" className="mt-6 inline-block text-primary">
        {t('lore.back')}
      </Link>
    </article>
  );
}
