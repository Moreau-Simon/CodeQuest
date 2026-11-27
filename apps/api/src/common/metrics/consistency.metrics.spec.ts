import { Registry } from 'prom-client';
import { createConsistencyMetrics } from './consistency.metrics';
import { verifyRestoreIntegrity } from '../../modules/ops/restore-integrity';

/** T260 [US17] (SC-021) : compteurs de cohérence ledger/classement. */
describe('Métriques de cohérence (T260 / SC-021)', () => {
  it('expose les deux compteurs avec un libellé de type', async () => {
    const registry = new Registry();
    const metrics = createConsistencyMetrics(registry);

    metrics.recordIssue('ledger_balance_mismatch', 'user-1');
    metrics.recordIssue('leaderboard_drift', 'user-1');

    const rendered = await registry.metrics();
    expect(rendered).toContain('ledger_balance_mismatch_total');
    expect(rendered).toContain('leaderboard_drift_total');
    expect(rendered).toContain('subject="user-1"');
  });

  it('enregistre les issues d’un contrôle de restauration', async () => {
    const registry = new Registry();
    const metrics = createConsistencyMetrics(registry);
    const report = verifyRestoreIntegrity({
      users: [{ id: 'u1', status: 'active', deletedAt: null }],
      wallets: [{ userId: 'u1', balance: 5, transactions: [{ amount: 9 }] }],
      bestScores: [],
      leaderboardEntries: []
    });

    expect(report.ok).toBe(false);
    metrics.recordReport(report);

    expect(await registry.metrics()).toContain('ledger_balance_mismatch_total{subject="u1"} 1');
  });
});
