export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_REVOKE_CHANNEL = 'auth.revoke';

/** Room Socket.IO d'un document collaboratif (contrat `websocket-events.md`). */
export function documentRoom(teamId: string, challengeId: string): string {
  return `doc:${teamId}:${challengeId}`;
}

export interface RealtimeRevocation {
  userId?: string;
  sessionId?: string;
}
