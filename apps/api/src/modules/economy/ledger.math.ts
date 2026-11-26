/** Entrée minimale d'une écriture du registre (T185, FR-073). */
export interface LedgerMovement {
  readonly amount: number;
}

/** Solde insuffisant : aucun mouvement n'est appliqué. */
export class InsufficientFundsError extends Error {
  constructor() {
    super('Solde de Bits insuffisant');
    this.name = 'InsufficientFundsError';
  }
}

/** Le cache `wallets.balance` diverge de la somme du registre (SC-021). */
export class LedgerInconsistencyError extends Error {
  constructor(balance: number, expected: number) {
    super(`Solde incohérent : ${balance} attendu, registre à ${expected}`);
    this.name = 'LedgerInconsistencyError';
  }
}

function assertInteger(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError('Le montant du registre doit être un entier');
  }
}

/** Calcule le solde suivant sans jamais autoriser un découvert. */
export function applyMovement(balance: number, amount: number): number {
  assertInteger(balance);
  assertInteger(amount);
  const next = balance + amount;
  if (next < 0) throw new InsufficientFundsError();
  return next;
}

/** Source de vérité du solde : somme signée du registre. */
export function balanceFromTransactions(transactions: readonly LedgerMovement[]): number {
  return transactions.reduce((sum, transaction) => {
    assertInteger(transaction.amount);
    return sum + transaction.amount;
  }, 0);
}

/** Contrôle de cohérence périodique du cache de solde (SC-021). */
export function assertLedgerBalance(
  balance: number,
  transactions: readonly LedgerMovement[]
): void {
  const expected = balanceFromTransactions(transactions);
  if (balance !== expected) throw new LedgerInconsistencyError(balance, expected);
}

/**
 * Clé d'idempotence normalisée et isolée par opération : la même clé peut être
 * réutilisée pour un achat et pour une récompense sans collision (FR-076).
 */
export function idempotencyKeyFor(scope: string, key: string): string {
  const normalized = key.trim().toLowerCase();
  if (!normalized) {
    throw new TypeError('La clé d’idempotence ne peut pas être vide');
  }
  return `${scope}:${normalized}`;
}
