import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { ApiError } from '../../services/api-client';
import {
  completeLesson,
  getLesson,
  positioningAttempt,
  startLesson,
  submitQuiz,
  type LessonCompletion,
  type PositioningResult,
  type QuizAnswers,
  type QuizQuestion,
  type QuizResult
} from '../../services/lessons';
import { selectIsAuthenticated, useSessionStore } from '../../stores/session';
import { StatusBadge } from './LessonsPage';

/**
 * Rendu d'un sous-ensemble sûr de Markdown (titres, listes, gras et code).
 * Aucun HTML brut n'est injecté : le contenu vient de la base et reste du texte.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    nodes.push(
      token.startsWith('**') ? (
        <strong key={match.index}>{token.slice(2, -2)}</strong>
      ) : (
        <code key={match.index} className="rounded bg-elevated px-1 py-0.5 text-sm">
          {token.slice(1, -1)}
        </code>
      )
    );
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownContent({ source }: { source: string }): JSX.Element {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(paragraph.join(' '))}
      </p>
    );
    paragraph = [];
  };
  const flushList = (): void => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++} className="list-disc space-y-1 pl-5">
        {list.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading && heading[1] !== undefined && heading[2] !== undefined) {
      flushList();
      flushParagraph();
      const content = renderInline(heading[2]);
      const level = heading[1].length;
      if (level === 1)
        blocks.push(
          <h2 key={key++} className="text-2xl font-semibold">
            {content}
          </h2>
        );
      else if (level === 2)
        blocks.push(
          <h3 key={key++} className="text-xl font-semibold">
            {content}
          </h3>
        );
      else
        blocks.push(
          <h4 key={key++} className="text-lg font-semibold">
            {content}
          </h4>
        );
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushList();
  flushParagraph();

  return <div className="flex flex-col gap-3 text-ink">{blocks}</div>;
}

function QuestionForm({
  group,
  questions,
  answers,
  onChange,
  disabled
}: {
  group: string;
  questions: QuizQuestion[];
  answers: QuizAnswers;
  onChange: (id: string, choice: number) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {questions.map((question) => (
        <fieldset key={question.id} className="rounded-xl border border-elevated p-4">
          <legend className="px-1 font-medium">{question.prompt}</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {question.choices.map((choice, index) => (
              <label key={index} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${group}-${question.id}`}
                  checked={answers[question.id] === index}
                  onChange={() => onChange(question.id, index)}
                  disabled={disabled}
                />
                {choice}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function messageOf(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : t('common.error');
}

/** Leçon (T137) : contenu, quiz, positionnement et défi d'application lié. */
export function LessonPage(): JSX.Element {
  const { lessonId = '' } = useParams<{ lessonId: string }>();
  const authenticated = useSessionStore(selectIsAuthenticated);
  const user = useSessionStore((state) => state.user);
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: ({ signal }) => getLesson(lessonId, signal),
    enabled: lessonId.length > 0
  });

  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [positionAnswers, setPositionAnswers] = useState<QuizAnswers>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [positioningResult, setPositioningResult] = useState<PositioningResult | null>(null);
  const [completion, setCompletion] = useState<LessonCompletion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canWrite = authenticated && user?.emailVerified === true;

  function refresh(): void {
    void queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] });
    void queryClient.invalidateQueries({ queryKey: ['lessons'] });
  }

  const start = useMutation({
    mutationFn: () => startLesson(lessonId),
    onSuccess: refresh,
    onError: (cause) => setError(messageOf(cause))
  });

  const quiz = useMutation({
    mutationFn: () => submitQuiz(lessonId, answers),
    onSuccess: (result) => {
      setQuizResult(result);
      setError(null);
      refresh();
    },
    onError: (cause) => setError(messageOf(cause))
  });

  const positioning = useMutation({
    mutationFn: () => positioningAttempt(lessonId, positionAnswers),
    onSuccess: (result) => {
      setPositioningResult(result);
      setError(null);
      refresh();
    },
    onError: (cause) => setError(messageOf(cause))
  });

  const complete = useMutation({
    mutationFn: () =>
      completeLesson(lessonId, quizResult?.score ?? detail.data?.progress.quizScore ?? 0),
    onSuccess: (result) => {
      setCompletion(result);
      setError(null);
      refresh();
    },
    onError: (cause) => setError(messageOf(cause))
  });

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
        <Link to="/lessons" className="mt-4 inline-block text-primary hover:underline">
          {t('lesson.backToList')}
        </Link>
      </section>
    );
  }

  const lesson = detail.data;
  const completed = lesson.status === 'completed';
  const quizPassed =
    Boolean(quizResult?.passed) ||
    (lesson.progress.quizScore ?? 0) >= (lesson.quiz?.passScore ?? 101);
  const applicationChallenge = completion?.applicationChallenge ?? lesson.applicationChallenge;

  function setAnswer(target: 'quiz' | 'positioning', id: string, choice: number): void {
    const update = (current: QuizAnswers): QuizAnswers => ({ ...current, [id]: choice });
    if (target === 'quiz') setAnswers(update);
    else setPositionAnswers(update);
  }

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-16">
      <div>
        <Link to="/lessons" className="text-sm text-primary hover:underline">
          {t('lesson.backToList')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{lesson.title}</h1>
          <StatusBadge status={lesson.status} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {lesson.theme} · {t('lesson.duration', { value: lesson.estimatedMinutes })}
        </p>
      </div>

      <article className="rounded-2xl border border-elevated bg-surface p-6">
        <MarkdownContent source={lesson.contentMd} />
      </article>

      {!canWrite ? (
        authenticated ? (
          <p role="status" className="text-sm text-muted">
            {t('lesson.emailToProgress')}
          </p>
        ) : (
          <p role="status" className="text-sm">
            <Link to="/login" className="text-primary hover:underline">
              {t('lesson.loginToProgress')}
            </Link>
          </p>
        )
      ) : (
        <>
          {!completed && lesson.status === 'not_started' && (
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              {t('lesson.start')}
            </Button>
          )}

          {lesson.quiz && !completed && (
            <section className="flex flex-col gap-4 rounded-2xl border border-elevated p-6">
              <div>
                <h2 className="text-xl font-semibold">{t('lesson.quizTitle')}</h2>
                <p className="text-sm text-muted">
                  {t('lesson.passScore', { value: lesson.quiz.passScore })}
                </p>
              </div>
              <QuestionForm
                group="quiz"
                questions={lesson.quiz.questions}
                answers={answers}
                onChange={(id, choice) => setAnswer('quiz', id, choice)}
                disabled={quiz.isPending}
              />
              <Button
                onClick={() => quiz.mutate()}
                loading={quiz.isPending}
                disabled={Object.keys(answers).length < lesson.quiz.questions.length}
              >
                {t('lesson.checkQuiz')}
              </Button>
              {quizResult && (
                <p role="status" className="text-sm font-medium">
                  {t('lesson.quizResult', { score: quizResult.score, total: quizResult.correct })} —{' '}
                  {quizResult.passed ? t('lesson.quizPassed') : t('lesson.quizFailed')}
                </p>
              )}
            </section>
          )}

          {lesson.positioningTestAvailable && !completed && (
            <section className="flex flex-col gap-4 rounded-2xl border border-elevated p-6">
              <h2 className="text-xl font-semibold">{t('lesson.positioningTitle')}</h2>
              <p className="text-sm text-muted">{t('lesson.positioningHint')}</p>
              <QuestionForm
                group="positioning"
                questions={lesson.quiz?.questions ?? []}
                answers={positionAnswers}
                onChange={(id, choice) => setAnswer('positioning', id, choice)}
                disabled={positioning.isPending}
              />
              <Button
                onClick={() => positioning.mutate()}
                loading={positioning.isPending}
                disabled={
                  (lesson.quiz?.questions.length ?? 0) === 0 ||
                  Object.keys(positionAnswers).length < (lesson.quiz?.questions.length ?? 0)
                }
              >
                {t('lesson.positioningSubmit')}
              </Button>
              {positioningResult && (
                <p role="status" className="text-sm font-medium">
                  {positioningResult.passed
                    ? t('lesson.positioningPassed')
                    : t('lesson.positioningFailed', { score: positioningResult.score })}
                </p>
              )}
            </section>
          )}

          {!completed && quizPassed && (
            <Button onClick={() => complete.mutate()} loading={complete.isPending}>
              {t('lesson.complete')}
            </Button>
          )}

          {completed && (
            <section className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
              <h2 className="text-xl font-semibold">{t('lesson.completedTitle')}</h2>
              {completion && (
                <p className="text-sm">
                  {t('lesson.xpEarned', { value: completion.xp })} ·{' '}
                  {t('lesson.level', { value: completion.level })}
                </p>
              )}
              {applicationChallenge ? (
                <Link
                  to={`/challenges/${applicationChallenge.id}`}
                  className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-surface hover:brightness-110"
                >
                  {t('lesson.applicationChallenge', { title: applicationChallenge.title })}
                </Link>
              ) : (
                <p className="text-sm text-muted">{t('lesson.noApplicationChallenge')}</p>
              )}
            </section>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
