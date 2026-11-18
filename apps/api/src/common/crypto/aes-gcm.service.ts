import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Chiffrement applicatif AES-256-GCM des tests cachés et solutions de
 * référence (FR-029, FR-110, research.md R6).
 *
 * Format du chiffré :
 *   [1 octet : longueur du key_id][key_id UTF-8][nonce 12 octets]
 *   [chiffré][tag d'authentification 16 octets]
 *
 * L'AAD est le `challenge_version_id` : un chiffré ne peut pas être rejoué
 * pour une autre version de défi.
 */
@Injectable()
export class AesGcmService {
  private readonly key: Buffer;
  readonly keyId: string;

  constructor(keyBase64: string = env.AES_KEY_BASE64, keyId: string = env.AES_KEY_ID) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `AES_KEY_BASE64 doit décoder exactement 32 octets (reçu ${key.length} octets)`
      );
    }
    this.key = key;
    this.keyId = keyId;
    if (Buffer.byteLength(keyId, 'utf8') > 255) {
      throw new Error('AES_KEY_ID doit faire au plus 255 octets');
    }
  }

  encrypt(plaintext: string | Buffer, aad: string): Buffer {
    const iv = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(aad, 'utf8'));

    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    const keyId = Buffer.from(this.keyId, 'utf8');

    return Buffer.concat([Buffer.from([keyId.length]), keyId, iv, ciphertext, tag]);
  }

  decrypt(payload: Buffer, aad: string): Buffer {
    const { keyId, iv, ciphertext, tag } = this.split(payload);

    if (keyId !== this.keyId) {
      throw new Error(
        `Clé AES inconnue « ${keyId} » : ce chiffré nécessite une clé de rotation (key_id courant : ${this.keyId})`
      );
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (error) {
      throw new Error("Échec d'authentification AES-GCM : données ou AAD altérés", {
        cause: error
      });
    }
  }

  /** Lit le `key_id` sans déchiffrer (utile pour la rotation de clés). */
  readKeyId(payload: Buffer): string {
    return this.split(payload).keyId;
  }

  private split(payload: Buffer): {
    keyId: string;
    iv: Buffer;
    ciphertext: Buffer;
    tag: Buffer;
  } {
    if (payload.length < 1 + NONCE_LENGTH + TAG_LENGTH) {
      throw new Error('Chiffré AES-GCM invalide : contenu trop court');
    }
    const keyIdLength = payload[0]!;
    const keyIdEnd = 1 + keyIdLength;
    if (keyIdLength === 0 || payload.length < keyIdEnd + NONCE_LENGTH + TAG_LENGTH) {
      throw new Error('Chiffré AES-GCM invalide : en-tête key_id incohérent');
    }

    return {
      keyId: payload.subarray(1, keyIdEnd).toString('utf8'),
      iv: payload.subarray(keyIdEnd, keyIdEnd + NONCE_LENGTH),
      ciphertext: payload.subarray(keyIdEnd + NONCE_LENGTH, payload.length - TAG_LENGTH),
      tag: payload.subarray(payload.length - TAG_LENGTH)
    };
  }
}
