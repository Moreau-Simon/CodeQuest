import { useEffect, useState } from 'react';
import { Button, Input, Skeleton } from '../../components/ui';
import {
  assignUserRole,
  fetchAdminUsers,
  revokeUserRole,
  updateUserStatus,
  type AdminUser
} from '../../services/admin';

/**
 * Administration des utilisateurs et des rôles (T115, FR-088).
 */
export function UsersAdminPage(): JSX.Element {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusActionPending, setStatusActionPending] = useState<string | null>(null);

  const loadUsers = (cursor?: string) => {
    setLoading(true);
    fetchAdminUsers(cursor)
      .then((res) => {
        setUsers(res.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError((err as Error).message || 'Erreur lors du chargement des utilisateurs');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleRole = async (userId: string, role: string, hasRole: boolean) => {
    try {
      if (hasRole) {
        await revokeUserRole(userId, role);
      } else {
        await assignUserRole(userId, role);
      }
      loadUsers();
    } catch (err: unknown) {
      alert((err as Error).message || 'Erreur lors de la mise à jour du rôle');
    }
  };

  const handleToggleStatus = async (user: AdminUser) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    setStatusActionPending(user.id);
    try {
      await updateUserStatus(user.id, nextStatus, 'Action administrative');
      loadUsers();
    } catch (err: unknown) {
      alert((err as Error).message || 'Erreur lors du changement de statut');
    } finally {
      setStatusActionPending(null);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.pseudonym.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestion des utilisateurs</h1>
          <p className="mt-1 text-muted">
            Contrôle des statuts, suspension et attribution des rôles RBAC
          </p>
        </div>
      </div>

      <div className="mt-6 flex max-w-md items-center gap-3">
        <Input
          placeholder="Rechercher par pseudo ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && <div className="mt-4 rounded-xl bg-error/10 p-4 text-sm text-error">{error}</div>}

      {loading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-elevated/50 text-xs text-muted uppercase">
              <tr>
                <th className="px-6 py-3">Utilisateur</th>
                <th className="px-6 py-3">Statut</th>
                <th className="px-6 py-3">Rôles</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isModerator = u.roles.includes('moderator');
                  const isAdmin = u.roles.includes('admin');

                  return (
                    <tr key={u.id} className="hover:bg-elevated/20">
                      <td className="px-6 py-4">
                        <div className="font-medium">{u.pseudonym}</div>
                        <div className="text-xs text-muted">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.status === 'active'
                              ? 'bg-success/15 text-success'
                              : u.status === 'suspended'
                                ? 'bg-error/15 text-error'
                                : 'bg-muted/15 text-muted'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleRole(u.id, 'moderator', isModerator)}
                            className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                              isModerator
                                ? 'bg-primary text-surface'
                                : 'border border-border text-muted hover:border-primary'
                            }`}
                          >
                            Modo {isModerator ? '✓' : '+'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleRole(u.id, 'admin', isAdmin)}
                            className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                              isAdmin
                                ? 'bg-primary text-surface'
                                : 'border border-border text-muted hover:border-primary'
                            }`}
                          >
                            Admin {isAdmin ? '✓' : '+'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          disabled={statusActionPending === u.id}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
