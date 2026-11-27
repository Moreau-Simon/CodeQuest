import { verifyRestoreIntegrity } from '../../src/modules/ops/restore-integrity';

/** T251 [P] [US17] (FR-117, SC-014, SC-021) : intégrité après restauration. */
const RESTORED_AT = new Date('2026-11-27T10:00:00.000Z');

const HEALTHY = {
  users: [
    { id: 'u1', status: 'active', deletedAt: null },
    { id: 'u2', status: 'deleted', deletedAt: RESTORED_AT }
  ],
  wallets: [
    {
      userId: 'u1',
      balance: 100,
      transactions: [{ amount: 60 }, { amount: 40 }]
    },
    { userId: 'u2', balance: 0, transactions: [] }
  ],
  bestScores: [{ scopeType: 'global', scopeId: 'g1', subjectId: 'u1', score: 12.5 }],
  leaderboardEntries: [
    { scopeType: 'global', scopeId: 'g1', subjectId: 'u1', score: 12.5, rank: 1 }
  ]
} as const;

describe('Intégrité après restauration (T251 / SC-014, SC-021)', () => {
  it('valide une restauration cohérente', () => {
    const result = verifyRestoreIntegrity(HEALTHY);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('détecte un solde qui ne correspond plus au registre', () => {
    const result = verifyRestoreIntegrity({
      ...HEALTHY,
      wallets: [{ userId: 'u1', balance: 99, transactions: [{ amount: 60 }, { amount: 40 }] }]
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ledger_balance_mismatch', subjectId: 'u1' })
      ])
    );
  });

  it('détecte une dérive du classement après restauration', () => {
    const result = verifyRestoreIntegrity({
      ...HEALTHY,
      leaderboardEntries: [
        { scopeType: 'global', scopeId: 'g1', subjectId: 'u1', score: 11, rank: 1 }
      ]
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'leaderboard_drift', subjectId: 'u1' })
      ])
    );
  });

  it('détecte un état de compte incohérent', () => {
    const result = verifyRestoreIntegrity({
      ...HEALTHY,
      users: [{ id: 'u1', status: 'deleted', deletedAt: null }]
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'account_state_inconsistent', subjectId: 'u1' })
      ])
    );
  });
});
