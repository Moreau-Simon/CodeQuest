import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import { useSessionStore } from '../../stores/session';
import { ShopPage } from './ShopPage';
import { WalletPage } from './WalletPage';

const ITEM_ID = '019a0000-0000-7000-8000-000000000011';
const COSMETIC_ID = '019a0000-0000-7000-8000-000000000012';

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderPage(element: JSX.Element): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useSessionStore.setState({ status: 'authenticated', user: profile });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useSessionStore.setState({ status: 'unauthenticated', user: null });
});

describe('boutique et portefeuille (T195)', () => {
  it('affiche le catalogue, confirme l’achat et envoie une clé d’idempotence', async () => {
    let balance = 120;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        balance = 70;
        return Promise.resolve(
          jsonResponse(
            {
              itemId: ITEM_ID,
              sku: 'potion-test',
              priceBits: 50,
              balance,
              quantity: 1
            },
            201
          )
        );
      }
      if (url.includes('/me/wallet')) {
        return Promise.resolve(
          jsonResponse({
            balance,
            recentTransactions: [
              {
                id: '019a0000-0000-7000-8000-000000000013',
                amount: 120,
                reason: 'admin_adjustment',
                balanceAfter: 120,
                createdAt: '2030-08-01T10:00:00.000Z'
              }
            ]
          })
        );
      }
      return Promise.resolve(
        jsonResponse([
          {
            id: ITEM_ID,
            sku: 'potion-test',
            name: 'Potion',
            kind: 'potion',
            priceBits: 50,
            available: true
          },
          {
            id: COSMETIC_ID,
            sku: 'avatar-test',
            name: 'Avatar',
            kind: 'avatar',
            priceBits: 200,
            available: true
          }
        ])
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(<ShopPage />);

    expect(await screen.findByRole('heading', { name: 'Boutique' })).toBeInTheDocument();
    expect(await screen.findByText(/120 Bits/)).toBeInTheDocument();
    expect(await screen.findByText('Potion')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Acheter' })[0]!);
    expect(screen.getByRole('dialog')).toHaveTextContent('Confirmer l’achat');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/shop/${ITEM_ID}/purchase`),
        expect.objectContaining({ method: 'POST' })
      )
    );
    const purchaseCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/purchase'));
    expect(new Headers(purchaseCall?.[1]?.headers).get('Idempotency-Key')).toBeTruthy();
    expect(await screen.findByRole('status')).toHaveTextContent('Achat confirmé');
    expect(await screen.findByText(/70 Bits/)).toBeInTheDocument();
  });

  it('affiche une erreur explicite quand le catalogue ne charge pas', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/me/wallet')) {
        return Promise.resolve(jsonResponse({ balance: 120, recentTransactions: [] }));
      }
      return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'Erreur' }, 500));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage(<ShopPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la boutique');
    expect(screen.queryByText('Aucun objet disponible pour le moment.')).not.toBeInTheDocument();
  });

  it('invite à se connecter quand la session n’est pas authentifiée', () => {
    useSessionStore.setState({ status: 'unauthenticated', user: null });

    renderPage(<ShopPage />);

    expect(screen.getByRole('link', { name: /Se connecter/ })).toHaveAttribute('href', '/login');
  });

  it('affiche l’historique signé du portefeuille', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            balance: 80,
            recentTransactions: [
              {
                id: '019a0000-0000-7000-8000-000000000014',
                amount: -20,
                reason: 'potion_purchase',
                balanceAfter: 80,
                createdAt: '2030-08-01T10:05:00.000Z'
              }
            ]
          })
        )
      )
    );

    renderPage(<WalletPage />);

    expect(await screen.findByRole('heading', { name: 'Portefeuille' })).toBeInTheDocument();
    expect(await screen.findByText(/80 Bits/)).toBeInTheDocument();
    expect(await screen.findByText(/-20 Bits/)).toBeInTheDocument();
    expect(await screen.findByText('potion_purchase')).toBeInTheDocument();
  });
});
