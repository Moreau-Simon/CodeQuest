import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from '../services/auth';
import { useSessionStore } from '../stores/session';

/**
 * Synchronise le store Zustand avec `GET /api/v1/me` (T043).
 * Le cookie `HttpOnly` reste la seule source d'authentification : au montage,
 * une réponse 401 place simplement la session en `unauthenticated`.
 */
export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const setUser = useSessionStore((state) => state.setUser);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setStatus = useSessionStore((state) => state.setStatus);

  const query = useQuery({
    queryKey: ['session', 'me'],
    queryFn: ({ signal }) => fetchProfile(signal),
    retry: false,
    staleTime: 60_000
  });

  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);

  useEffect(() => {
    if (query.isError) clearSession();
  }, [query.isError, clearSession]);

  useEffect(() => {
    if (query.isPending) setStatus('unknown');
  }, [query.isPending, setStatus]);

  return <>{children}</>;
}
