import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../../services/auth';
import { useSessionStore } from '../../stores/session';
import { RequireAuth } from './RequireAuth';

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

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/profile" element={<p>Contenu privé</p>} />
        </Route>
        <Route path="/login" element={<p>Page de connexion</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useSessionStore.setState({ status: 'unknown', user: null });
});

describe('RequireAuth', () => {
  it('affiche un squelette annoncé pendant la vérification', () => {
    renderProtected();
    expect(screen.getByRole('status')).toHaveTextContent('Vérification de votre session…');
    expect(screen.queryByText('Contenu privé')).not.toBeInTheDocument();
  });

  it('redirige vers la connexion sans session', () => {
    useSessionStore.setState({ status: 'unauthenticated', user: null });
    renderProtected();
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('rend la zone protégée quand la session est active', () => {
    useSessionStore.setState({ status: 'authenticated', user: profile });
    renderProtected();
    expect(screen.getByText('Contenu privé')).toBeInTheDocument();
  });
});
