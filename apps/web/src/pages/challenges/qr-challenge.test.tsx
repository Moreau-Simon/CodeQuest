import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import { useSessionStore } from '../../stores/session';
import { QrChallengePage } from './QrChallengePage';

const challenge = {
  id: 'challenge-1',
  title: 'Décoder un QR dégradé',
  theme: 'QR code',
  type: 'qr_code' as const,
  difficulty: 3,
  status: 'available' as const,
  bestScore: null,
  statement: 'Reconstituez les fragments et retrouvez le contenu du QR code.',
  languages: [],
  basePoints: 100,
  perfMax: 50,
  currentVersion: 1,
  hints: [],
  missingPrerequisites: []
};

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

const asset = {
  assetId: 'asset-qr-1',
  seedFingerprint: 'abcdef0123456789',
  objectKey: 'assets/qr_code/challenge-1/abcdef0123456789.png',
  url: '/api/v1/assets/asset-qr-1/content',
  sha256: 'sha256',
  width: 800,
  height: 600,
  bytes: 2048,
  generatedAt: '2026-11-26T10:00:00Z',
  cached: false
};

function renderPage(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/challenges/challenge-1/qr']}>
        <Routes>
          <Route path="/challenges/:challengeId/qr" element={<QrChallengePage />} />
        </Routes>
      </MemoryRouter>
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

describe('page de QR code (T215)', () => {
  it('génère un QR fragmenté, permet le zoom et valide le contenu sans révéler la graine', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/v1/challenges/challenge-1') {
        return Promise.resolve(jsonResponse(challenge));
      }
      if (url === '/api/v1/assets/generate' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse(asset, 201));
      }
      if (url === '/api/v1/assets/verify' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            correct: true,
            partial: { matchedFragments: 4, totalFragments: 4 },
            reason: null,
            elapsedMs: 3
          })
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    expect(await screen.findByRole('img', { name: 'QR code fragmenté' })).toHaveAttribute(
      'src',
      asset.url
    );
    expect(screen.getByText('Fragments : 4 / 4')).toBeInTheDocument();

    const generateCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/v1/assets/generate' && init?.method === 'POST'
    );
    expect(JSON.parse(String(generateCall?.[1]?.body))).toMatchObject({
      kind: 'qr_code',
      qrStyle: { fragments: 4 }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom avant' }));
    expect(screen.getByTestId('asset-viewer')).toHaveStyle({ transform: 'scale(1.25)' });

    fireEvent.change(screen.getByLabelText('Contenu du QR code'), {
      target: { value: 'CONTENU-QR' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier le QR code' }));

    await waitFor(() => expect(screen.getByText('QR code correct !')).toBeInTheDocument());
    expect(screen.getByText('Fragments : 4 / 4')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('test-assets-seed-key');
  });
});
