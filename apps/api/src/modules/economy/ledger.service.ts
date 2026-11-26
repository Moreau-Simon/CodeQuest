import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, TransactionReason } from '@prisma/client';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import {
  applyMovement,
  assertLedgerBalance,
  idempotencyKeyFor,
  InsufficientFundsError
} from './ledger.math';

export interface LedgerMovementInput {
  readonly userId: string;
  /** Montant signé : positif pour un crédit, négatif pour un débit. */
  readonly amount: number;
  readonly reason: TransactionReason;
  readonly idempotencyKey: string;
  readonly referenceType?: string;
  readonly referenceId?: string;
  readonly createdBy?: string;
}

export interface TransactionView {
  id: string;
  amount: number;
  reason: TransactionReason;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  balanceAfter: number;
  createdAt: string;
}

export interface WalletView {
  balance: number;
  recentTransactions: TransactionView[];
}

type TransactionRow = Prisma.TransactionGetPayload<{
  select: {
    id: true;
    amount: true;
    reason: true;
    referenceType: true;
    referenceId: true;
    idempotencyKey: true;
    balanceAfter: true;
    createdAt: true;
  };
}>;

const TRANSACTION_SELECT = {
  id: true,
  amount: true,
  reason: true,
  referenceType: true,
  referenceId: true,
  idempotencyKey: true,
  balanceAfter: true,
  createdAt: true
} as const;

export function toView(row: TransactionRow): TransactionView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * Registre append-only des Bits (T190, FR-073/FR-076/SC-021).
 *
 * Le solde du portefeuille et l'écriture du registre sont modifiés dans la
 * même transaction PostgreSQL, avec verrouillage de la ligne `wallets`. La
 * clé d'idempotence unique rend un rejeu inoffensif, y compris en concurrence.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lit le solde et l'historique, après contrôle de cohérence du registre. */
  async read(userId: string): Promise<WalletView> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } }
    });
    if (!wallet) return { balance: 0, recentTransactions: [] };

    const all = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      select: { amount: true }
    });
    assertLedgerBalance(wallet.balance, all);

    return {
      balance: wallet.balance,
      recentTransactions: wallet.transactions.map(toView)
    };
  }

  /** Crédite le portefeuille ; l'idempotence évite les doubles récompenses. */
  async credit(
    input: Omit<LedgerMovementInput, 'amount'> & { amount?: number }
  ): Promise<TransactionView> {
    const amount = input.amount ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError('Un crédit doit être un montant positif');
    }
    return this.move({ ...input, amount }, 'credit');
  }

  /** Débite le portefeuille ; un solde insuffisant renvoie 402. */
  async debit(
    input: Omit<LedgerMovementInput, 'amount'> & { amount?: number }
  ): Promise<TransactionView> {
    const amount = input.amount ?? 0;
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new TypeError('Un débit doit être un montant positif');
    }
    return this.move({ ...input, amount: -amount }, 'purchase');
  }

  /** Écriture signée générique, utilisée par les récompenses et la boutique. */
  async move(input: LedgerMovementInput, scope: string): Promise<TransactionView> {
    const key = idempotencyKeyFor(scope, input.idempotencyKey);
    const replayed = await this.prisma.transaction.findUnique({ where: { idempotencyKey: key } });
    if (replayed) return toView(replayed);

    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const wallet = await tx.wallet.upsert({
          where: { userId: input.userId },
          create: { id: uuidv7(), userId: input.userId, balance: 0 },
          update: {}
        });

        // `upsert` peut renvoyer une ligne lue avant le verrou : on la relit
        // après SELECT FOR UPDATE pour sérialiser les mouvements concurrents.
        await tx.$queryRaw`SELECT id FROM wallets WHERE id = ${wallet.id}::uuid FOR UPDATE`;
        const locked = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });

        const insideReplay = await tx.transaction.findUnique({ where: { idempotencyKey: key } });
        if (insideReplay) return toView(insideReplay);

        const rows = await tx.transaction.findMany({
          where: { walletId: locked.id },
          select: { amount: true }
        });
        assertLedgerBalance(locked.balance, rows);

        const balanceAfter = applyMovement(locked.balance, input.amount);
        const created = await tx.transaction.create({
          data: {
            id: uuidv7(),
            walletId: locked.id,
            amount: input.amount,
            reason: input.reason,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            idempotencyKey: key,
            balanceAfter,
            createdBy: input.createdBy
          },
          select: TRANSACTION_SELECT
        });
        await tx.wallet.update({ where: { id: locked.id }, data: { balance: balanceAfter } });
        return toView(created);
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        throw new HttpException(
          { code: 'INSUFFICIENT_BITS', message: 'Solde de Bits insuffisant' },
          HttpStatus.PAYMENT_REQUIRED
        );
      }
      if (
        this.prisma.isUniqueConstraintError(error) &&
        this.prisma.uniqueConstraintTarget(error).includes('idempotency_key')
      ) {
        const existing = await this.prisma.transaction.findUnique({
          where: { idempotencyKey: key },
          select: TRANSACTION_SELECT
        });
        if (existing) return toView(existing);
      }
      throw error;
    }
  }
}
