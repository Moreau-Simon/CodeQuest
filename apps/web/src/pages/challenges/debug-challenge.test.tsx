import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import type { Submission } from '../../services/challenges';
import { useSessionStore } from '../../stores/session';
import { DebugChallengePage } from './DebugChallengePage';

const verdictState = vi.hoisted(() => ({
  submission: null as Submission | null,
  error: null as string | null
}));

vi.mock('../../hooks/useSubmissionVerdict', () => ({
  useSubmissionVerdict: () => verdictState
}));

vi.mock('../../components/editor/CodeEditor', () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange(next: string): void }) => (
    <textarea
      aria-label="Éditeur de code"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}));

const BUGGY_CODE = 'def solve(values):\n    return custom_sort(values)\n';

const profile: Profile = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
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

const challenge = {
  id: 'challenge-1',
  title: 'Corriger le tri',
  theme: 'Débogage',
  type: 'debugging' as const,
  difficulty: 2,
  status: 'available' as const,
  bestScore: null,
  statement: 'Corrigez la fonction sans la réécrire.',
  languages: ['python'],
  basePoints: 100,
  perfMax: 50,
  currentVersion: 1,
  buggyCode: BUGGY_CODE,
  maxModifiedLines: 2,
  cipher: null,
  hints: [],
  missingPrerequisites: []
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/challenges/challenge-1/debug']}>
        <Routes>
          <Route path="/challenges/:challengeId/debug" element={<DebugChallengePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  verdictState.submission = null;
  verdictState.error = null;
  useSessionStore.setState({ status: 'authenticated', user: profile });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.setState({ status: 'unauthenticated', user: null });
});

describe('page de débogage (T147)', () => {
  it('précharge le code bogué et impose un démarrage explicite avant soumission', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/v1/challenges/challenge-1') {
        return Promise.resolve(jsonResponse(challenge));
      }
      if (url === '/api/v1/challenges/challenge-1/attempts' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              id: 'attempt-1',
              challengeId: 'challenge-1',
              startedAt: new Date().toISOString(),
              expiredAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              verdictAt: null
            },
            201
          )
        );
      }
      if (url === '/api/v1/challenges/challenge-1/submissions' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              id: 'submission-1',
              challengeId: 'challenge-1',
              status: 'pending',
              score: null,
              testsPassed: null,
              testsTotal: null,
              cpuTimeMedianMs: null,
              verdictReason: null,
              createdAt: '2026-11-19T10:01:00.000Z',
              attemptId: 'attempt-1',
              modifiedLines: 1,
              hintsUsed: 0
            },
            202
          )
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const editor = (await screen.findByRole('textbox', {
      name: 'Éditeur de code'
    })) as HTMLTextAreaElement;
    expect(editor.value).toBe(BUGGY_CODE);
    expect(screen.getByText(/0 ligne\(s\) modifiée\(s\)/)).toBeInTheDocument();

    // Aucun test caché, correction ou solution n'est rendu par l'interface.
    expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sorted\(values\)/)).not.toBeInTheDocument();

    // Le bouton reste désactivé jusqu'au démarrage explicite de l'essai.
    const submitButton = screen.getByRole('button', { name: 'Soumettre' });
    expect(submitButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Démarrer l’essai' }));
    await waitFor(() => expect(screen.getByRole('timer')).toBeInTheDocument());

    fireEvent.change(editor, {
      target: { value: 'def solve(values):\n    return sorted(values)\n' }
    });
    expect(await screen.findByText(/1 ligne\(s\) modifiée\(s\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === '/api/v1/challenges/challenge-1/submissions' && init?.method === 'POST'
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ attemptId: 'attempt-1' });
    });
    await waitFor(() => expect(screen.getByText(/Exécution en cours/)).toBeInTheDocument());
  });
});
