import { createDecipheriv } from 'node:crypto';

export interface EncryptedTestsRef {
  ciphertextBase64: string;
  keyId: string;
}

export interface LoadedTests {
  cases: Array<{ input: unknown; expected: unknown; hidden?: boolean; name?: string }>;
}

/**
 * Déchiffrement des tests côté runner (T084, FR-028, FR-110).
 *
 * Format identique à `apps/api/src/common/crypto/aes-gcm.service.ts` :
 * `[len key_id][key_id][nonce 12][chiffré][tag 16]`, AAD =
 * `challenge_version_id`.
 */
export function decryptTests(
  payload: Buffer,
  aad: string,
  keyBase64: string,
  expectedKeyId: string
): LoadedTests {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('La clé AES doit décoder 32 octets');

  if (payload.length < 1 + 12 + 16) throw new Error('Chiffré de tests tronqué');
  const keyIdLength = payload[0]!;
  if (payload.length < 1 + keyIdLength + 12 + 16) throw new Error('Chiffré de tests tronqué');

  const keyId = payload.subarray(1, 1 + keyIdLength).toString('utf8');
  if (keyId !== expectedKeyId) {
    throw new Error(`Clé inconnue « ${keyId} » (attendu « ${expectedKeyId} »)`);
  }

  const nonceStart = 1 + keyIdLength;
  const nonce = payload.subarray(nonceStart, nonceStart + 12);
  const ciphertext = payload.subarray(nonceStart + 12, payload.length - 16);
  const tag = payload.subarray(payload.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as LoadedTests;
}

export function loadTestsFromJob(
  testsRef: { ciphertextBase64?: string; keyId: string },
  aad: string,
  keyBase64: string
): LoadedTests {
  if (!testsRef.ciphertextBase64) {
    throw new Error('Tests chiffrés absents du job (ciphertextBase64 manquant)');
  }
  return decryptTests(
    Buffer.from(testsRef.ciphertextBase64, 'base64'),
    aad,
    keyBase64,
    testsRef.keyId
  );
}
