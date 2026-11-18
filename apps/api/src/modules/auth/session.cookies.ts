import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/**
 * Le refresh token n'est envoyé qu'aux routes d'authentification : il ne
 * circule pas sur les appels métier (réduction de la surface d'exposition).
 */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // `lax` suffit : le front est servi par le même site, et cela bloque les
    // requêtes cross-site en écriture.
    sameSite: 'lax',
    // Par défaut, cookie hôte seul (pas de `Domain`) : plus strict, et
    // compatible avec les tests sur `127.0.0.1`.
    domain: env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost' ? env.COOKIE_DOMAIN : undefined
  };
}

export interface IssuedSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Pose les deux cookies de session (T052, FR-011). */
export function setSessionCookies(response: Response, session: IssuedSession): void {
  response.cookie(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: env.JWT_ACCESS_TTL_SECONDS * 1_000
  });

  response.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
    expires: session.refreshExpiresAt
  });
}

/** Supprime les deux cookies (déconnexion, révocation, suppression). */
export function clearSessionCookies(response: Response): void {
  response.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  response.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_COOKIE_PATH });
}
