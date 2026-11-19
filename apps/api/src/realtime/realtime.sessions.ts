/**
 * Analyse l'en-tête `Cookie` d'un handshake Socket.IO.
 * Volontairement sans dépendance : le parseur HTTP de cookie-parser n'expose
 * pas son résultat sur les upgrades WebSocket.
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};

  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    cookies[name] = value;
  }
  return cookies;
}

export interface RealtimeSocket {
  id: string;
  data: { userId?: string; sessionId?: string };
  disconnect(close?: boolean): void;
}

/**
 * Registre des sockets authentifiés (T033, FR-017).
 * La révocation ferme tous les sockets d'un utilisateur ou d'une session en
 * moins de 5 s, y compris sur une autre instance via le canal `auth.revoke`.
 */
export class RealtimeSessions {
  private readonly sockets = new Map<string, RealtimeSocket>();

  register(socket: RealtimeSocket): void {
    this.sockets.set(socket.id, socket);
  }

  unregister(socketId: string): void {
    this.sockets.delete(socketId);
  }

  revokeUser(userId: string): number {
    let closed = 0;
    for (const socket of this.sockets.values()) {
      if (socket.data.userId === userId) {
        socket.disconnect(true);
        this.sockets.delete(socket.id);
        closed += 1;
      }
    }
    return closed;
  }

  revokeSession(sessionId: string): number {
    let closed = 0;
    for (const socket of this.sockets.values()) {
      if (socket.data.sessionId === sessionId) {
        socket.disconnect(true);
        this.sockets.delete(socket.id);
        closed += 1;
      }
    }
    return closed;
  }

  count(): number {
    return this.sockets.size;
  }
}
