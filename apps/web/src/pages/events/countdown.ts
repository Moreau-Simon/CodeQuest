import type { Event } from '../../services/events';

/**
 * Décalage entre l'horloge serveur (renvoyée avec chaque événement) et
 * l'horloge locale. Les comptes à rebours des événements ne dépendent donc
 * jamais de l'heure du navigateur (FR-061).
 */
export function serverOffset(event: Event): number {
  return new Date(event.serverNow).getTime() - Date.now();
}

/** Formate un compte à rebours positif, en heures et minutes. */
export function formatCountdown(target: string, offsetMs: number): string {
  const remaining = new Date(target).getTime() - (Date.now() + offsetMs);
  if (remaining <= 0) return '0 min';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.max(1, Math.ceil((remaining % 3_600_000) / 60_000));
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

/** Affiche une borne dans le fuseau IANA déclaré par l'événement. */
export function formatInTimezone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
