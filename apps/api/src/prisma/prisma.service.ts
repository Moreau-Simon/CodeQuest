import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

export interface TransactionOptions {
  timeoutMs?: number;
  maxWaitMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Client Prisma unique de l'application (T025).
 *
 * - `runInTransaction` borne les transactions (pas de transaction ouverte
 *   indéfiniment sous charge) ;
 * - les erreurs de contrainte unique sont exposées via des helpers typés pour
 *   que les services renvoient un 409 métier plutôt qu'un 500.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async runInTransaction<T>(
    callback: TransactionCallback<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    return this.$transaction(callback, {
      maxWait: options.maxWaitMs ?? 5_000,
      timeout: options.timeoutMs ?? 10_000,
      isolationLevel: options.isolationLevel
    });
  }

  isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      typeof error === 'object'
    );
  }

  /** Champs concernés par une violation d'unicité (ex. `['email']`). */
  uniqueConstraintTarget(error: unknown): string[] {
    if (!this.isUniqueConstraintError(error)) return [];
    const target = error.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === 'string') return [target];
    return [];
  }
}
