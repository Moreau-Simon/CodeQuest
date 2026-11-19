import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

/** Durée de vie du lien de confirmation d'e-mail (T051). */
export const EMAIL_VERIFICATION_TTL = '24h';

interface EmailVerificationClaims {
  sub: string;
  typ: 'email_verify';
  iat: number;
  exp: number;
}

/** Lien de confirmation signé : aucun jeton à stocker, confirmation idempotente. */
export function signEmailVerificationToken(userId: string, secret: string): string {
  return jwt.sign({ sub: userId, typ: 'email_verify' }, secret, {
    algorithm: 'HS256',
    expiresIn: EMAIL_VERIFICATION_TTL
  });
}

export function verifyEmailVerificationToken(token: string, secret: string): { userId: string } {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw new Error('Lien de confirmation invalide ou expiré');
  }

  const claims = decoded as Partial<EmailVerificationClaims> | null;
  if (!claims || claims.typ !== 'email_verify' || typeof claims.sub !== 'string') {
    throw new Error('Lien de confirmation invalide ou expiré');
  }

  return { userId: claims.sub };
}

/** Jeton opaque de réinitialisation : 256 bits, jamais stocké en clair. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}
