import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  typ: 'access';
  iat: number;
  exp: number;
}

interface SignInput {
  userId: string;
  sessionId: string;
  /** Utilisé uniquement par les tests de robustesse ; toujours `access` en production. */
  type?: string;
}

/**
 * Jeton d'accès JWT (15 min) — research.md R4.
 * Le refresh token opaque et sa rotation sont gérés par le module d'authentification.
 */
export function signAccessToken(input: SignInput, secret: string, ttlSeconds: number): string {
  return jwt.sign(
    { sub: input.userId, sid: input.sessionId, typ: input.type ?? 'access' },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: ttlSeconds
    }
  );
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Jeton expiré');
    }
    throw new Error('Jeton invalide');
  }

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Jeton invalide');
  }

  const payload = decoded as Partial<AccessTokenPayload> & { typ?: unknown };
  if (payload.typ !== 'access') {
    throw new Error('Type de jeton invalide');
  }
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new Error('Jeton invalide');
  }
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    throw new Error('Jeton invalide');
  }

  return {
    sub: payload.sub,
    sid: payload.sid,
    typ: 'access',
    iat: payload.iat,
    exp: payload.exp
  };
}
