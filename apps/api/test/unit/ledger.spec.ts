import {
  applyMovement,
  assertLedgerBalance,
  balanceFromTransactions,
  idempotencyKeyFor,
  InsufficientFundsError,
  LedgerInconsistencyError
} from '../../src/modules/economy/ledger.math';

/**
 * T185 [P] [US11] — écrit avant l'implémentation (constitution IV).
 *
 * FR-073/SC-021 : le solde est dérivé du registre, les montants sont signés,
 * et une clé d'idempotence ne peut ni être vide ni entrer en collision entre opérations.
 */
describe('Registre de Bits — invariants (T185)', () => {
  it('dérive le solde de la somme signée des transactions', () => {
    expect(
      balanceFromTransactions([
        { amount: 1_000 },
        { amount: -120 },
        { amount: 40 },
        { amount: -20 }
      ])
    ).toBe(900);
    expect(balanceFromTransactions([])).toBe(0);
  });

  it('applique un crédit et un débit sans jamais rendre le solde négatif', () => {
    expect(applyMovement(500, 120)).toBe(620);
    expect(applyMovement(500, -120)).toBe(380);
    expect(applyMovement(120, -120)).toBe(0);
    expect(() => applyMovement(119, -120)).toThrow(InsufficientFundsError);
  });

  it('refuse les montants non entiers', () => {
    expect(() => applyMovement(100, 1.5)).toThrow(/entier/i);
    expect(() => balanceFromTransactions([{ amount: Number.NaN }])).toThrow(/entier/i);
  });

  it('détecte un solde qui ne correspond plus au registre', () => {
    expect(() => assertLedgerBalance(900, [{ amount: 1_000 }, { amount: -100 }])).not.toThrow();
    expect(() => assertLedgerBalance(899, [{ amount: 1_000 }, { amount: -100 }])).toThrow(
      LedgerInconsistencyError
    );
  });

  it('construit une clé d’idempotence stable, normalisée et isolée par portée', () => {
    const purchase = idempotencyKeyFor('purchase', '  Panier-123  ');
    expect(purchase).toBe(idempotencyKeyFor('purchase', 'Panier-123'));
    expect(purchase).not.toBe(idempotencyKeyFor('reward', 'Panier-123'));
    expect(() => idempotencyKeyFor('purchase', '   ')).toThrow(/idempotence/i);
  });
});
