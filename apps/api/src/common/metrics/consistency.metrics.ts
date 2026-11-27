import { Counter, type Registry } from 'prom-client';
import type { IntegrityIssue, IntegrityReport } from '../../modules/ops/restore-integrity';

/** T260 [US17] (SC-021) : compteurs de cohérence exposés à Prometheus. */
export interface ConsistencyMetrics {
  recordIssue(type: IntegrityIssue['type'], subjectId: string): void;
  recordReport(report: IntegrityReport): void;
}

export function createConsistencyMetrics(registry: Registry): ConsistencyMetrics {
  const ledgerMismatch = new Counter({
    name: 'ledger_balance_mismatch_total',
    help: "Nombre d'incohérences solde/registre détectées",
    labelNames: ['subject'] as const,
    registers: [registry]
  });
  const leaderboardDrift = new Counter({
    name: 'leaderboard_drift_total',
    help: "Nombre d'écarts entre classement et meilleurs scores",
    labelNames: ['subject'] as const,
    registers: [registry]
  });

  return {
    recordIssue(type, subjectId) {
      if (type === 'ledger_balance_mismatch') ledgerMismatch.inc({ subject: subjectId });
      if (type === 'leaderboard_drift') leaderboardDrift.inc({ subject: subjectId });
    },
    recordReport(report) {
      for (const issue of report.issues) this.recordIssue(issue.type, issue.subjectId);
    }
  };
}
