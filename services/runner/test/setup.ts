process.env.NODE_ENV = 'test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.AES_KEY_BASE64 ??= 'dGVzdC1hZXMtMjU2LWtleS0zMi1ieXRlcy1sb25nISE=';
process.env.AES_KEY_ID ??= 'v1';
process.env.LOG_LEVEL = 'silent';
