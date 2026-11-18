import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino';
import { env } from '../../config/env';

export type Logger = PinoLogger;

/**
 * Journalisation structurée JSON (T027, FR-113).
 *
 * Les données personnelles et les secrets ne sortent jamais en clair :
 * `password`, `token`, `email`, `authorization`, `cookie`. Le préfixe IP est
 * déjà minimisé par le middleware de corrélation.
 */
export const REDACTED_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  'token',
  '*.token',
  '*.*.token',
  'refreshToken',
  '*.refreshToken',
  'refresh_token',
  '*.refresh_token',
  'email',
  '*.email',
  '*.*.email',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'passwordHash',
  '*.passwordHash',
  'secret',
  '*.secret'
];

export function createLogger(
  destination?: DestinationStream,
  level: string = env.LOG_LEVEL
): Logger {
  return pino(
    {
      level,
      base: { service: 'codequest-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' }
    },
    destination
  );
}

export const logger: Logger = createLogger();
