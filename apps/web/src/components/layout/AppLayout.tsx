import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { t } from '../../i18n';
import { logout } from '../../services/auth';
import { selectIsAuthenticated, selectPseudonym, useSessionStore } from '../../stores/session';
import { Button } from '../ui';

const NAV_ITEMS = [
  { to: '/challenges', key: 'nav.challenges' },
  { to: '/lessons', key: 'nav.lessons' },
  { to: '/lore', key: 'nav.lore' },
  { to: '/leaderboards', key: 'nav.leaderboards' },
  { to: '/teams', key: 'nav.teams' },
  { to: '/events', key: 'nav.events' },
  { to: '/bosses', key: 'nav.bosses' },
  { to: '/shop', key: 'nav.shop' },
  { to: '/wallet', key: 'nav.wallet' }
] as const;

/**
 * Coquille de l'application (T043) : lien d'évitement, navigation principale
 * avec `aria-current`, zone de contenu ciblable et pied de page.
 */
export function AppLayout(): JSX.Element {
  const authenticated = useSessionStore(selectIsAuthenticated);
  const pseudonym = useSessionStore(selectPseudonym);
  const reducedMotion = useSessionStore((state) => state.user?.preferences?.reducedMotion === true);
  const clearSession = useSessionStore((state) => state.clearSession);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  function onLogout(): void {
    // L'interface se déconnecte immédiatement ; l'appel réseau révoque la
    // session côté serveur sans bloquer la navigation.
    clearSession();
    queryClient.removeQueries({ queryKey: ['session', 'me'] });
    navigate('/');
    void logout().catch(() => undefined);
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-surface"
      data-motion={reducedMotion ? 'reduced' : undefined}
    >
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-elevated focus:px-4 focus:py-2"
      >
        {t('common.skipToContent')}
      </a>

      <header className="border-b border-elevated">
        <nav
          aria-label={t('nav.main')}
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-4"
        >
          <Link to="/" className="font-bold text-ink no-underline">
            {t('app.name')}
          </Link>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `no-underline ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {authenticated ? (
              <>
                <NavLink
                  to="/settings/profile"
                  className="text-sm text-muted no-underline hover:text-ink"
                >
                  {pseudonym}
                </NavLink>
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  {t('nav.logout')}
                </Button>
              </>
            ) : (
              <NavLink to="/login" className="text-muted no-underline hover:text-ink">
                {t('nav.login')}
              </NavLink>
            )}
          </div>
        </nav>
      </header>

      <main id="contenu" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="border-t border-elevated py-6 text-center text-sm text-muted">
        {t('app.footer')}
      </footer>
    </div>
  );
}
