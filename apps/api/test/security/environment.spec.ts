import { assertProductionEnvironment } from '../../src/config/production-env';

/** T254 [US17] (FR-111) : refus des valeurs de développement en production. */
const VALID = {
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://codequest.example',
  PUBLIC_APP_URL: 'https://codequest.example',
  SESSION_SECRET: 'X7p!aK9mQ2vL8wR5tY1zN4cB6hJ0sF3dG',
  AES_KEY_BASE64: 'YT9iMmMzZDFlNGY1YTY3ODlhYmNkZWYwMTIzNDU2Nzg5',
  MINIO_SECRET_KEY: 's3cr3t-aleatoire-a-remplacer',
  ASSETS_SEED_KEY: 'seed-aleatoire-a-remplacer-0123456789',
  LIVEKIT_API_SECRET: 'livekit-secret-aleatoire',
  COOKIE_SECURE: true,
  VAPID_PRIVATE_KEY: 'private-key-aleatoire'
};

describe('Validation de l’environnement de production (T254 / FR-111)', () => {
  it('accepte une configuration de production complète', () => {
    expect(() => assertProductionEnvironment(VALID)).not.toThrow();
  });

  it('rejette les secrets par défaut et le HTTP en production', () => {
    expect(() =>
      assertProductionEnvironment({
        ...VALID,
        SESSION_SECRET: 'changez-moi-avec-une-chaine-aleatoire',
        AES_KEY_BASE64: 'placeholder-base64-32-octets',
        MINIO_SECRET_KEY: 'codequest123',
        ASSETS_SEED_KEY: 'codequest-dev-seed-key-000000000000',
        LIVEKIT_API_SECRET: 'devkey',
        VAPID_PRIVATE_KEY: undefined,
        WEB_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: false
      })
    ).toThrow(/SESSION_SECRET|AES_KEY_BASE64|MINIO_SECRET_KEY|ASSETS_SEED_KEY|LIVEKIT_API_SECRET|VAPID|WEB_ORIGIN|COOKIE_SECURE/);
  });

  it('ne s’applique pas en développement', () => {
    expect(() => assertProductionEnvironment({ ...VALID, NODE_ENV: 'development' })).not.toThrow();
  });
});
