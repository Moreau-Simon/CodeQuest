export const REALTIME_NAMESPACE = '/realtime';
export const REALTIME_REVOKE_CHANNEL = 'auth.revoke';

export interface RealtimeRevocation {
  userId?: string;
  sessionId?: string;
}
