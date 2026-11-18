import type { AuthenticatedUser } from '../auth/authenticated-user';

declare global {
  namespace Express {
    interface Request {
      /** Identifiant de corrélation (UUIDv7 ou en-tête amont validé). */
      requestId: string;
      /** Préfixe réseau /24 (IPv4) ou /48 (IPv6), jamais l'IP complète. */
      ipPrefix: string | null;
      user?: AuthenticatedUser;
    }
  }
}

export {};
