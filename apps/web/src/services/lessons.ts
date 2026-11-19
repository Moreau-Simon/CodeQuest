import { api } from './api-client';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  status: LessonStatus;
  quizScore: number | null;
  completedAt: string | null;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

export interface Quiz {
  passScore: number;
  questions: QuizQuestion[];
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

export interface PositioningResult {
  score: number;
  passed: boolean;
  exempted: boolean;
  source: 'positioning' | null;
}

export interface LessonCompletion {
  lessonId: string;
  status: LessonStatus;
  quizScore: number;
  completedAt: string;
  xp: number;
  level: number;
  applicationChallenge: { id: string; title: string } | null;
}

export interface FirstAttemptStats {
  attempts: number;
  successes: number;
  rate: number;
}

export interface LessonSummary {
  id: string;
  title: string;
  theme: string;
  order: number;
  estimatedMinutes: number;
  status: LessonStatus;
  positioningTestAvailable: boolean;
  applicationChallenge: { id: string; title: string } | null;
  progress: LessonProgress;
}

export interface LessonDetail extends LessonSummary {
  contentMd: string;
  quiz: Quiz | null;
}

export type QuizAnswers = Record<string, number>;

/** Client des routes `/lessons` (US6). */
export function listLessons(theme?: string, signal?: AbortSignal): Promise<LessonSummary[]> {
  const suffix = theme ? `?theme=${encodeURIComponent(theme)}` : '';
  return api.get<LessonSummary[]>(`/lessons${suffix}`, { signal });
}

export function getLesson(lessonId: string, signal?: AbortSignal): Promise<LessonDetail> {
  return api.get<LessonDetail>(`/lessons/${encodeURIComponent(lessonId)}`, { signal });
}

export function startLesson(lessonId: string): Promise<LessonProgress> {
  return api.post<LessonProgress>(`/lessons/${encodeURIComponent(lessonId)}/start`);
}

export function submitQuiz(lessonId: string, answers: QuizAnswers): Promise<QuizResult> {
  return api.post<QuizResult>(`/lessons/${encodeURIComponent(lessonId)}/quiz`, { answers });
}

export function positioningAttempt(lessonId: string, answers: QuizAnswers): Promise<PositioningResult> {
  return api.post<PositioningResult>(`/lessons/${encodeURIComponent(lessonId)}/positioning`, {
    answers
  });
}

export function completeLesson(
  lessonId: string,
  quizScore: number,
  answers?: QuizAnswers
): Promise<LessonCompletion> {
  return api.post<LessonCompletion>(`/lessons/${encodeURIComponent(lessonId)}/complete`, {
    quizScore,
    ...(answers ? { answers } : {})
  });
}

export function getFirstAttemptStats(lessonId?: string): Promise<FirstAttemptStats> {
  const suffix = lessonId ? `?lessonId=${encodeURIComponent(lessonId)}` : '';
  return api.get<FirstAttemptStats>(`/lessons/metrics/first-attempt${suffix}`);
}
