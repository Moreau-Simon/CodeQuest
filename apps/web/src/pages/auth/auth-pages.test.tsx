import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderPage(page: JSX.Element): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pages d’authentification (T061)', () => {
  it('inscrit un compte et annonce l’envoi du lien de confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201, headers: { 'Content-Length': '0' } }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage(<RegisterPage />);
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), {
      target: { value: 'ada@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Pseudo/), { target: { value: 'ada' } });
    fireEvent.change(screen.getByLabelText(/Mot de passe/), {
      target: { value: 'correct-horse-battery-staple' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Compte créé'));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/register');
    expect(JSON.parse(init.body)).toEqual({
      email: 'ada@example.com',
      pseudonym: 'ada',
      password: 'correct-horse-battery-staple'
    });
  });

  it('affiche le message de verrouillage renvoyé par l’API (423)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ code: 'ACCOUNT_LOCKED', message: 'Compte temporairement verrouillé' }, 423)
        )
    );

    renderPage(<LoginPage />);
    fireEvent.change(screen.getByLabelText(/E-mail ou pseudo/), {
      target: { value: 'ada@example.com' }
    });
    fireEvent.change(screen.getByLabelText(/Mot de passe/), {
      target: { value: 'mauvais-mot-de-passe' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Compte temporairement verrouillé')
    );
  });
});
