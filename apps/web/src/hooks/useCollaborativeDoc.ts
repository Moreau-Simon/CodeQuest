import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';

export interface RemoteCursor {
  userId: string;
  line: number;
  ch: number;
}

interface SocketLike {
  on(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown): void;
  disconnect(): void;
}

type SocketFactory = (url: string, options: Record<string, unknown>) => SocketLike;

interface WindowWithSocketFactory extends Window {
  /** Point d'entrée de test pour le transport E2E (page.addInitScript). */
  __codequestSocketFactory?: SocketFactory;
}

export interface CollaborativeDocOptions {
  teamId?: string;
  challengeId: string;
  initialCode: string;
  enabled?: boolean;
}

export interface CollaborativeDocResult {
  doc: Y.Doc | null;
  text: string;
  cursors: RemoteCursor[];
  connected: boolean;
  /** Appelle ce callback depuis Monaco pour publier la position du curseur. */
  sendCursor(cursor: { line: number; ch: number }): void;
  /** Remplace le contenu partagé (utilisé hors MonacoBinding). */
  setText(value: string): void;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function envelopeData(payload: unknown, key: string): unknown {
  const envelope = payload as { data?: Record<string, unknown> } | null;
  const direct = payload as Record<string, unknown> | null;
  return envelope?.data?.[key] ?? direct?.[key];
}

/**
 * Édition collaborative (T162, FR-057) : un `Y.Doc` partagé sur le canal
 * `/realtime`, updates Yjs encodés en base64 et awareness éphémère. Le seed
 * utilise un `clientID` constant afin que deux onglets convergents ne dupliquent
 * pas le code initial ; les modifications locales gardent un `clientID` aléatoire.
 */
export function useCollaborativeDoc({
  teamId,
  challengeId,
  initialCode,
  enabled = true
}: CollaborativeDocOptions): CollaborativeDocResult {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [text, setTextState] = useState(initialCode);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<SocketLike | null>(null);
  const docIdRef = useRef('');

  const sendCursor = useCallback((cursor: { line: number; ch: number }) => {
    socketRef.current?.emit('doc.awareness', { docId: docIdRef.current, cursor });
  }, []);

  const setText = useCallback(
    (value: string) => {
      if (!doc) {
        setTextState(value);
        return;
      }
      const ytext = doc.getText('code');
      if (ytext.toString() === value) return;
      ytext.delete(0, ytext.length);
      ytext.insert(0, value);
    },
    [doc]
  );

  useEffect(() => {
    if (!enabled || !teamId) {
      setDoc(null);
      setConnected(false);
      return;
    }

    let active = true;
    const docId = `${teamId}:${challengeId}`;
    docIdRef.current = docId;
    const shared = new Y.Doc();

    if (initialCode) {
      const seed = new Y.Doc();
      seed.clientID = 0;
      seed.getText('code').insert(0, initialCode);
      Y.applyUpdate(shared, Y.encodeStateAsUpdate(seed), 'seed');
      seed.destroy();
    }
    setTextState(shared.getText('code').toString());
    setDoc(shared);

    const factory = (window as WindowWithSocketFactory).__codequestSocketFactory;
    const socket: SocketLike = factory
      ? factory('/realtime', { withCredentials: true })
      : (io('/realtime', { withCredentials: true, transports: ['websocket', 'polling'] }) as unknown as SocketLike);
    socketRef.current = socket;
    setConnected(true);

    const observeText = (): void => {
      if (active) setTextState(shared.getText('code').toString());
    };
    shared.getText('code').observe(observeText);

    const broadcast = (update: Uint8Array, origin: unknown): void => {
      if (!active || origin === 'remote' || origin === 'seed') return;
      socket.emit('doc.update', { docId, update: toBase64(update) });
    };
    shared.on('update', broadcast);

    socket.on('doc.update', (payload: unknown) => {
      if (!active) return;
      const update = envelopeData(payload, 'update');
      if (typeof update !== 'string') return;
      Y.applyUpdate(shared, fromBase64(update), 'remote');
    });

    socket.on('doc.awareness', (payload: unknown) => {
      if (!active) return;
      const clients = envelopeData(payload, 'clients');
      if (!Array.isArray(clients)) return;
      setCursors(
        clients
          .filter(
            (client): client is { userId: string; cursor: { line: number; ch: number } } =>
              typeof client === 'object' &&
              client !== null &&
              typeof (client as { userId?: unknown }).userId === 'string' &&
              typeof (client as { cursor?: { line?: unknown; ch?: unknown } }).cursor?.line === 'number' &&
              typeof (client as { cursor?: { line?: unknown; ch?: unknown } }).cursor?.ch === 'number'
          )
          .map((client) => ({ userId: client.userId, ...client.cursor }))
      );
    });

    return () => {
      active = false;
      shared.off('update', broadcast);
      shared.getText('code').unobserve(observeText);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      shared.destroy();
      setDoc(null);
    };
  }, [teamId, challengeId, initialCode, enabled]);

  return { doc, text, cursors, connected, sendCursor, setText };
}
