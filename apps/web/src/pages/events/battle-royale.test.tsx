import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../../stores/session';
import { BattleRoyalePage } from './BattleRoyalePage';
import { SpectatorView } from './SpectatorView';

const EVENT_ID = '0199f100-0000-7000-8000-000000000001';
const ROUND_ID = '0199f100-0000-7000-8000-000000000002';
const CHALLENGE_ID = '0199f100-0000-7000-8000-000000000003';
const SELF_ID = '0199f100-0000-7000-8000-000000000004';

const bus = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  return {
    listeners,
    lastEmit: null as { event: string; payload: unknown } | null,
    emit(event: string, data: unknown): void {
      const envelope = {
        id: '0199f100-0000-7000-8000-000000000099',
        type: event,
        at: new Date().toISOString(),
        data
      };
      for (const callback of listeners.get(event) ?? []) callback(envelope);
    }
  };
});

vi.mock('socket.io-client', () => ({
  io: () => ({
    on(event: string, callback: (payload: unknown) => void) {
      if (!bus.listeners.has(event)) bus.listeners.set(event, new Set());
      bus.listeners.get(event)?.add(callback);
    },
    emit(event: string, payload: unknown) {
      bus.lastEmit = { event, payload };
    },
    emitWithAck(event: string, payload: unknown) {
      bus.lastEmit = { event, payload };
      return Promise.resolve({
        ok: true,
        room: `event:${(payload as { eventId: string }).eventId}`
      });
    },
    disconnect() {
      /* le bus est réinitialisé entre les tests */
    }
  })
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

const now = Date.now();
const event = {
  id: EVENT_ID,
  title: 'Battle royale',
  timezone: 'UTC',
  startsAt: new Date(now - 60_000).toISOString(),
  endsAt: new Date(now + 3_600_000).toISOString(),
  status: 'open',
  type: 'battle_royale',
  maxAttempts: 1,
  challengeIds: [CHALLENGE_ID],
  joined: true,
  attemptConsumed: false,
  serverNow: new Date(now).toISOString()
};

const rounds = [
  {
    id: ROUND_ID,
    eventId: EVENT_ID,
    roundNumber: 1,
    challengeId: CHALLENGE_ID,
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 120_000).toISOString(),
    status: 'scheduled',
    results: []
  }
];

function renderAt(path: string, element: JSX.Element): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events/:eventId/arena" element={element} />
          <Route path="/events/:eventId/spectate" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  bus.listeners.clear();
  bus.lastEmit = null;
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: SELF_ID,
      pseudonym: 'ada',
      email: 'ada@example.com',
      emailVerified: true,
      level: 1,
      xp: 0,
      avatarUrl: null,
      preferredLanguage: 'python',
      preferences: {},
      badges: []
    }
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(jsonResponse(String(url).endsWith('/rounds') ? rounds : [event]))
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('US14 — arène et spectateur (T225)', () => {
  it('affiche la manche, suit les événements temps réel et bascule en spectateur', async () => {
    renderAt(`/events/${EVENT_ID}/arena`, <BattleRoyalePage />);

    expect(await screen.findByRole('heading', { name: 'Battle royale' })).toBeInTheDocument();
    expect(await screen.findByText('Manche 1')).toBeInTheDocument();
    expect(bus.lastEmit?.event).toBe('battle.subscribe');

    act(() => {
      bus.emit('round.started', {
        eventId: EVENT_ID,
        roundNumber: 1,
        challengeId: CHALLENGE_ID,
        endsAt: rounds[0]!.endsAt
      });
    });
    expect(await screen.findByText('En cours')).toBeInTheDocument();

    act(() => {
      bus.emit('participant.eliminated', {
        subjectId: SELF_ID,
        roundNumber: 1,
        remaining: 7,
        reason: 'lowest_score'
      });
    });
    expect(await screen.findByText(/Vous êtes éliminé/)).toBeInTheDocument();
  });

  it('présente une vue spectateur en lecture seule avec résultats et vainqueur', async () => {
    renderAt(`/events/${EVENT_ID}/spectate`, <SpectatorView />);

    expect(await screen.findByRole('heading', { name: 'Battle royale' })).toBeInTheDocument();
    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();

    act(() => {
      bus.emit('round.closed', {
        roundNumber: 1,
        results: [{ subjectId: '0199f100-0000-7000-8000-000000000005', score: 900 }]
      });
    });
    expect(await screen.findByText('900')).toBeInTheDocument();

    act(() => {
      bus.emit('event.finished', {
        eventId: EVENT_ID,
        winner: { subjectId: '0199f100-0000-7000-8000-000000000005', displayName: 'ada' }
      });
    });
    expect(await screen.findByText(/Vainqueur : ada/)).toBeInTheDocument();
  });
});
