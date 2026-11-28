import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import type { LessonDetail } from '../../services/lessons';
import { useSessionStore } from '../../stores/session';
import { LessonPage } from './LessonPage';

const lessonId = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01';

const detail: LessonDetail = {
  id: lessonId,
  title: 'Les bases des tableaux',
  theme: 'Algorithmes de tri',
  order: 1,
  estimatedMinutes: 10,
  status: 'not_started',
  applicationChallenge: { id: 'ch-1', title: 'Tri optimal' },
  progress: { status: 'not_started', quizScore: null, completedAt: null },
  contentMd: '# Les bases\n\nUn **tableau** retient une séquence. Utilisez `len()`.\n\n- Zéro indexed\n- Copie safe',
  quiz: {
    passScore: 70,
    questions: [
      { id: 'q1', prompt: 'Premier index ?', choices: ['0', '1'] },
      { id: 'q2', prompt: 'Taille ?', choices: ['len()', 'size()'] }
    ]
  }
};

const profile: Profile = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b99',
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 1,
  xp: 0,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: {},
  badges: []
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/lessons/${lessonId}`]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonPage />} />
          <Route path="/challenges/:challengeId" element={<p>Défi d’application</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function answerAll(scope: HTMLElement): void {
  for (const group of within(scope).getAllByRole('group')) {
    const radios = within(group).getAllByRole('radio');
    fireEvent.click(radios[0]!);
  }
}

describe('LessonPage (US6 - T137)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSessionStore.getState().clearSession();
  });

  it('affiche le contenu en lecture seule pour un visiteur anonyme', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(detail));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Les bases des tableaux')).toBeInTheDocument();
    });
    expect(screen.getByText('Les bases')).toBeInTheDocument();
    expect(screen.getByText('tableau')).toBeInTheDocument();
    expect(screen.getByText('len()')).toBeInTheDocument();
    expect(screen.getByText(/Connectez-vous pour suivre/)).toBeInTheDocument();
    expect(screen.queryByText('Valider le quiz')).not.toBeInTheDocument();
  });

  it('permet de réussir le quiz puis de terminer la leçon et d’ouvrir le défi lié', async () => {
    let completed = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        return jsonResponse(completed ? { ...detail, status: 'completed' } : detail);
      }
      if (url.endsWith('/quiz')) return jsonResponse({ score: 100, correct: 2, total: 2, passed: true });
      if (url.endsWith('/complete')) {
        completed = true;
        return jsonResponse({
          lessonId,
          status: 'completed',
          quizScore: 100,
          completedAt: '2026-11-18T10:00:00.000Z',
          xp: 100,
          level: 2,
          applicationChallenge: { id: 'ch-1', title: 'Tri optimal' }
        });
      }
      return jsonResponse({});
    });
    useSessionStore.getState().setUser(profile);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Valider le quiz')).toBeInTheDocument();
    });
    const quizSection = screen.getByRole('heading', { name: 'Mini-quiz' }).closest('section')!;
    answerAll(quizSection);
    fireEvent.click(screen.getByText('Valider le quiz'));

    await waitFor(() => {
      expect(screen.getByText(/Quiz réussi/)).toBeInTheDocument();
      expect(screen.getByText('Terminer la leçon')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Terminer la leçon'));

    await waitFor(() => {
      expect(screen.getByText('Leçon terminée')).toBeInTheDocument();
    });
    expect(screen.getByText(/\+100 XP/)).toBeInTheDocument();
    const link = screen.getByText(/Appliquer : Tri optimal/);
    expect(link.closest('a')).toHaveAttribute('href', '/challenges/ch-1');
  });

  it('ne propose que le mini-quiz pédagogique, sans test de positionnement', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(detail));
    useSessionStore.getState().setUser(profile);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Mini-quiz' })).toBeInTheDocument();
    expect(screen.queryByText('Test de positionnement')).not.toBeInTheDocument();
    expect(screen.queryByText('Passer le test de positionnement')).not.toBeInTheDocument();
  });
});
