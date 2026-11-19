import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { env } from '../../config/env';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUTH_AUDIT_EVENTS } from './audit.events';
import { generateOpaqueToken } from './auth.tokens';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

const RESET_TTL_MS = 60 * 60 * 1_000;

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Réinitialisation par lien à usage unique valable 1 h (T055, FR-007).
 * La demande répond toujours de la même façon, que le compte existe ou non.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  /** Crée un jeton et met l'e-mail en file ; silencieux si le compte est inconnu. */
  async request(identifier: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { pseudonym: identifier }],
        deletedAt: null
      },
      select: { id: true, email: true, pseudonym: true, status: true }
    });

    // Aucune fuite d'existence de compte : même latence perçue, même réponse.
    if (!user || user.status === 'deleted') return;

    const now = this.clock.now();
    const token = generateOpaqueToken();

    await this.prisma.$transaction([
      // Un seul lien actif à la fois : les précédents sont invalidés.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now }
      }),
      this.prisma.passwordResetToken.create({
        data: {
          id: uuidv7(now.getTime()),
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(now.getTime() + RESET_TTL_MS)
        }
      })
    ]);

    await this.mail.sendPasswordReset(user.email, {
      pseudonym: user.pseudonym,
      link: `${env.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`
    });

    await this.audit.record({
      actorId: user.id,
      action: AUTH_AUDIT_EVENTS.passwordResetRequested,
      targetType: 'user',
      targetId: user.id
    });
  }

  /** Consomme le lien : mot de passe remplacé, toutes les sessions révoquées. */
  async consume(token: string, newPassword: string): Promise<void> {
    if (this.passwords.isCompromised(newPassword)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Ce mot de passe figure parmi les mots de passe compromis'
      });
    }

    const now = this.clock.now();
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true }
    });

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Lien de réinitialisation invalide ou expiré'
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: { status: true, deletedAt: true }
    });
    if (!user || user.deletedAt !== null || user.status === 'deleted') {
      throw new BadRequestException({
        code: 'INVALID_RESET_TOKEN',
        message: 'Lien de réinitialisation invalide ou expiré'
      });
    }

    const passwordHash = await this.passwords.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now }
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash }
      })
    ]);

    // FR-008 : toute session existante devient invalide après changement.
    await this.sessions.revokeAll(record.userId, 'password_reset');

    await this.audit.record({
      actorId: record.userId,
      action: AUTH_AUDIT_EVENTS.passwordReset,
      targetType: 'user',
      targetId: record.userId
    });
  }
}
