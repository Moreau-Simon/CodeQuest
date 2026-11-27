import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../services/api-client';

/** US15 (T236) : canaux exposés par `GET /channels` et leurs messages. */
export type ChatChannelKind = 'global' | 'team' | 'event' | 'spectator';

export interface ChatChannelRef {
  id: string;
  name: string;
  kind: ChatChannelKind;
  canWrite?: boolean;
}

export interface ChatMessageView {
  id: string;
  channelId: string;
  authorName: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  clientMessageId?: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ChatSanctionView {
  kind: string;
  reason: string;
  expiresAt: string;
}

/** T233/T235 : jeton de salon reçu par socket, jamais placé dans une URL. */
export interface VoiceGrant {
  roomName: string;
  token: string;
  url: string;
  expiresAt: string;
}

export interface ChatState {
  channels: ChatChannelRef[];
  activeChannelId: string | null;
  messages: ChatMessageView[];
  typingName: string | null;
  connected: boolean;
  retryAfterMs: number | null;
  sanction: ChatSanctionView | null;
  error: string | null;
  voiceGrant: VoiceGrant | null;
  setActiveChannel(channelId: string): void;
  send(body: string): Promise<boolean>;
  notifyTyping(): void;
  report(messageId: string, reason: string): Promise<boolean>;
  joinVoice(roomName: string): Promise<VoiceGrant | null>;
  leaveVoice(roomName: string): void;
}

interface SocketLike {
  on(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown, ack?: (response: unknown) => void): void;
  disconnect(): void;
}

type SocketFactory = (url: string, options: Record<string, unknown>) => SocketLike;
interface WindowWithSocketFactory extends Window {
  /** Point d'entrée de test pour le transport E2E (page.addInitScript). */
  __codequestSocketFactory?: SocketFactory;
}

type PendingSend = Pick<ChatMessageView, 'channelId' | 'body' | 'clientMessageId'> &
  Partial<ChatMessageView>;

interface ChatHistoryResponse {
  items: ChatMessageView[];
  nextCursor: string | null;
}

function newClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

function dataOf(payload: unknown): Record<string, unknown> {
  const envelope = payload as { data?: unknown } | null;
  const data = envelope?.data ?? payload;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

function toMessage(data: Record<string, unknown>): ChatMessageView | null {
  if (typeof data.messageId !== 'string' || typeof data.channelId !== 'string') return null;
  return {
    id: data.messageId,
    channelId: data.channelId,
    authorName: String(data.authorName ?? ''),
    body: String(data.body ?? ''),
    createdAt: String(data.createdAt ?? ''),
    deleted: false
  };
}

function upsert(list: ChatMessageView[], message: ChatMessageView): ChatMessageView[] {
  if (list.some((item) => item.id === message.id)) {
    return list.map((item) => (item.id === message.id ? { ...item, ...message } : item));
  }
  return [...list, message].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

/**
 * T236 (FR-091/FR-092) : abonnement aux canaux, historique REST, envoi
 * idempotent et reconnexion. Le `clientMessageId` est conservé tant que le
 * serveur n'a pas acquitté l'envoi : un rejeu ne duplique jamais le message.
 */
export function useChat(options: { channels?: ChatChannelRef[]; enabled?: boolean } = {}): ChatState {
  const [remoteChannels, setRemoteChannels] = useState<ChatChannelRef[]>([]);
  const channels = options.channels ?? remoteChannels;
  const [activeChannelId, setActiveState] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const [byChannel, setByChannel] = useState<Record<string, ChatMessageView[]>>({});
  const [typingName, setTypingName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [sanction, setSanction] = useState<ChatSanctionView | null>(null);
  const [voiceGrant, setVoiceGrant] = useState<VoiceGrant | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<SocketLike | null>(null);
  const pendingRef = useRef(new Map<string, PendingSend>());
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingRef = useRef(0);
  const enabled = options.enabled !== false;

  const channelKey = channels.map((channel) => channel.id).join('|');

  useEffect(() => {
    if (options.channels || !enabled) return;
    let active = true;
    void api
      .get<ChatChannelRef[]>('/channels')
      .then((listed) => {
        if (active) setRemoteChannels(Array.isArray(listed) ? listed : []);
      })
      .catch(() => {
        if (active) setError('chat.error');
      });
    return () => {
      active = false;
    };
  }, [options.channels, enabled]);

  useEffect(() => {
    if (!channelKey) {
      activeRef.current = null;
      setActiveState(null);
      return;
    }
    if (!activeRef.current || !channelKey.split('|').includes(activeRef.current)) {
      const first = channelKey.split('|')[0] ?? null;
      activeRef.current = first;
      setActiveState(first);
    }
  }, [channelKey]);

  useEffect(() => {
    if (!enabled || !channelKey) return;
    let active = true;
    for (const channel of channels) {
      void api
        .get<ChatHistoryResponse>(`/channels/${encodeURIComponent(channel.id)}/messages`)
        .then((page) => {
          if (!active || !Array.isArray(page?.items)) return;
          setByChannel((current) => {
            const local = (current[channel.id] ?? []).filter((item) => item.pending);
            const merged = [...page.items];
            for (const message of local) {
              if (!merged.some((item) => item.id === message.id)) merged.push(message);
            }
            merged.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
            return { ...current, [channel.id]: merged };
          });
        })
        .catch(() => {
          // Un canal inaccessible est simplement laissé vide : le serveur
          // refusera aussi toute écriture (FR-092).
        });
    }
    return () => {
      active = false;
    };
    // `channelKey` identifie la liste exacte des canaux abonnés.
  }, [channelKey, enabled]);

  useEffect(() => {
    if (!enabled || !channelKey) return;

    const factory = (window as WindowWithSocketFactory).__codequestSocketFactory;
    const socket: SocketLike = factory
      ? factory('/realtime', { withCredentials: true })
      : (io('/realtime', {
          withCredentials: true,
          transports: ['websocket', 'polling']
        }) as unknown as SocketLike);
    socketRef.current = socket;

    const rooms = channelKey.split('|').map((id) => `channel:${id}`);
    const emitRoomUpdate = (event: 'room.join' | 'room.leave'): void => {
      for (const room of rooms) socket.emit(event, { room });
    };
    emitRoomUpdate('room.join');

    const settle = (entry: PendingSend, response: unknown): void => {
      const ack = dataOf(response);
      if (ack.ok === true && typeof ack.messageId === 'string') {
        pendingRef.current.delete(entry.clientMessageId ?? '');
        setByChannel((current) => {
          const list = current[entry.channelId] ?? [];
          const replaced = list.map((item) =>
            item.clientMessageId === entry.clientMessageId
              ? { ...item, id: ack.messageId as string, pending: false, clientMessageId: undefined }
              : item
          );
          const withoutDuplicate = replaced.filter(
            (item, index) => replaced.findIndex((other) => other.id === item.id) === index
          );
          return { ...current, [entry.channelId]: withoutDuplicate };
        });
        setRetryAfterMs(null);
      } else if (ack.code === 'RATE_LIMITED') {
        setRetryAfterMs(Number(ack.retryAfterMs ?? 0));
      }
    };

    const replay = (): void => {
      for (const entry of pendingRef.current.values()) {
        socket.emit(
          'chat.send',
          {
            channelId: entry.channelId,
            body: entry.body,
            clientMessageId: entry.clientMessageId
          },
          (response) => settle(entry, response)
        );
      }
    };

    const onMessage = (payload: unknown): void => {
      const message = toMessage(dataOf(payload));
      if (!message) return;
      setByChannel((current) => ({
        ...current,
        [message.channelId]: upsert(current[message.channelId] ?? [], message)
      }));
    };
    const onDeleted = (payload: unknown): void => {
      const data = dataOf(payload);
      if (typeof data.messageId !== 'string' || typeof data.channelId !== 'string') return;
      setByChannel((current) => ({
        ...current,
        [data.channelId as string]: (current[data.channelId as string] ?? []).map((item) =>
          item.id === data.messageId ? { ...item, deleted: true } : undefined
        ).filter((item): item is ChatMessageView => item !== undefined)
      }));
    };
    const onTyping = (payload: unknown): void => {
      const data = dataOf(payload);
      if (data.channelId !== activeRef.current) return;
      setTypingName(String(data.authorName ?? ''));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(
        () => setTypingName(null),
        Math.max(1, Number(data.expiresInMs ?? 3_000))
      );
    };
    const onSanction = (payload: unknown): void => {
      const data = dataOf(payload);
      if (typeof data.kind !== 'string') return;
      setSanction({
        kind: data.kind,
        reason: String(data.reason ?? ''),
        expiresAt: String(data.expiresAt ?? '')
      });
    };
    const onVoiceToken = (payload: unknown): void => {
      const data = dataOf(payload);
      if (typeof data.token !== 'string' || typeof data.roomName !== 'string') return;
      setVoiceGrant({
        roomName: data.roomName,
        token: data.token,
        url: String(data.url ?? ''),
        expiresAt: String(data.expiresAt ?? '')
      });
    };
    const onConnect = (): void => {
      setConnected(true);
      emitRoomUpdate('room.join');
      replay();
    };
    const onDisconnect = (): void => {
      setConnected(false);
    };

    socket.on('chat.message', onMessage);
    socket.on('chat.deleted', onDeleted);
    socket.on('chat.typing', onTyping);
    socket.on('chat.sanction', onSanction);
    socket.on('voice.token', onVoiceToken);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('chat.message', onMessage);
      socket.off('chat.deleted', onDeleted);
      socket.off('chat.typing', onTyping);
      socket.off('chat.sanction', onSanction);
      socket.off('voice.token', onVoiceToken);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      emitRoomUpdate('room.leave');
      socket.disconnect();
      socketRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      setConnected(false);
    };
  }, [channelKey, enabled]);

  const setActiveChannel = useCallback((channelId: string) => {
    activeRef.current = channelId;
    setActiveState(channelId);
    setTypingName(null);
  }, []);

  const send = useCallback(async (body: string): Promise<boolean> => {
    const channelId = activeRef.current;
    if (!channelId || typeof body !== 'string' || !body.trim() || body.length > 2_000) {
      return false;
    }
    const clientMessageId = newClientMessageId();
    const entry: PendingSend = {
      channelId,
      body,
      clientMessageId,
      id: clientMessageId,
      authorName: '',
      createdAt: new Date().toISOString(),
      deleted: false,
      pending: true
    };
    pendingRef.current.set(clientMessageId, entry);
    setByChannel((current) => ({
      ...current,
      [channelId]: upsert(current[channelId] ?? [], entry as ChatMessageView)
    }));

    return new Promise<boolean>((resolve) => {
      const ack = (response: unknown): void => {
        const result = dataOf(response);
        if (result.ok === true && typeof result.messageId === 'string') {
          pendingRef.current.delete(clientMessageId);
          setByChannel((current) => ({
            ...current,
            [channelId]: (current[channelId] ?? []).map((item) =>
              item.clientMessageId === clientMessageId
                ? {
                    ...item,
                    id: result.messageId as string,
                    pending: false,
                    clientMessageId: undefined
                  }
                : item
            )
          }));
          setRetryAfterMs(null);
          resolve(true);
          return;
        }
        if (result.code === 'RATE_LIMITED') {
          setRetryAfterMs(Number(result.retryAfterMs ?? 0));
        } else {
          setError('chat.error');
        }
        resolve(false);
      };

      if (!socketRef.current) {
        ack({ ok: false, code: 'NETWORK' });
        return;
      }
      socketRef.current.emit(
        'chat.send',
        { channelId, body, clientMessageId },
        ack
      );
    });
  }, []);

  const notifyTyping = useCallback((): void => {
    const channelId = activeRef.current;
    if (!channelId || !socketRef.current) return;
    const now = Date.now();
    if (now - lastTypingRef.current < 2_000) return;
    lastTypingRef.current = now;
    socketRef.current.emit('chat.typing', { channelId });
  }, []);

  const joinVoice = useCallback(
    async (roomName: string): Promise<VoiceGrant | null> => {
      const socket = socketRef.current;
      if (!socket || !roomName) return null;
      return new Promise<VoiceGrant | null>((resolve) => {
        socket.emit('voice.join', { roomName }, (response: unknown) => {
          const ack = dataOf(response);
          if (
            ack.ok !== true ||
            typeof ack.token !== 'string' ||
            typeof ack.roomName !== 'string'
          ) {
            setError('voice.requestFailed');
            resolve(null);
            return;
          }
          const grant: VoiceGrant = {
            roomName: ack.roomName,
            token: ack.token,
            url: String(ack.url ?? ''),
            expiresAt: String(ack.expiresAt ?? '')
          };
          setVoiceGrant(grant);
          resolve(grant);
        });
      });
    },
    []
  );

  const leaveVoice = useCallback((roomName: string): void => {
    socketRef.current?.emit('voice.leave', { roomName });
    setVoiceGrant(null);
  }, []);

  const report = useCallback(
    async (messageId: string, reason: string): Promise<boolean> => {
      const channelId = activeRef.current;
      if (!channelId) return false;
      try {
        await api.post(
          `/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reports`,
          { reason }
        );
        return true;
      } catch {
        setError('chat.error');
        return false;
      }
    },
    []
  );

  const messages = useMemo(
    () => (activeChannelId ? (byChannel[activeChannelId] ?? []) : []),
    [activeChannelId, byChannel]
  );

  return {
    channels,
    activeChannelId,
    messages,
    typingName,
    connected,
    retryAfterMs,
    sanction,
    error,
    voiceGrant,
    setActiveChannel,
    send,
    notifyTyping,
    report,
    joinVoice,
    leaveVoice
  };
}
