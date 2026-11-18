import { useEffect, useState } from 'react';
import { Button, Input, Skeleton } from '../../components/ui';
import { fetchAuditLogs, type AdminAuditLog } from '../../services/admin';

/**
 * Consultation du journal d'audit append-only (T115, FR-089).
 */
export function AuditLogPage(): JSX.Element {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadLogs = (cursor?: string, actorId?: string) => {
    setLoading(true);
    fetchAuditLogs({ cursor, actorId: actorId || undefined })
      .then((res) => {
        if (cursor) {
          setLogs((prev) => [...prev, ...res.items]);
        } else {
          setLogs(res.items);
        }
        setNextCursor(res.nextCursor);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Erreur lors du chargement des journaux');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadLogs(undefined, actorIdFilter);
  }, []);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs(undefined, actorIdFilter);
  };

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Journal d’audit immuable</h1>
        <p className="mt-1 text-muted">
          Registre append-only de toutes les actions administratives et de sécurité (FR-089)
        </p>
      </div>

      <form onSubmit={handleApplyFilter} className="mt-6 flex max-w-lg items-center gap-3">
        <Input
          placeholder="Filtrer par UUID d'acteur..."
          value={actorIdFilter}
          onChange={(e) => setActorIdFilter(e.target.value)}
        />
        <Button type="submit">Filtrer</Button>
      </form>

      {error && <div className="mt-4 rounded-xl bg-error/10 p-4 text-sm text-error">{error}</div>}

      {loading && logs.length === 0 ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm font-mono">
              <thead className="border-b border-border bg-elevated/50 text-xs text-muted uppercase font-sans">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Cible</th>
                  <th className="px-6 py-3">Acteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted font-sans">
                      Aucune entrée d'audit trouvée.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-elevated/20">
                      <td className="px-6 py-3 text-xs text-muted">
                        {new Date(log.createdAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-6 py-3 font-semibold text-primary">{log.action}</td>
                      <td className="px-6 py-3 text-xs">
                        <span className="text-muted">{log.targetType}</span>
                        {log.targetId && ` : ${log.targetId.slice(0, 8)}...`}
                      </td>
                      <td className="px-6 py-3 text-xs text-muted">
                        {log.actorId ? `${log.actorId.slice(0, 8)}...` : 'système'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => loadLogs(nextCursor, actorIdFilter)}
              >
                {loading ? 'Chargement...' : 'Charger plus d’entrées'}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
