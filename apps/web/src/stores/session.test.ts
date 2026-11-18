import { beforeEach, describe, expect, it } from 'vitest';
import type { Profile } from '../services/auth';
import { selectIsAuthenticated, selectPseudonym, useSessionStore } from './session';

const profile: Profile = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 4,
  xp: 900,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: {},
  badges: []
};

beforeEach(() => {
  useSessionStore.setState({ status: 'unknown', user: null });
});

describe('store de session', () => {
  it('démarre sans profil en attente de vérification', () => {
    const state = useSessionStore.getState();
    expect(state.status).toBe('unknown');
    expect(selectIsAuthenticated(state)).toBe(false);
  });

  it('passe en authentifié quand le profil arrive', () => {
    useSessionStore.getState().setUser(profile);
    const state = useSessionStore.getState();
    expect(state.status).toBe('authenticated');
    expect(selectIsAuthenticated(state)).toBe(true);
    expect(selectPseudonym(state)).toBe('ada');
  });

  it('efface le profil à la déconnexion', () => {
    useSessionStore.getState().setUser(profile);
    useSessionStore.getState().clearSession();
    const state = useSessionStore.getState();
    expect(state.status).toBe('unauthenticated');
    expect(state.user).toBeNull();
    expect(selectIsAuthenticated(state)).toBe(false);
  });
});
