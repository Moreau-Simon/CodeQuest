import { create } from 'zustand';
import type { Profile } from '../services/auth';

export type SessionStatus = 'unknown' | 'unauthenticated' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  user: Profile | null;
  setUser(user: Profile): void;
  clearSession(): void;
  setStatus(status: SessionStatus): void;
}

/**
 * Store Zustand de session (T043).
 *
 * La source de vérité reste le cookie `HttpOnly` côté serveur : ce store ne
 * conserve que le profil public nécessaire au rendu. Aucun jeton d'accès n'est
 * stocké en JavaScript (principe II).
 */
export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  user: null,
  setUser: (user) => set({ user, status: 'authenticated' }),
  clearSession: () => set({ user: null, status: 'unauthenticated' }),
  setStatus: (status) => set({ status })
}));

export const selectIsAuthenticated = (state: SessionState): boolean =>
  state.status === 'authenticated' && state.user !== null;

export const selectPseudonym = (state: SessionState): string | null =>
  state.user?.pseudonym ?? null;
