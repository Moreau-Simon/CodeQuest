import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../services/auth';
import { useSessionStore } from '../../stores/session';
import { StegoChallengePage } from './StegoChallengePage';

const challenge = {
  id: 'challenge-1',
  title: 'Retrouver le message caché',
  theme: 'Stéganographie',
  type: 'steganography' as const,
  difficulty: 2,
  status: 'available' as const,
  bestScore: null,
  statement: 'Retrouvez le message dissimulé dans l’image, puis inversez les rôles.',
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
  assetId: 'asset-stego-1',
  seedFingerprint: '0123456789abcdef',
  objectKey: 'assets/steganography/challenge-1/0123456789abcdef.png',
  url: '/api/v1/assets/asset-stego-1/content',
  sha256: 'sha256',
  width: 800,
  height: 600,
  bytes: 1024,
  generatedAt: '2026-11-26T10:00:00Z',
  cached: false
};

function renderPage(): void {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/challenges/challenge-1/stego']}>
        <Routes>
          <Route path="/challenges/:challengeId/stego" element={<StegoChallengePage />} />
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

describe('page de stéganographie (T215)', () => {
  it('affiche un visualiseur zoomable et vérifie le message retrouvé sans exposer la graine', async () => {
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
            partial: { matchedFragments: 1, totalFragments: 1 },
            reason: null,
            elapsedMs: 2
          })
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const image = await screen.findByRole('img', { name: 'Image portant un message caché' });
    expect(image).toHaveAttribute('src', asset.url);
    expect(screen.queryByText(/test-assets-seed-key/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom avant' }));
    expect(screen.getByTestId('asset-viewer')).toHaveStyle({ transform: 'scale(1.25)' });

    fireEvent.change(screen.getByLabelText('Message retrouvé'), {
      target: { value: 'MESSAGE-TROUVE' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier le message' }));

    await waitFor(() => expect(screen.getByText('Message correct !')).toBeInTheDocument());
    const verifyCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/v1/assets/verify' && init?.method === 'POST'
    );
    expect(verifyCall).toBeDefined();
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toMatchObject({
      kind: 'steganography',
      answer: { assetId: asset.assetId, text: 'MESSAGE-TROUVE' }
    });
    expect(String(verifyCall?.[1]?.body)).not.toContain('test-assets-seed-key');
  });

  it('propose un atelier inverse où un message est caché puis retrouvé', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/v1/challenges/challenge-1') {
        return Promise.resolve(jsonResponse(challenge));
      }
      if (url === '/api/v1/assets/generate' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { payload?: string };
        return Promise.resolve(
          jsonResponse(
            {
              ...asset,
              assetId: body.payload ? 'asset-atelier' : asset.assetId,
              url: body.payload ? '/api/v1/assets/asset-atelier/content' : asset.url
            },
            201
          )
        );
      }
      if (url === '/api/v1/assets/verify' && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse({
            correct: true,
            partial: { matchedFragments: 1, totalFragments: 1 },
            reason: null,
            elapsedMs: 1
          })
        );
      }
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'introuvable' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await screen.findByRole('img', { name: 'Image portant un message caché' });

    fireEvent.change(screen.getByLabelText('Message à cacher'), {
      target: { value: 'MESSAGE-DE-ALICE' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cacher le message' }));

    const workshopImage = await screen.findByRole('img', { name: 'Image de l’atelier inverse' });
    expect(workshopImage).toHaveAttribute('src', '/api/v1/assets/asset-atelier/content');

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’atelier' }));
    expect(await screen.findByText('Message retrouvé par l’extracteur')).toBeInTheDocument();

    const atelierVerify = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/v1/assets/verify' &&
        init?.method === 'POST' &&
        String(init.body).includes('asset-atelier')
    );
    expect(JSON.parse(String(atelierVerify?.[1]?.body))).toMatchObject({
      answer: { assetId: 'asset-atelier', text: 'MESSAGE-DE-ALICE' }
    });
  });
});
