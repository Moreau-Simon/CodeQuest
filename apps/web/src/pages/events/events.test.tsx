import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventDetailPage } from './EventDetailPage';
import { EventLeaderboardPage } from './EventLeaderboardPage';
import { EventsPage } from './EventsPage';

const EVENT_ID = '0199f000-0000-7000-8000-000000000001';
const CHALLENGE_ID = '0199f000-0000-7000-8000-000000000002';
const SERVER_NOW = '2030-09-01T12:00:00.000Z';

const event = {
  id: EVENT_ID,
  title: 'Event de rentrée',
  timezone: 'Europe/Paris',
  startsAt: '2030-09-01T11:00:00.000Z',
  endsAt: '2030-09-01T13:00:00.000Z',
  status: 'open',
  type: 'standard',
  maxAttempts: 1,
  challengeIds: [CHALLENGE_ID],
  joined: false,
  attemptConsumed: false,
  serverNow: SERVER_NOW
};

const results = {
  eventId: EVENT_ID,
  status: 'finished',
  published: true,
  rewards: { bits: 100 },
  leaderboard: {
    items: [
      {
        rank: 1,
        subjectId: 'p1',
        displayName: 'alice',
        score: 350,
        achievedAt: '2030-09-01T12:30:00.000Z'
      }
    ],
    nextCursor: null
  },
  solutions: [{ challengeId: CHALLENGE_ID, unlocked: true }]
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderAt(path: string, element: JSX.Element): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events" element={element} />
          <Route path="/events/:eventId" element={element} />
          <Route path="/events/:eventId/results" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('événements à essai unique (T172/T173)', () => {
  it('affiche le fuseau, le compte à rebours serveur et permet l’inscription', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST' && url.endsWith('/join')) {
        return Promise.resolve(jsonResponse({ eventId: EVENT_ID, joined: true }, 201));
      }
      return Promise.resolve(jsonResponse([event]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('/events', <EventsPage />);

    expect(await screen.findByRole('heading', { name: 'Événements' })).toBeInTheDocument();
    expect(await screen.findByText(/Europe\/Paris/)).toBeInTheDocument();
    expect(screen.getByText(/Event de rentrée/)).toBeInTheDocument();
    expect(screen.getByText(/15:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "S'inscrire" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/events/${EVENT_ID}/join`),
        expect.anything()
      )
    );
  });

  it('exige une confirmation explicite avant de consommer l’essai', async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST' && url.endsWith('/start')) {
        return Promise.resolve(
          jsonResponse({
            eventId: EVENT_ID,
            attemptStartedAt: SERVER_NOW,
            attemptConsumedAt: SERVER_NOW
          })
        );
      }
      return Promise.resolve(jsonResponse([event]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt(`/events/${EVENT_ID}`, <EventDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Event de rentrée' })).toBeInTheDocument();
    const startButton = screen.getByRole('button', { name: 'Démarrer l’essai' });
    expect(startButton).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/events/${EVENT_ID}/start`),
        expect.anything()
      )
    );
    expect(await screen.findByText(/Essai consommé/)).toBeInTheDocument();
  });

  it('publie le classement et débloque le corrigé après clôture', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/solution')) {
        return Promise.resolve(
          jsonResponse({ eventId: EVENT_ID, challengeId: CHALLENGE_ID, solution: 'def solve(): pass' })
        );
      }
      return Promise.resolve(jsonResponse(results));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt(`/events/${EVENT_ID}/results`, <EventLeaderboardPage />);

    expect(await screen.findByRole('heading', { name: 'Résultats de l’événement' })).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText(/100/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Afficher le corrigé' }));
    expect(await screen.findByText('def solve(): pass')).toBeInTheDocument();
  });
});
