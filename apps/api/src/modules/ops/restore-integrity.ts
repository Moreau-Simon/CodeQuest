/**
 * Contrôle d'intégrité après restauration (T251, FR-117, SC-014, SC-021).
 *
 * Vérifie les trois invariants critiques : solde = somme du registre, scores
 * du classement = meilleurs scores conservés, cohérence des états de compte.
 */

export interface IntegrityIssue {
  readonly type: 'ledger_balance_mismatch' | 'leaderboard_drift' | 'account_state_inconsistent';
  readonly subjectId: string;
  readonly expected: number | string;
  readonly actual: number | string;
}

export interface RestoreSnapshot {
  readonly users: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly deletedAt: Date | null;
  }>;
  readonly wallets: ReadonlyArray<{
    readonly userId: string;
    readonly balance: number;
    readonly transactions: ReadonlyArray<{ readonly amount: number }>;
  }>;
  readonly bestScores: ReadonlyArray<{
    readonly scopeType: string;
    readonly scopeId: string;
    readonly subjectId: string;
    readonly score: number | string;
  }>;
  readonly leaderboardEntries: ReadonlyArray<{
    readonly scopeType: string;
    readonly scopeId: string;
    readonly subjectId: string;
    readonly score: number | string;
    readonly rank?: number;
  }>;
}

export interface IntegrityReport {
  readonly ok: boolean;
  readonly issues: readonly IntegrityIssue[];
  readonly checkedAt: Date;
}

function keyOf(entry: { scopeType: string; scopeId: string; subjectId: string }): string {
  return `${entry.scopeType}:${entry.scopeId}:${entry.subjectId}`;
}

/**
 * Compare un instantané restauré avec les sources de vérité. Fonction pure :
 * l'adaptateur Prisma peut fournir les mêmes données depuis la base restaurée.
 */
export function verifyRestoreIntegrity(snapshot: RestoreSnapshot): IntegrityReport {
  const issues: IntegrityIssue[] = [];

  for (const wallet of snapshot.wallets) {
    const expected = wallet.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    if (expected !== wallet.balance) {
      issues.push({
        type: 'ledger_balance_mismatch',
        subjectId: wallet.userId,
        expected,
        actual: wallet.balance
      });
    }
  }

  const bestByKey = new Map<string, number>();
  for (const score of snapshot.bestScores) {
    const value = Number(score.score);
    const key = keyOf(score);
    bestByKey.set(key, (bestByKey.get(key) ?? 0) + value);
  }
  for (const entry of snapshot.leaderboardEntries) {
    const expected = bestByKey.get(keyOf(entry)) ?? 0;
    const actual = Number(entry.score);
    if (expected !== actual) {
      issues.push({
        type: 'leaderboard_drift',
        subjectId: entry.subjectId,
        expected,
        actual
      });
    }
  }

  for (const user of snapshot.users) {
    const deleted = user.status === 'deleted';
    if (deleted !== (user.deletedAt !== null)) {
      issues.push({
        type: 'account_state_inconsistent',
        subjectId: user.id,
        expected: deleted ? 'deletedAt renseigné' : 'deletedAt vide',
        actual: user.deletedAt ? 'deletedAt renseigné' : 'deletedAt vide'
      });
    }
  }

  return { ok: issues.length === 0, issues, checkedAt: new Date() };
}
