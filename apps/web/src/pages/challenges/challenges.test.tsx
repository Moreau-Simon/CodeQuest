import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import type { Submission } from '../../services/challenges';
import { useSessionStore } from '../../stores/session';
import { ChallengePage } from './ChallengePage';

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
  title: 'Trier une liste',
  theme: 'Algorithmes de tri',
  type: 'sorting' as const,
  difficulty: 2,
  status: 'available' as const,
  bestScore: null,
  statement: 'Triez la liste fournie.',
  languages: ['python', 'javascript'],
  basePoints: 200,
  perfMax: 80,
  hints: [],
  missingPrerequisites: []
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderAt(routePath: string, element: JSX.Element): void {
  const initialEntry = routePath.replace(':challengeId', 'challenge-1');
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={routePath} element={element} />
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

describe('page de défi (T088)', () => {
  it('soumet une solution et affiche le verdict filtré sans exposer les tests cachés', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/v1/challenges/challenge-1') {
        return Promise.resolve(jsonResponse(challenge));
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
              createdAt: '2026-11-16T10:00:00.000Z'
            },
            202
          )
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    verdictState.submission = {
      id: 'submission-1',
      challengeId: 'challenge-1',
      status: 'passed',
      score: 332.43,
      testsPassed: 20,
      testsTotal: 20,
      cpuTimeMedianMs: 1500,
      verdictReason: null,
      createdAt: '2026-11-16T10:00:00.000Z'
    };

    renderAt('/challenges/:challengeId', <ChallengePage />);
    expect(await screen.findByRole('heading', { name: 'Trier une liste' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Soumettre' }));

    await waitFor(() => expect(screen.getByText(/Réussi/)).toBeInTheDocument());
    expect(screen.getByText('332.43')).toBeInTheDocument();
    expect(screen.getByText('20/20')).toBeInTheDocument();
    expect(screen.getByText('1500 ms')).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/v1/challenges/challenge-1/submissions' && init?.method === 'POST'
    );
    expect(post).toBeDefined();
    expect((post?.[1]?.headers as Headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ language: 'python' });
    // Aucun test caché ni sortie attendue n'est rendu.
    expect(screen.queryByText(/expected/i)).not.toBeInTheDocument();
  });
});

describe('indices progressifs (T196)', () => {
  it('n’affiche le contenu qu’après achat et envoie une clé d’idempotence', async () => {
    let firstPurchased = false;
    const exploratory = {
      ...challenge,
      id: 'challenge-1',
      title: 'Corriger la boucle',
      type: 'debugging' as const,
      hints: [
        { id: 'hint-1', order: 1, priceBits: 10, purchased: firstPurchased },
        { id: 'hint-2', order: 2, priceBits: 20, purchased: false }
      ]
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/shop/') && init?.method === 'POST') {
        firstPurchased = true;
        return Promise.resolve(
          jsonResponse(
            {
              itemId: 'hint-1',
              sku: 'hint-hint-1',
              priceBits: 10,
              balance: 490,
              quantity: 1
            },
            201
          )
        );
      }
      if (url === '/api/v1/challenges/challenge-1') {
        return Promise.resolve(
          jsonResponse({
            ...exploratory,
            hints: [
              {
                id: 'hint-1',
                order: 1,
                priceBits: 10,
                purchased: firstPurchased,
                ...(firstPurchased ? { content: 'Indice : inspectez la borne supérieure.' } : {})
              },
              { id: 'hint-2', order: 2, priceBits: 20, purchased: false }
            ]
          })
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/challenges/:challengeId', <ChallengePage />);

    expect(await screen.findByRole('heading', { name: 'Corriger la boucle' })).toBeInTheDocument();
    expect(screen.queryByText(/inspectez la borne/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Acheter l’indice 1' }));

    expect(await screen.findByText(/inspectez la borne/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acheter l’indice 2' })).toBeInTheDocument();
    const purchase = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/shop/') && init?.method === 'POST'
    );
    expect(new Headers(purchase?.[1]?.headers).get('Idempotency-Key')).toBeTruthy();
  });
});
