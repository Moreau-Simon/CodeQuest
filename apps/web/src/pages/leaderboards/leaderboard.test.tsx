import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaderboardPage } from './LeaderboardPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const board = {
  scope: 'global',
  scopeId: '00000000-0000-0000-0000-000000000000',
  period: 'all',
  subjectType: 'player',
  items: [
    {
      rank: 1,
      subjectId: 'p1',
      displayName: 'alice',
      score: 350,
      achievedAt: '2026-11-16T10:00:00.000Z'
    },
    {
      rank: 2,
      subjectId: 'p2',
      displayName: 'bob',
      score: 300,
      achievedAt: '2026-11-16T09:00:00.000Z'
    }
  ],
  nextCursor: null,
  self: {
    rank: 2,
    subjectId: 'p2',
    displayName: 'bob',
    score: 300,
    achievedAt: '2026-11-16T09:00:00.000Z'
  }
};

function renderPage(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('classements (T100)', () => {
  it('affiche le classement des joueurs et la position personnelle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(board)));

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Classements' })).toBeInTheDocument();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText(/Votre position/)).toBeInTheDocument();
    expect(screen.getByText(/Rang 2/)).toBeInTheDocument();

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('alice');
    expect(rows[2]).toHaveTextContent('bob');
  });

  it('bascule vers le classement des équipes', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/v1/leaderboards/teams')) {
        return Promise.resolve(
          jsonResponse({
            ...board,
            subjectType: 'team',
            items: [
              {
                rank: 1,
                subjectId: 'team-1',
                displayName: 'Équipe alpha',
                score: 900,
                achievedAt: '2026-11-16T08:00:00.000Z'
              }
            ],
            self: null
          })
        );
      }
      return Promise.resolve(jsonResponse(board));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('tab', { name: 'Équipes' }));

    expect(await screen.findByText('Équipe alpha')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/leaderboards/teams'),
        expect.anything()
      )
    );
  });
});
