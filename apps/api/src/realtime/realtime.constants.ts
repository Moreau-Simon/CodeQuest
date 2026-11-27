export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_REVOKE_CHANNEL = 'auth.revoke';

/**
 * Contrat `websocket-events.md` §3.6 (FR-104) : canal de notification par
 * utilisateur (`user:<userId>`). Constante sans effet de bord, importable
 * avant l'initialisation de l'environnement (tests d'intégration).
 */
export const NOTIFICATION_NEW = 'notification.new';

/** Room Socket.IO d'un document collaboratif (contrat `websocket-events.md`). */
export function documentRoom(teamId: string, challengeId: string): string {
  return `doc:${teamId}:${challengeId}`;
}

/** US14 : salle des participants et spectateurs d'une battle royale. */
export function eventRoom(eventId: string): string {
  return `event:${eventId}`;
}

/** US14 : salle en lecture seule des joueurs éliminés (FR-099). */
export function spectatorRoom(eventId: string): string {
  return `event:${eventId}:spectators`;
}

/** US15 : salle d'un canal de chat (contrat `websocket-events.md` §2). */
export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export interface RealtimeRevocation {
  userId?: string;
  sessionId?: string;
}
