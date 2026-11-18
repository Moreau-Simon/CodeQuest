import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AuditLogPage } from './AuditLogPage';
import { ChallengeEditorPage } from './ChallengeEditorPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Pages d’administration (T113, T114, T115)', () => {
  it('affiche le tableau de bord avec les statistiques (T114)', async () => {
    const statsMock = {
      activeUsers: 42,
      totalSubmissions: 1337,
      passedSubmissions: 1000,
      pendingSubmissions: 3,
      successRate: 74.8,
      popularChallenges: [
        { challengeId: 'c-1', title: 'Tri fusion', difficulty: 2, submissionsCount: 250 }
      ]
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(statsMock)));

    render(
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Panneau d’administration')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('1337')).toBeInTheDocument();
      expect(screen.getByText('Tri fusion')).toBeInTheDocument();
    });
  });

  it('affiche le formulaire d’édition de défi (T113)', () => {
    render(
      <MemoryRouter>
        <ChallengeEditorPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Créateur de défi')).toBeInTheDocument();
    expect(screen.getByText('1. Enregistrer le brouillon')).toBeInTheDocument();
    expect(screen.getByText('2. Valider et calibrer la solution')).toBeInTheDocument();
  });

  it('affiche le journal d’audit avec les entrées (T115)', async () => {
    const logsMock = {
      items: [
        {
          id: 'log-1',
          actorId: 'user-admin',
          action: 'challenge.validated',
          targetType: 'challenge',
          targetId: 'ch-123',
          metadata: {},
          ipPrefix: '127.0.0.1',
          createdAt: new Date().toISOString()
        }
      ],
      nextCursor: null
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(logsMock)));

    render(
      <MemoryRouter>
        <AuditLogPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Journal d’audit immuable')).toBeInTheDocument();
      expect(screen.getByText('challenge.validated')).toBeInTheDocument();
    });
  });
});
