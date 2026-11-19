import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionsPage } from './SessionsPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const sessions = [
  {
    id: 'session-1',
    userAgent: 'Firefox / macOS',
    ipPrefix: '203.0.113.0/24',
    createdAt: '2026-11-13T10:00:00.000Z',
    lastUsedAt: '2026-11-13T12:00:00.000Z',
    current: true
  },
  {
    id: 'session-2',
    userAgent: 'Safari / iOS',
    ipPrefix: '198.51.100.0/24',
    createdAt: '2026-11-12T10:00:00.000Z',
    lastUsedAt: '2026-11-12T12:00:00.000Z',
    current: false
  }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page des sessions (T062)', () => {
  it('liste les appareils, signale la session courante et révoque une autre session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessions))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse([sessions[0]]));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <SessionsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('Firefox / macOS')).toBeInTheDocument();
    expect(screen.getByText('Session courante')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.0\/24/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Révoquer : Safari/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/me/sessions/session-2',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
