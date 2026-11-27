import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * T225 [US14] — flux temps réel d'une battle royale (contrat §3.5).
 *
 * Le socket est purement incrémental : les manches et les résultats initiaux
 * viennent du REST (`GET /events/:id/rounds`). Aucun événement n'est émis par
 * le navigateur autre que l'abonnement à la salle de l'événement.
 */
export interface BattleLiveState {
  connected: boolean;
  active: { roundNumber: number; challengeId: string; endsAt: string } | null;
  warningMs: number | null;
  closed: { roundNumber: number; results: Array<{ subjectId: string; score: number }> } | null;
  eliminated: { subjectId: string; roundNumber: number; remaining: number } | null;
  winner: { subjectId: string; displayName: string } | null;
}

const INITIAL: BattleLiveState = {
  connected: false,
  active: null,
  warningMs: null,
  closed: null,
  eliminated: null,
  winner: null
};

function dataOf(payload: unknown): Record<string, unknown> {
  const envelope = payload as { data?: unknown } | null;
  const data = envelope?.data ?? payload;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

export function useBattleRoyale(eventId: string, selfId: string | null): BattleLiveState {
  const [state, setState] = useState<BattleLiveState>(INITIAL);

  useEffect(() => {
    if (!eventId) return;

    let mounted = true;
    const socket: Socket = io('/realtime', {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    const apply = (change: (current: BattleLiveState) => BattleLiveState): void => {
      if (mounted) setState((current) => change(current));
    };

    socket.on('connect', () => {
      if (mounted) socket.emit('battle.subscribe', { eventId });
    });
    socket.on('round.started', (payload: unknown) => {
      const data = dataOf(payload);
      apply((current) => ({
        ...current,
        closed: null,
        warningMs: null,
        active: {
          roundNumber: Number(data.roundNumber),
          challengeId: String(data.challengeId ?? ''),
          endsAt: String(data.endsAt ?? '')
        }
      }));
    });
    socket.on('round.warning', (payload: unknown) => {
      const data = dataOf(payload);
      apply((current) => ({ ...current, warningMs: Number(data.remainingMs) }));
    });
    socket.on('round.closed', (payload: unknown) => {
      const data = dataOf(payload);
      const results = Array.isArray(data.results)
        ? (data.results as Array<{ subjectId?: unknown; score?: unknown }>).map((result) => ({
            subjectId: String(result.subjectId ?? ''),
            score: Number(result.score ?? 0)
          }))
        : [];
      apply((current) => ({
        ...current,
        warningMs: null,
        closed: { roundNumber: Number(data.roundNumber), results }
      }));
    });
    socket.on('participant.eliminated', (payload: unknown) => {
      const data = dataOf(payload);
      const subjectId = String(data.subjectId ?? '');
      if (selfId && subjectId !== selfId) return;
      apply((current) => ({
        ...current,
        eliminated: {
          subjectId,
          roundNumber: Number(data.roundNumber),
          remaining: Number(data.remaining)
        }
      }));
    });
    socket.on('event.finished', (payload: unknown) => {
      const winner = dataOf(payload).winner as
        | { subjectId?: unknown; displayName?: unknown }
        | undefined;
      if (!winner) return;
      apply((current) => ({
        ...current,
        winner: {
          subjectId: String(winner.subjectId ?? ''),
          displayName: String(winner.displayName ?? '')
        }
      }));
    });

    // Socket.IO met en mémoire les émissions faites avant `connect`.
    socket.emit('battle.subscribe', { eventId });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [eventId, selfId]);

  return state;
}
