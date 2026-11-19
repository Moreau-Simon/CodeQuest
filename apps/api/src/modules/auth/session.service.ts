import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Clock } from '../../common/clock';
import { signAccessToken } from '../../common/auth/access-token';
import { uuidv7 } from '../../common/uuid';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.module';
import { REALTIME_REVOKE_CHANNEL } from '../../realtime/realtime.constants';
import { generateOpaqueToken } from './auth.tokens';
import type { IssuedSession } from './session.cookies';

export interface SessionContext {
  userAgent?: string | null;
  ipPrefix?: string | null;
}

export interface SessionSummary {
  id: string;
  userAgent: string;
  ipPrefix: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Un refresh token opaque est toujours haché en SHA-256 avant stockage. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Sessions et rotation des refresh tokens (T052, FR-011).
 *
 * - jeton d'accès JWT 15 min, refresh opaque 256 bits haché ;
 * - rotation à chaque usage, détection de réutilisation ⇒ révocation de la
 *   famille entière ;
 * - expiration glissante 7 j, plafond absolu 30 j par famille.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly clock: Clock
  ) {}

  async create(userId: string, context: SessionContext = {}): Promise<IssuedSession> {
    const now = this.clock.now();
    const sessionId = uuidv7(now.getTime());
    const refreshToken = generateOpaqueToken();

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        tokenFamilyId: sessionId,
        userAgent: truncate(context.userAgent, 255),
        ipPrefix: context.ipPrefix ?? null,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS)
      }
    });

    return this.issue(
      userId,
      sessionId,
      refreshToken,
      new Date(now.getTime() + env.REFRESH_TOKEN_SLIDING_DAYS * DAY_MS)
    );
  }

  async rotate(refreshToken: string, context: SessionContext = {}): Promise<IssuedSession> {
    const now = this.clock.now();
    const current = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashRefreshToken(refreshToken) }
    });

    if (!current) throw this.invalidToken();

    // Jeton déjà tourné (ou révoqué) : réutilisation probable ⇒ toute la
    // famille est révoquée, y compris la session la plus récente.
    if (current.revokedAt !== null) {
      await this.revokeFamily(current.tokenFamilyId, 'token_reuse');
      throw this.invalidToken();
    }

    if (current.expiresAt.getTime() <= now.getTime()) {
      await this.revokeFamily(current.tokenFamilyId, 'expired');
      throw this.invalidToken();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: current.userId },
      select: { status: true, deletedAt: true }
    });
    if (
      !user ||
      user.deletedAt !== null ||
      user.status === 'deleted' ||
      user.status === 'suspended'
    ) {
      await this.revokeFamily(current.tokenFamilyId, 'account_unavailable');
      throw this.invalidToken();
    }

    // Plafond absolu : 30 jours après la création de la famille.
    const familyStart = await this.prisma.session.aggregate({
      where: { tokenFamilyId: current.tokenFamilyId },
      _min: { createdAt: true }
    });
    const familyCreatedAt = familyStart._min.createdAt ?? now;
    const cap = familyCreatedAt.getTime() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS;
    const sliding = now.getTime() + env.REFRESH_TOKEN_SLIDING_DAYS * DAY_MS;
    const expiresAt = new Date(Math.min(sliding, cap));

    if (expiresAt.getTime() <= now.getTime()) {
      await this.revokeFamily(current.tokenFamilyId, 'expired');
      throw this.invalidToken();
    }

    const nextToken = generateOpaqueToken();
    const nextId = uuidv7(now.getTime());

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: current.id },
        data: { revokedAt: now, revokedReason: 'rotated' }
      }),
      this.prisma.session.create({
        data: {
          id: nextId,
          userId: current.userId,
          refreshTokenHash: hashRefreshToken(nextToken),
          tokenFamilyId: current.tokenFamilyId,
          rotatedFrom: current.id,
          userAgent: truncate(context.userAgent ?? current.userAgent, 255),
          ipPrefix: context.ipPrefix ?? current.ipPrefix,
          lastUsedAt: now,
          expiresAt
        }
      })
    ]);

    return this.issue(current.userId, nextId, nextToken, expiresAt);
  }

  /** Révoque une session précise et ferme ses sockets (FR-017). */
  async revoke(sessionId: string, reason = 'revoked'): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true }
    });
    if (!session || session.revokedAt !== null) return;

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: this.clock.now(), revokedReason: reason }
    });
    await this.publishRevocation({ userId: session.userId, sessionId });
  }

  async revokeAll(userId: string, reason = 'revoked'): Promise<number> {
    const now = this.clock.now();
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason }
    });
    if (result.count > 0) await this.publishRevocation({ userId });
    return result.count;
  }

  async revokeFamily(tokenFamilyId: string, reason: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { tokenFamilyId, revokedAt: null },
      select: { id: true, userId: true }
    });
    if (sessions.length === 0) return;

    const now = this.clock.now();
    await this.prisma.session.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason }
    });

    for (const session of sessions) {
      await this.publishRevocation({ userId: session.userId, sessionId: session.id });
    }
  }

  async list(userId: string, currentSessionId?: string): Promise<SessionSummary[]> {
    const now = this.clock.now();
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ lastUsedAt: 'desc' }]
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent ?? 'Appareil inconnu',
      ipPrefix: typeof session.ipPrefix === 'string' ? session.ipPrefix : 'inconnu',
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      current: session.id === currentSessionId
    }));
  }

  /** Vérifie qu'une session est encore active (guard REST et handshake socket). */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true }
    });
    return (
      !!session &&
      session.userId === userId &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > this.clock.now().getTime()
    );
  }

  private issue(
    userId: string,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date
  ): IssuedSession {
    return {
      sessionId,
      accessToken: signAccessToken(
        { userId, sessionId },
        env.SESSION_SECRET,
        env.JWT_ACCESS_TTL_SECONDS
      ),
      refreshToken,
      refreshExpiresAt
    };
  }

  private async publishRevocation(payload: { userId?: string; sessionId?: string }): Promise<void> {
    try {
      await this.redis.client.publish(REALTIME_REVOKE_CHANNEL, JSON.stringify(payload));
    } catch {
      // Redis indisponible : la révocation en base reste effective, la
      // fermeture des sockets sera rattrapée au prochain handshake.
    }
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Session expirée ou invalide'
    });
  }
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length <= max ? value : value.slice(0, max);
}
