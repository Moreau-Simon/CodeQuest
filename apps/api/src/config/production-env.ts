/**
 * Garde-fou de production (T254, FR-111) : les valeurs par défaut de
 * développement ne doivent jamais atteindre un déploiement public.
 */
export interface ProductionEnvironment {
  readonly NODE_ENV?: string;
  readonly WEB_ORIGIN?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly SESSION_SECRET?: string;
  readonly AES_KEY_BASE64?: string;
  readonly MINIO_SECRET_KEY?: string;
  readonly ASSETS_SEED_KEY?: string;
  readonly LIVEKIT_API_SECRET?: string;
  readonly VAPID_PRIVATE_KEY?: string;
  readonly COOKIE_SECURE?: boolean;
}

const FORBIDDEN = [
  /changez-moi/i,
  /placeholder/i,
  /codequest-dev/i,
  /codequest123/i,
  /^devkey$/i,
  /^test-/i
];

function isPlaceholder(value: string | undefined): boolean {
  return !value || FORBIDDEN.some((pattern) => pattern.test(value));
}

/** Lève une erreur listant toutes les dérives de configuration détectées. */
export function assertProductionEnvironment(env: ProductionEnvironment): void {
  if (env.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  for (const key of [
    'SESSION_SECRET',
    'AES_KEY_BASE64',
    'MINIO_SECRET_KEY',
    'ASSETS_SEED_KEY',
    'LIVEKIT_API_SECRET',
    'VAPID_PRIVATE_KEY'
  ] as const) {
    if (isPlaceholder(env[key])) errors.push(`${key} doit être remplacé par une valeur secrète`);
  }
  if ((env.SESSION_SECRET?.length ?? 0) < 32) {
    errors.push('SESSION_SECRET doit faire au moins 32 caractères');
  }
  for (const key of ['WEB_ORIGIN', 'PUBLIC_APP_URL'] as const) {
    if (!env[key]?.startsWith('https://')) errors.push(`${key} doit utiliser HTTPS`);
  }
  if (!env.COOKIE_SECURE) errors.push('COOKIE_SECURE doit être activé');

  if (errors.length > 0) {
    throw new Error(`Configuration de production invalide :\n  - ${errors.join('\n  - ')}`);
  }
}
