import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bus = vi.hoisted(() => ({
  sockets: [] as Array<{
    listeners: Map<string, Set<(payload: unknown) => void>>;
    emit(event: string, payload: unknown): void;
  }>
}));

vi.mock('socket.io-client', () => ({
  io: () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const socket = {
      listeners,
      on(event: string, callback: (payload: unknown) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)?.add(callback);
      },
      emit(event: string, payload: unknown) {
        if (event === 'doc.awareness') {
          const cursor = (payload as { cursor: { line: number; ch: number } }).cursor;
          for (const other of bus.sockets) {
            if (other === socket) continue;
            for (const callback of other.listeners.get('doc.awareness') ?? []) {
              callback({ data: { clients: [{ userId: 'ada', cursor }] } });
            }
          }
          return;
        }
        for (const other of bus.sockets) {
          if (other === socket) continue;
          for (const callback of other.listeners.get(event) ?? []) callback(payload);
        }
      },
      disconnect() {
        const index = bus.sockets.indexOf(socket);
        if (index >= 0) bus.sockets.splice(index, 1);
      }
    };
    bus.sockets.push(socket);
    return socket;
  }
}));

import { useCollaborativeDoc } from './useCollaborativeDoc';

const TEAM_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02';
const CHALLENGE_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03';

describe('useCollaborativeDoc (T162, FR-057)', () => {
  beforeEach(() => {
    bus.sockets.length = 0;
  });

  function twoPlayers() {
    const first = renderHook(() =>
      useCollaborativeDoc({
        teamId: TEAM_ID,
        challengeId: CHALLENGE_ID,
        initialCode: 'def solve(v):\n    return v\n'
      })
    );
    const second = renderHook(() =>
      useCollaborativeDoc({
        teamId: TEAM_ID,
        challengeId: CHALLENGE_ID,
        initialCode: 'def solve(v):\n    return v\n'
      })
    );
    return { first, second };
  }

  it('converge vers le même texte sans dupliquer le code initial', () => {
    const { first, second } = twoPlayers();
    expect(first.result.current.text).toBe('def solve(v):\n    return v\n');
    expect(second.result.current.text).toBe('def solve(v):\n    return v\n');

    act(() => first.result.current.setText('def solve(v):\n    return sorted(v)\n'));
    expect(second.result.current.text).toBe('def solve(v):\n    return sorted(v)\n');

    act(() => second.result.current.setText('def solve(v):\n    return list(v)\n'));
    expect(first.result.current.text).toBe('def solve(v):\n    return list(v)\n');

    first.unmount();
    second.unmount();
  });

  it('diffuse la position du curseur aux autres participants', () => {
    const { first, second } = twoPlayers();
    act(() => first.result.current.sendCursor({ line: 1, ch: 4 }));
    expect(second.result.current.cursors).toEqual([{ userId: 'ada', line: 1, ch: 4 }]);
    first.unmount();
    second.unmount();
  });

  it('reste inactif sans équipe', () => {
    const solo = renderHook(() =>
      useCollaborativeDoc({ challengeId: CHALLENGE_ID, initialCode: 'def solve(v): pass\n' })
    );
    expect(solo.result.current.doc).toBeNull();
    expect(solo.result.current.connected).toBe(false);
    expect(bus.sockets).toHaveLength(0);
    solo.unmount();
  });
});
