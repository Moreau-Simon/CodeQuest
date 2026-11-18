import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 monotone (RFC 9562) — identifiant triable utilisé pour toutes les PK.
 *
 * Structure : 48 bits de timestamp Unix ms, 4 bits de version (7), 12 bits de
 * compteur monotone, 2 bits de variante, 62 bits aléatoires. Le compteur rend
 * les identifiants strictement croissants même pour des créations dans la même
 * milliseconde, ce qui préserve la localité des index B-tree.
 */

let lastTimestamp = -1;
let sequence = 0;

const MAX_TIMESTAMP = 0xffffffffffff; // 48 bits
const MAX_SEQUENCE = 0xfff; // 12 bits

export function uuidv7(timestamp: number = Date.now()): string {
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
    throw new RangeError(`Timestamp invalide pour UUIDv7 : ${timestamp}`);
  }

  if (timestamp === lastTimestamp) {
    sequence += 1;
    if (sequence > MAX_SEQUENCE) {
      // Débordement du compteur : on avance d'une milliseconde pour rester
      // strictement croissant sans bloquer l'appelant.
      lastTimestamp += 1;
      sequence = 0;
    }
  } else if (timestamp > lastTimestamp) {
    lastTimestamp = timestamp;
    sequence = 0;
  } else {
    // Horloge système revenue en arrière : on ne réémet jamais un identifiant
    // inférieur au précédent.
    lastTimestamp += 1;
    sequence = 0;
  }

  const timeHex = lastTimestamp.toString(16).padStart(12, '0');
  const sequenceHex = sequence.toString(16).padStart(3, '0');
  const prefix = `${timeHex}7${sequenceHex}`; // 32 bits : ts(48) + version(4) + seq(12)

  const random = randomBytes(8);
  random[0] = (random[0]! & 0x3f) | 0x80; // variante RFC 9562 (10xxxxxx)
  const randomHex = random.toString('hex');

  return [
    prefix.slice(0, 8),
    prefix.slice(8, 12),
    prefix.slice(12, 16),
    randomHex.slice(0, 4),
    randomHex.slice(4, 16)
  ].join('-');
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value);
}

/** Extrait le timestamp Unix ms encodé dans un UUIDv7. */
export function timestampOfUuidV7(value: string): number {
  if (!isUuidV7(value)) throw new TypeError(`UUIDv7 attendu : ${value}`);
  return parseInt(value.replace(/-/g, '').slice(0, 12), 16);
}
