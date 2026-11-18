import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { t } from '../../i18n';
import { useSessionStore } from '../../stores/session';
import { Skeleton } from '../ui';

/**
 * Zone authentifiée (T043) : tant que la session est inconnue, un squelette
 * annoncé évite un flash de contenu ; sans session, redirection vers la page
 * de connexion en mémorisant la destination d'origine.
 */
export function RequireAuth(): JSX.Element {
  const status = useSessionStore((state) => state.status);
  const location = useLocation();

  if (status === 'unknown') {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16">
        <Skeleton label={t('session.loading')} className="h-6 w-1/3" />
      </section>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
