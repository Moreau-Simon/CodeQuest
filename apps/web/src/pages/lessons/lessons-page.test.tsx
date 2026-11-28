import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonsPage } from './LessonsPage';

const mockLessons = [
  {
    id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
    title: 'Les bases des tableaux',
    theme: 'Algorithmes de tri',
    order: 1,
    estimatedMinutes: 10,
    status: 'not_started',
    applicationChallenge: null,
    progress: { status: 'not_started', quizScore: null, completedAt: null }
  },
  {
    id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02',
    title: 'Complexité linéaire',
    theme: 'Algorithmes de tri',
    order: 2,
    estimatedMinutes: 15,
    status: 'completed',
    applicationChallenge: { id: 'ch-1', title: 'Tri optimal' },
    progress: { status: 'completed', quizScore: 100, completedAt: '2026-11-18T10:00:00.000Z' }
  }
];

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
      <MemoryRouter>
        <LessonsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('LessonsPage (US6 - T137)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le parcours des leçons et leur progression', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(mockLessons));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Les bases des tableaux')).toBeInTheDocument();
      expect(screen.getByText('Complexité linéaire')).toBeInTheDocument();
    });
    expect(screen.getByText(/Étape 1/)).toBeInTheDocument();
    expect(screen.getAllByText('Terminé').length).toBeGreaterThan(0);
    expect(screen.getByText(/Score du quiz/)).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText('Relire la leçon').length).toBeGreaterThan(0);
  });

  it('affiche un état vide quand aucune leçon n’est publiée', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Aucune leçon disponible/)).toBeInTheDocument();
    });
  });
});
