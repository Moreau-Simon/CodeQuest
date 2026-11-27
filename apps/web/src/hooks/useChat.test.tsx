import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSocket {
  listeners: Map<string, Set<(payload: unknown) => void>>;
  on(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: (payload: unknown) => void): void;
  emit(event: string, payload: unknown, ack?: (response: unknown) => void): void;
  disconnect(): void;
  trigger(event: string, payload: unknown): void;
}

const bus = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  sends: [] as Array<{ payload: Record<string, unknown>; ack?: (response: unknown) => void }>,
  emits: [] as Array<{
    event: string;
    payload: unknown;
    ack?: (response: unknown) => void;
  }>
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket: FakeSocket = {
      listeners: new Map(),
      on(event, listener) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)?.add(listener);
      },
      off(event, listener) {
        this.listeners.get(event)?.delete(listener);
      },
      emit(event, payload, ack) {
        bus.emits.push({ event, payload, ack });
        if (event === 'chat.send') {
          bus.sends.push({ payload: payload as Record<string, unknown>, ack });
        }
      },
      disconnect() {
        const index = bus.sockets.indexOf(socket);
        if (index >= 0) bus.sockets.splice(index, 1);
      },
      trigger(event, payload) {
        for (const listener of this.listeners.get(event) ?? []) listener(payload);
      }
    };
    bus.sockets.push(socket);
    return socket;
  }
}));

import { useChat, type ChatChannelRef } from './useChat';

const GLOBAL_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02';
const TEAM_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03';
const CHANNELS: ChatChannelRef[] = [
  { id: GLOBAL_ID, name: 'Global', kind: 'global', canWrite: true },
  { id: TEAM_ID, name: 'Équipe', kind: 'team', canWrite: true }
];
const HISTORY = {
  items: [
    {
      id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
      channelId: GLOBAL_ID,
      authorName: 'ada',
      body: 'Historique',
      createdAt: '2031-06-03T09:59:00.000Z',
      deleted: false
    }
  ],
  nextCursor: null
};

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => payload
  } as unknown as Response;
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/channels')) return jsonResponse(CHANNELS);
      if (url.includes('/messages')) return jsonResponse(HISTORY);
      if (url.includes('/reports')) return jsonResponse({ reported: true });
      return jsonResponse({});
    })
  );
}

describe('useChat (T236, US15)', () => {
  beforeEach(() => {
    bus.sockets.length = 0;
    bus.sends.length = 0;
    bus.emits.length = 0;
    stubFetch();
  });

  it('charge les canaux et ajoute un message reçu par le socket sans le dupliquer', async () => {
    const { result, unmount } = renderHook(() => useChat());

    await waitFor(() => expect(result.current.channels).toEqual(CHANNELS));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(bus.sockets[0]?.listeners.has('chat.message')).toBe(true);

    const payload = {
      channelId: GLOBAL_ID,
      messageId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b04',
      authorName: 'grace',
      body: 'Bonjour',
      createdAt: '2031-06-03T10:00:00.000Z'
    };
    act(() => bus.sockets[0]?.trigger('chat.message', { data: payload }));
    expect(result.current.messages.map((message) => message.body)).toEqual([
      'Historique',
      'Bonjour'
    ]);

    act(() => bus.sockets[0]?.trigger('chat.message', { data: payload }));
    expect(result.current.messages).toHaveLength(2);
    unmount();
  });

  it('conserve le clientMessageId pour rejouer un envoi après reconnexion', async () => {
    const { result, unmount } = renderHook(() => useChat({ channels: CHANNELS }));

    await act(async () => {
      void result.current.send('Salut');
    });
    expect(bus.sends[0]?.payload).toMatchObject({ channelId: GLOBAL_ID, body: 'Salut' });
    const clientMessageId = String(bus.sends[0]?.payload.clientMessageId);
    expect(clientMessageId).toMatch(/^[0-9a-f-]{36}$/i);

    // Échec réseau : l'entrée optimiste reste en attente d'un rejeu.
    act(() => bus.sends[0]?.ack?.({ ok: false, code: 'NETWORK' }));
    act(() => bus.sockets[0]?.trigger('connect', {}));
    await waitFor(() => expect(bus.sends.length).toBeGreaterThan(1));
    expect(bus.sends.at(-1)?.payload.clientMessageId).toBe(clientMessageId);

    act(() =>
      bus.sends.at(-1)?.ack?.({
        ok: true,
        messageId: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b06'
      })
    );
    await waitFor(() =>
      expect(result.current.messages.some((message) => message.body === 'Salut' && !message.pending)).toBe(
        true
      )
    );
    unmount();
  });

  it('expose retryAfterMs et signale un message via REST', async () => {
    const { result, unmount } = renderHook(() => useChat({ channels: CHANNELS }));

    await act(async () => {
      void result.current.send('Trop vite');
    });
    act(() =>
      bus.sends[0]?.ack?.({ ok: false, code: 'RATE_LIMITED', retryAfterMs: 1500 })
    );
    await waitFor(() => expect(result.current.retryAfterMs).toBe(1500));

    await act(async () => {
      expect(await result.current.report('message-1', 'spam')).toBe(true);
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/channels/${GLOBAL_ID}/messages/message-1/reports`),
      expect.objectContaining({ method: 'POST' })
    );
    unmount();
  });

  it('rejoint un salon vocal après accord explicite et conserve le jeton hors URL', async () => {
    const { result, unmount } = renderHook(() => useChat({ channels: CHANNELS }));
    const roomName = `channel:${TEAM_ID}`;
    let grant: Awaited<ReturnType<typeof result.current.joinVoice>> = null;

    await act(async () => {
      const pending = result.current.joinVoice(roomName);
      bus.emits.at(-1)?.ack?.({
        ok: true,
        roomName,
        token: 'jeton-court',
        url: 'wss://livekit.example',
        expiresAt: '2031-06-03T10:01:00.000Z'
      });
      grant = await pending;
    });

    expect(bus.emits.find((entry) => entry.event === 'voice.join')).toMatchObject({
      event: 'voice.join',
      payload: { roomName }
    });
    expect(grant).toMatchObject({ token: 'jeton-court', roomName });
    expect(result.current.voiceGrant?.token).toBe('jeton-court');
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([input]) => !String(input).includes('jeton-court'))
    ).toBe(true);

    act(() =>
      bus.sockets[0]?.trigger('voice.token', {
        data: {
          roomName,
          token: 'jeton-renouvele',
          url: 'wss://livekit.example',
          expiresAt: '2031-06-03T10:02:00.000Z'
        }
      })
    );
    expect(result.current.voiceGrant?.token).toBe('jeton-renouvele');

    act(() => result.current.leaveVoice(roomName));
    expect(bus.emits.find((entry) => entry.event === 'voice.leave')).toMatchObject({
      event: 'voice.leave',
      payload: { roomName }
    });
    expect(result.current.voiceGrant).toBeNull();
    unmount();
  });
});
