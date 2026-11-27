export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_REVOKE_CHANNEL = 'auth.revoke';

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

export interface RealtimeRevocation {
  userId?: string;
  sessionId?: string;
}
