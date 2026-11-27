import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../common/uuid';

/** T256 [US17] (FR-115) : registre de consentement, export et effacement RGPD. */
export interface PrivacyPrisma {
  readonly user: {
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<unknown>;
  };
  readonly consent: {
    upsert(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
  };
  readonly session: { deleteMany(args: unknown): Promise<unknown> };
  readonly passwordResetToken: { deleteMany(args: unknown): Promise<unknown> };
  readonly pushSubscription: { deleteMany(args: unknown): Promise<unknown> };
  readonly notification: { deleteMany(args: unknown): Promise<unknown> };
  readonly submission: { findMany(args: unknown): Promise<unknown> };
  readonly wallet: { findUnique(args: unknown): Promise<unknown> };
  readonly transaction: { findMany(args: unknown): Promise<unknown> };
}

export interface RectificationInput {
  readonly pseudonym?: string;
  readonly email?: string;
  readonly preferences?: Record<string, unknown>;
}

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrivacyPrisma) {}

  async recordConsent(
    userId: string,
    purpose: string,
    granted: boolean,
    source?: string
  ): Promise<void> {
    await this.prisma.consent.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: {
        id: uuidv7(),
        userId,
        purpose,
        granted,
        source,
        recordedAt: new Date()
      },
      update: { granted, source, updatedAt: new Date() }
    });
  }

  async getConsents(userId: string): Promise<unknown> {
    return this.prisma.consent.findMany({
      where: { userId },
      orderBy: { purpose: 'asc' }
    });
  }

  /** Export lisible : aucun hash, jeton ou secret n'est inclus. */
  async exportData(userId: string): Promise<Record<string, unknown>> {
    const [user, consents, submissions, wallet, transactions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.getConsents(userId),
      this.prisma.submission.findMany({
        where: { userId },
        select: { id: true, challengeId: true, score: true, verdictAt: true }
      }),
      this.prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
      this.prisma.transaction.findMany({
        where: { wallet: { userId } },
        select: { amount: true, reason: true, createdAt: true }
      })
    ]);

    return {
      generatedAt: new Date().toISOString(),
      profile: user
        ? {
            id: user.id,
            pseudonym: user.pseudonym,
            email: user.email,
            status: user.status,
            preferences: user.preferences,
            level: user.level,
            xp: user.xp,
            createdAt: user.createdAt
          }
        : null,
      consents,
      submissions,
      wallet,
      transactions
    };
  }

  async rectify(userId: string, input: RectificationInput): Promise<void> {
    const data: Record<string, unknown> = {};
    if (input.pseudonym !== undefined) data.pseudonym = input.pseudonym;
    if (input.email !== undefined) data.email = input.email;
    if (input.preferences !== undefined) data.preferences = input.preferences;
    if (Object.keys(data).length === 0) return;

    await this.prisma.user.update({ where: { id: userId }, data });
  }

  /**
   * Effacement (SC-017) : le compte est anonymisé, les données personnelles
   * supprimées, mais les scores déjà publiés restent disponibles.
   */
  async erase(userId: string): Promise<void> {
    const suffix = userId.replaceAll('-', '').slice(0, 8);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        pseudonym: `anonyme-${suffix}`,
        email: `${suffix}@example.invalid`,
        passwordHash: randomBytes(32).toString('hex'),
        preferences: {},
        avatarKey: null,
        status: 'deleted',
        deletedAt: new Date()
      }
    });

    await Promise.all([
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } })
    ]);
  }
}
