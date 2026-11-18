import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPage } from './CatalogPage';

const mockChallenges = [
  {
    id: 'ch-available',
    title: 'Défi Ouvert',
    theme: 'Algorithmes de tri',
    type: 'sorting',
    difficulty: 2,
    status: 'available',
    bestScore: null
  },
  {
    id: 'ch-locked',
    title: 'Défi Protégé',
    theme: 'Cryptographie',
    type: 'decryption',
    difficulty: 4,
    status: 'locked',
    bestScore: null,
    missingPrerequisites: ['Niveau 5 requis (niveau actuel : 1)', 'Défi « Défi Ouvert » requis']
  },
  {
    id: 'ch-completed',
    title: 'Défi Résolu',
    theme: 'Algorithmes de tri',
    type: 'sorting',
    difficulty: 1,
    status: 'completed',
    bestScore: 250
  }
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('CatalogPage (US5 - T127)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function renderCatalog(): void {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('affiche les défis avec leurs badges de difficulté et leurs statuts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: mockChallenges, nextCursor: null })
    );

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Défi Ouvert')).toBeInTheDocument();
      expect(screen.getByText('Défi Protégé')).toBeInTheDocument();
      expect(screen.getByText('Défi Résolu')).toBeInTheDocument();
    });

    // Badge disponible
    expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);

    // Badge verrouillé
    const lockedBadges = screen.getAllByText(/Verrouillé/i);
    expect(lockedBadges.length).toBeGreaterThan(0);

    // Badge complété
    expect(screen.getAllByText(/Validé/i).length).toBeGreaterThan(0);

    // Score affiché pour le défi complété
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('affiche les prérequis manquants pour les défis verrouillés', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ items: mockChallenges, nextCursor: null })
    );

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Défi Protégé')).toBeInTheDocument();
    });

    // L'élément avec tooltip contient les prérequis
    const lockedElement = screen.getByTitle(/Niveau 5 requis/i);
    expect(lockedElement).toBeInTheDocument();
    expect(lockedElement).toHaveAttribute(
      'title',
      expect.stringContaining('Défi « Défi Ouvert » requis')
    );
  });
});
