/**
 * Environnement des tests unitaires.
 * Exécuté par Jest (`setupFiles`) avant tout import de `src/`.
 * Aucune valeur sensible réelle : uniquement des valeurs de test déterministes.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://codequest:codequest@localhost:5433/codequest_test?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters';
// 32 octets base64 (« test-aes-256-key-32-bytes-long!! »).
process.env.AES_KEY_BASE64 ??= 'dGVzdC1hZXMtMjU2LWtleS0zMi1ieXRlcy1sb25nISE=';
process.env.AES_KEY_ID ??= 'v1';
process.env.LIVEKIT_API_SECRET ??= 'test-livekit-secret';
process.env.ASSETS_SEED_KEY ??= 'test-assets-seed-key-000000000000';
process.env.LOG_LEVEL ??= 'silent';
