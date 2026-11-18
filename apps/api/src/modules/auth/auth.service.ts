import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { signEmailVerificationToken, verifyEmailVerificationToken } from './auth.tokens';
import { Clock } from '../../common/clock';
import { uuidv7 } from '../../common/uuid';
import { env } from '../../config/env';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUTH_AUDIT_EVENTS } from './audit.events';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { LockoutService } from './lockout.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import type { IssuedSession } from './session.cookies';
import { SessionService, type SessionContext } from './session.service';

/**
 * Inscription, confirmation d'e-mail et connexion (T051, T053).
 *
 * Un compte non confirmé existe et peut lire la plateforme (FR-003), mais les
 * écritures sont refusées tant que `emailVerifiedAt` est nul (voir
 * `MeController`).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly reset: PasswordResetService,
    private readonly lockout: LockoutService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly clock: Clock
  ) {}

  async register(dto: RegisterDto, context: SessionContext = {}): Promise<void> {
    if (this.passwords.isCompromised(dto.password)) {
      throw new BadRequestException({
        code: 'WEAK_PASSWORD',
        message: 'Ce mot de passe figure parmi les mots de passe compromis'
      });
    }

    const now = this.clock.now();
    const passwordHash = await this.passwords.hash(dto.password);
    const userId = uuidv7(now.getTime());

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: dto.email,
            pseudonym: dto.pseudonym,
            passwordHash,
            status: 'pending'
          }
        });

        // Rôle joueur par défaut (créé par le seed RBAC au déploiement).
        const player = await tx.role.findUnique({ where: { key: 'player' }, select: { id: true } });
        if (player) {
          await tx.userRole.create({ data: { userId, roleId: player.id } });
        }
      });
    } catch (error) {
      if (this.prisma.isUniqueConstraintError(error)) {
        const [field] = this.prisma.uniqueConstraintTarget(error);
        const pseudonymTaken = field === 'pseudonym';
        throw new ConflictException({
          code: pseudonymTaken ? 'PSEUDONYM_TAKEN' : 'EMAIL_TAKEN',
          message: pseudonymTaken
            ? 'Ce pseudo est déjà utilisé'
            : 'Un compte existe déjà avec cette adresse e-mail'
        });
      }
      throw error;
    }

    const token = signEmailVerificationToken(userId, env.SESSION_SECRET);
    await this.mail.sendConfirmation(dto.email, {
      pseudonym: dto.pseudonym,
      link: `${env.PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`
    });

    await this.audit.record({
      actorId: userId,
      action: AUTH_AUDIT_EVENTS.registered,
      targetType: 'user',
      targetId: userId,
      metadata: { pseudonym: dto.pseudonym },
      ipPrefix: context.ipPrefix ?? null
    });
  }

  /** Confirme l'adresse e-mail ; idempotent si le lien est rejoué. */
  async verifyEmail(token: string): Promise<void> {
    let userId: string;
    try {
      ({ userId } = verifyEmailVerificationToken(token, env.SESSION_SECRET));
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TOKEN',
        message: error instanceof Error ? error.message : 'Lien de confirmation invalide'
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, emailVerifiedAt: true, status: true, deletedAt: true }
    });

    if (!user || user.deletedAt !== null || user.status === 'deleted') {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TOKEN',
        message: 'Lien de confirmation invalide'
      });
    }

    if (user.emailVerifiedAt === null) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: this.clock.now(),
          status: user.status === 'pending' ? 'active' : user.status
        }
      });

      await this.audit.record({
        actorId: user.id,
        action: AUTH_AUDIT_EVENTS.emailVerified,
        targetType: 'user',
        targetId: user.id
      });
    }
  }

  async login(dto: LoginDto, context: SessionContext = {}): Promise<IssuedSession> {
    if (await this.lockout.isLocked(dto.identifier)) {
      await this.audit.record({
        action: AUTH_AUDIT_EVENTS.loginLocked,
        targetType: 'user',
        metadata: { identifier: dto.identifier },
        ipPrefix: context.ipPrefix ?? null
      });
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: 'Trop de tentatives ; réessayez dans quelques minutes'
        },
        423
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { pseudonym: dto.identifier }] },
      select: { id: true, passwordHash: true, status: true, deletedAt: true }
    });

    const passwordOk = user ? await this.passwords.verify(user.passwordHash, dto.password) : false;
    const unavailable = !user || user.deletedAt !== null || user.status === 'deleted';

    if (!passwordOk || unavailable) {
      // Le 5ᵉ échec reste un 401 : le verrou s'applique aux tentatives suivantes.
      const locked = await this.lockout.recordFailure(dto.identifier);
      await this.audit.record({
        actorId: user?.id ?? null,
        action: AUTH_AUDIT_EVENTS.loginFailed,
        targetType: 'user',
        targetId: user?.id ?? null,
        metadata: { identifier: dto.identifier, locked },
        ipPrefix: context.ipPrefix ?? null
      });

      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Identifiant ou mot de passe incorrect'
      });
    }

    await this.lockout.reset(dto.identifier);
    const session = await this.sessions.create(user.id, context);

    await this.audit.record({
      actorId: user.id,
      action: AUTH_AUDIT_EVENTS.loginSucceeded,
      targetType: 'user',
      targetId: user.id,
      ipPrefix: context.ipPrefix ?? null
    });

    return session;
  }

  async logout(userId: string, sessionId: string, all: boolean): Promise<void> {
    if (all) {
      await this.sessions.revokeAll(userId, 'logout_all');
    } else {
      await this.sessions.revoke(sessionId, 'logout');
    }

    await this.audit.record({
      actorId: userId,
      action: all ? AUTH_AUDIT_EVENTS.loggedOutAll : AUTH_AUDIT_EVENTS.loggedOut,
      targetType: 'user',
      targetId: userId
    });
  }

  forgotPassword(identifier: string): Promise<void> {
    return this.reset.request(identifier);
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.reset.consume(token, password);
  }

  /** Réauthentification exigée pour les actions sensibles (FR-010, FR-012). */
  async confirmPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, deletedAt: true }
    });

    const valid = user ? await this.passwords.verify(user.passwordHash, password) : false;
    if (!user || !valid || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'INVALID_PASSWORD',
        message: 'Mot de passe incorrect'
      });
    }
  }
}
