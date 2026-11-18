import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { readFileSync } from 'node:fs';

/**
 * Mots de passe les plus courants (échantillon local, FR-002).
 *
 * La liste complète peut être fournie hors dépôt via
 * `COMPROMISED_PASSWORDS_FILE` (un mot de passe par ligne) ; le fichier est
 * rechargé paresseusement. Finding U2 : la source de production (jeu de
 * données « breached passwords ») reste à brancher sur l'infrastructure.
 */
const EMBEDDED_COMPROMISED = [
  '123456789012',
  'password1234',
  'motdepasse123',
  'qwertyuiop12',
  'azertyuiop12',
  'iloveyou1234',
  'administrator',
  'passwordpassword',
  'letmein123456',
  'welcome123456',
  'correcthorsebatterystaple'
];

/** Paramètres Argon2id de la constitution (19 MiB, 2 itérations, parallélisme 1). */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;

@Injectable()
export class PasswordService {
  private compromised?: ReadonlySet<string>;

  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // Hash corrompu ou format inconnu : jamais d'exception vers l'appelant.
      return false;
    }
  }

  /** Vrai si le mot de passe figure dans la liste des mots de passe compromis. */
  isCompromised(password: string): boolean {
    return this.loadCompromised().has(password.toLowerCase());
  }

  private loadCompromised(): ReadonlySet<string> {
    if (this.compromised) return this.compromised;

    const entries = new Set(EMBEDDED_COMPROMISED.map((value) => value.toLowerCase()));
    const file = process.env.COMPROMISED_PASSWORDS_FILE;
    if (file) {
      try {
        // Fichier optionnel, absent en test : lecture directe et tolérante.
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
          const value = line.trim().toLowerCase();
          if (value) entries.add(value);
        }
      } catch {
        // Fichier illisible : on conserve la liste embarquée.
      }
    }

    this.compromised = entries;
    return entries;
  }
}
