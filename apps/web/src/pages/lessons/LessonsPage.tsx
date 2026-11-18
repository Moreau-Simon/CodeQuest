import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { listLessons, type LessonStatus, type LessonSummary } from '../../services/lessons';

export function StatusBadge({ status }: { status: LessonStatus }): JSX.Element {
  const palette: Record<LessonStatus, string> = {
    not_started: 'border-elevated bg-surface text-muted',
    in_progress: 'border-primary/20 bg-primary/10 text-primary',
    completed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${palette[status]}`}>
      {t(`lesson.status.${status}`)}
    </span>
  );
}

/** Parcours pédagogique (T137) : toutes les leçons publiées et leur progression. */
export function LessonsPage(): JSX.Element {
  const lessons = useQuery({
    queryKey: ['lessons'],
    queryFn: ({ signal }) => listLessons(undefined, signal)
  });

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('lesson.listTitle')}</h1>
        <p className="mt-1 text-muted">{t('lesson.listSubtitle')}</p>
      </div>

      {lessons.isPending ? (
        <Skeleton label={t('common.loading')} className="h-48 w-full" />
      ) : lessons.isError ? (
        <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-600">
          {t('common.error')}
        </div>
      ) : lessons.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-elevated p-8 text-center text-muted">
          {t('lesson.empty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {lessons.data.map((lesson: LessonSummary, index) => (
            <li key={lesson.id}>
              <article className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-elevated bg-surface p-5 transition hover:border-primary/40">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted">
                      {t('lesson.step', { value: index + 1 })}
                    </span>
                    <StatusBadge status={lesson.status} />
                    <span className="text-xs text-muted">{lesson.theme}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-ink">
                    <Link to={`/lessons/${lesson.id}`} className="hover:text-primary hover:underline">
                      {lesson.title}
                    </Link>
                  </h2>
                  <p className="text-xs text-muted">
                    {t('lesson.duration', { value: lesson.estimatedMinutes })}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {lesson.progress.quizScore !== null && (
                    <span className="text-sm font-medium text-ink">
                      {t('lesson.quizScore')} : <strong className="text-primary">{lesson.progress.quizScore}</strong>
                    </span>
                  )}
                  <Link
                    to={`/lessons/${lesson.id}`}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-surface transition hover:brightness-110"
                  >
                    {lesson.status === 'completed' ? t('lesson.review') : t('lesson.open')}
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
