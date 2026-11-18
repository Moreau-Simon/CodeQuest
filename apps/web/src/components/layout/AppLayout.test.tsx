import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../../services/auth';
import { useSessionStore } from '../../stores/session';
import { AppLayout } from './AppLayout';

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

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/challenges']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/challenges" element={<p>Liste des défis</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useSessionStore.setState({ status: 'unauthenticated', user: null });
});

describe('AppLayout', () => {
  it('fournit un lien d’évitement et une navigation principale', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute(
      'href',
      '#contenu'
    );
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Liste des défis');
  });

  it('marque la page courante avec aria-current', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Défis' })).toHaveAttribute('aria-current', 'page');
  });

  it('affiche le pseudo et la déconnexion quand la session est active', () => {
    useSessionStore.setState({ status: 'authenticated', user: profile });
    renderLayout();

    expect(screen.getByText('ada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));
    expect(useSessionStore.getState().status).toBe('unauthenticated');
  });

  it('propose un lien de connexion sans session', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', '/login');
  });
});
