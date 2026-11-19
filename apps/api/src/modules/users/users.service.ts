import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE } from '../../storage/storage.constants';
import type { StorageService } from '../../storage/storage.module';
import { SessionService, type SessionSummary } from '../auth/session.service';
import type { UpdateProfileDto } from './dto/profile.dto';

export interface Profile {
  id: string;
  pseudonym: string;
  email: string;
  emailVerified: boolean;
  level: number;
  xp: number;
  avatarUrl: string | null;
  preferredLanguage: string;
  preferences: Record<string, unknown>;
  badges: string[];
}

const PROFILE_SELECT = {
  id: true,
  pseudonym: true,
  email: true,
  emailVerifiedAt: true,
  level: true,
  xp: true,
  avatarKey: true,
  preferredLanguage: true,
  preferences: true,
  status: true,
  deletedAt: true
} satisfies Prisma.UserSelect;

/**
 * Profil et paramètres du compte (T057, FR-015, FR-016).
 *
 * Un compte non confirmé peut lire son profil mais pas le modifier (FR-003) :
 * l'erreur `EMAIL_NOT_VERIFIED` est renvoyée en 403.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService
  ) {}

  async profile(userId: string): Promise<Profile> {
    const user = await this.load(userId);
    return this.toProfile(user);
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const user = await this.load(userId);
    this.requireVerified(user.emailVerifiedAt);

    const data: Prisma.UserUpdateInput = {};
    if (dto.pseudonym !== undefined) data.pseudonym = dto.pseudonym;
    if (dto.preferredLanguage !== undefined) data.preferredLanguage = dto.preferredLanguage;
    if (dto.preferences !== undefined) data.preferences = dto.preferences as Prisma.InputJsonValue;
    if (dto.avatarKey !== undefined) data.avatarKey = dto.avatarKey;

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: PROFILE_SELECT
      });
      return this.toProfile(updated);
    } catch (error) {
      if (this.prisma.isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: 'PSEUDONYM_TAKEN',
          message: 'Ce pseudo est déjà utilisé'
        });
      }
      throw error;
    }
  }

  /** Export RGPD : uniquement les données personnelles, jamais de secrets. */
  async export(userId: string): Promise<Record<string, unknown>> {
    const user = await this.load(userId);
    const [sessions, roles, audit] = await Promise.all([
      this.prisma.session.findMany({
        where: { userId },
        select: {
          id: true,
          userAgent: true,
          ipPrefix: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
          revokedAt: true,
          revokedReason: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.userRole.findMany({
        where: { userId },
        select: { role: { select: { key: true } }, createdAt: true }
      }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ actorId: userId }, { targetType: 'user', targetId: userId }] },
        select: { action: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1_000
      })
    ]);

    // Export plat : les champs personnels sont au premier niveau (contrat
    // `GET /me/export`), les collections sont ajoutées à côté.
    return {
      exportedAt: new Date().toISOString(),
      id: user.id,
      pseudonym: user.pseudonym,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      preferredLanguage: user.preferredLanguage,
      preferences: user.preferences,
      avatarKey: user.avatarKey,
      level: user.level,
      xp: user.xp,
      createdAt: user.createdAt,
      roles: roles.map((entry) => ({ role: entry.role.key, grantedAt: entry.createdAt })),
      sessions: sessions.map((session) => ({ ...session })),
      audit: audit.map((entry) => ({
        action: entry.action,
        metadata: entry.metadata,
        createdAt: entry.createdAt
      }))
    };
  }

  listSessions(userId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    return this.sessions.list(userId, currentSessionId);
  }

  /** Révoque une session de l'utilisateur ; 404 si elle ne lui appartient pas. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true }
    });
    if (!session || session.userId !== userId) {
      throw new NotFoundException({
        code: 'SESSION_NOT_FOUND',
        message: 'Session introuvable'
      });
    }
    if (session.revokedAt === null) await this.sessions.revoke(sessionId, 'user_revoked');
  }

  revokeAllSessions(userId: string): Promise<number> {
    return this.sessions.revokeAll(userId, 'user_revoked_all');
  }

  requireVerified(emailVerifiedAt: Date | null): void {
    if (emailVerifiedAt === null) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirmez votre adresse e-mail pour effectuer cette action'
      });
    }
  }

  private async load(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PROFILE_SELECT, createdAt: true }
    });
    if (!user || user.deletedAt !== null || user.status === 'deleted') {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Compte introuvable' });
    }
    return user;
  }

  private async toProfile(user: {
    id: string;
    pseudonym: string;
    email: string;
    emailVerifiedAt: Date | null;
    level: number;
    xp: number;
    avatarKey: string | null;
    preferredLanguage: string;
    preferences: Prisma.JsonValue;
  }): Promise<Profile> {
    return {
      id: user.id,
      pseudonym: user.pseudonym,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      level: user.level,
      xp: user.xp,
      avatarUrl: await this.avatarUrl(user.avatarKey),
      preferredLanguage: user.preferredLanguage,
      preferences:
        user.preferences && typeof user.preferences === 'object' && !Array.isArray(user.preferences)
          ? (user.preferences as Record<string, unknown>)
          : {},
      // Badges : alimentés par la Phase 10 ; contrat stable dès maintenant.
      badges: []
    };
  }

  private async avatarUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.storage.presignedGet('avatars', key);
    } catch {
      // Stockage indisponible : le profil reste lisible sans avatar.
      return null;
    }
  }
}
