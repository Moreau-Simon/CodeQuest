import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BossPage } from './BossPage';

const BOSS_ID = '019a0000-0000-7000-8000-000000000001';
const PHASE_1 = '019a0000-0000-7000-8000-000000000002';
const PHASE_2 = '019a0000-0000-7000-8000-000000000003';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BossPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('boss et points de vie (T184)', () => {
  it('affiche les PV, les phases ordonnées et soumet la phase courante', async () => {
    const serverNow = new Date();
    const health = {
      hp: 60,
      maxHp: 100,
      koUntil: null,
      nextRegenAt: new Date(serverNow.getTime() + 6 * 60_000).toISOString(),
      serverNow: serverNow.toISOString()
    };
    const boss = {
      id: BOSS_ID,
      name: 'Dragon de la boucle',
      maxHp: 20,
      chapter: 'chapitre-3',
      hpRemaining: 10,
      defeated: false,
      phases: [
        { id: PHASE_1, order: 1, completed: true },
        { id: PHASE_2, order: 2, completed: false }
      ]
    };
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(
            {
              submissionId: '019a0000-0000-7000-8000-000000000004',
              bossPhaseId: PHASE_2,
              status: 'pending'
            },
            202
          )
        );
      }
      if (url.includes('/me/health')) return Promise.resolve(jsonResponse(health));
      return Promise.resolve(jsonResponse([boss]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Boss de chapitre' })).toBeInTheDocument();
    const bars = await screen.findAllByRole('progressbar');
    expect(bars[0]).toHaveAttribute('aria-valuenow', '60');
    expect(bars[1]).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
    expect(screen.getByText('Terminée')).toBeInTheDocument();
    expect(screen.getByText('À affronter')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Votre solution'), { target: { value: 'print(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la phase' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/bosses/${BOSS_ID}/phases/${PHASE_2}/submissions`),
        expect.objectContaining({ method: 'POST' })
      )
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Phase soumise');
  });

  it('affiche une erreur explicite quand la liste des boss ne charge pas', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/me/health')) {
        return Promise.resolve(
          jsonResponse({
            hp: 100,
            maxHp: 100,
            koUntil: null,
            nextRegenAt: null,
            serverNow: new Date().toISOString()
          })
        );
      }
      return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'Erreur' }, 500));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les boss');
    expect(screen.queryByText('Aucun boss disponible pour le moment.')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('annonce le KO serveur et verrouille la soumission', async () => {
    const serverNow = new Date();
    const health = {
      hp: 0,
      maxHp: 100,
      koUntil: new Date(serverNow.getTime() + 20 * 60_000).toISOString(),
      nextRegenAt: null,
      serverNow: serverNow.toISOString()
    };
    const boss = {
      id: BOSS_ID,
      name: 'Dragon de la boucle',
      maxHp: 20,
      chapter: 'chapitre-3',
      hpRemaining: 20,
      defeated: false,
      phases: [{ id: PHASE_1, order: 1, completed: false }]
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/me/health')) return Promise.resolve(jsonResponse(health));
      return Promise.resolve(jsonResponse([boss]));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByText(/Hors combat — retour dans 20 min/)).toBeInTheDocument();
    const code = await screen.findByLabelText('Votre solution');
    fireEvent.change(code, { target: { value: 'print(1)' } });
    expect(screen.getByRole('button', { name: 'Lancer la phase' })).toBeDisabled();
  });
});
