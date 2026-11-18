import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui';
import { fetchAdminStats, type AdminStats } from '../../services/admin';

/**
 * Tableau de bord administrateur (T114, FR-083).
 * Affiche les statistiques clés : utilisateurs actifs, soumissions, taux de réussite,
 * défis populaires et état de la file.
 */
export function AdminDashboardPage(): JSX.Element {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminStats(controller.signal)
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'Erreur lors du chargement des statistiques');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panneau d’administration</h1>
          <p className="mt-1 text-muted">
            Supervision globale, gestion du contenu et des utilisateurs
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/admin/challenges/new"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-surface transition hover:brightness-110"
          >
            Nouveau défi
          </Link>
          <Link
            to="/admin/users"
            className="rounded-lg bg-elevated px-4 py-2 font-medium transition hover:brightness-110"
          >
            Utilisateurs
          </Link>
          <Link
            to="/admin/audit"
            className="rounded-lg bg-elevated px-4 py-2 font-medium transition hover:brightness-110"
          >
            Journal d’audit
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="mt-8 rounded-xl bg-error/10 p-6 text-error">
          <p>{error}</p>
        </div>
      ) : stats ? (
        <div className="mt-8 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-medium text-muted">Utilisateurs actifs</span>
              <p className="mt-2 text-3xl font-bold">{stats.activeUsers}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-medium text-muted">Soumissions totales</span>
              <p className="mt-2 text-3xl font-bold">{stats.totalSubmissions}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-medium text-muted">Taux de réussite</span>
              <p className="mt-2 text-3xl font-bold">{stats.successRate} %</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="text-sm font-medium text-muted">En file d’attente</span>
              <p className="mt-2 text-3xl font-bold">{stats.pendingSubmissions}</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-xl font-semibold">Défis les plus populaires</h2>
            {stats.popularChallenges.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Aucune donnée disponible pour le moment.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {stats.popularChallenges.map((c) => (
                  <li key={c.challengeId} className="flex items-center justify-between py-3">
                    <div>
                      <span className="font-medium">{c.title}</span>
                      <span className="ml-3 rounded bg-elevated px-2 py-0.5 text-xs text-muted">
                        Diff. {c.difficulty}
                      </span>
                    </div>
                    <span className="text-sm text-muted">{c.submissionsCount} soumissions</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
