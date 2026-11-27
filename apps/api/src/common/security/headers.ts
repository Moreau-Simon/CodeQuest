/**
 * Politique HTTP partagée entre l'API et les tests (T249, FR-108/FR-112).
 *
 * `helmet()` est configuré ici plutôt qu'inline dans `bootstrap.ts` afin que
 * les tests puissent vérifier exactement les en-têtes attendus en production.
 */
export interface SecurityHeaders {
  hsts: false | { maxAge: number; includeSubDomains: boolean; preload: boolean };
  contentSecurityPolicy: {
    useDefaults: boolean;
    directives: Record<string, string[]>;
  };
  frameguard: { action: 'deny' };
  noSniff: boolean;
  referrerPolicy: { policy: 'no-referrer' };
  crossOriginResourcePolicy: { policy: 'same-site' };
  crossOriginEmbedderPolicy: false;
}

export function buildSecurityHeaders(nodeEnv: string): SecurityHeaders {
  const production = nodeEnv === 'production';

  return {
    hsts: production
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: production ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: production
          ? ["'self'", 'wss:']
          : ["'self'", 'ws:', 'http://localhost:*', 'http://127.0.0.1:*'],
        fontSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    // COEP bloquerait les ressources livekit/PWA servies par un autre site.
    crossOriginEmbedderPolicy: false
  };
}
