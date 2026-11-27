import { Injectable } from '@nestjs/common';
import { eventRoom, NOTIFICATION_NEW, spectatorRoom } from './realtime.constants';
import { RealtimeGateway } from './realtime.gateway';

/** Contrat `websocket-events.md` §3.5 (FR-097 → FR-101). */
export const ROUND_EVENTS = {
  started: 'round.started',
  warning: 'round.warning',
  closed: 'round.closed',
  eliminated: 'participant.eliminated',
  finished: 'event.finished'
} as const;

/** Contrat `websocket-events.md` §3.6 (notification.new). */
export { NOTIFICATION_NEW };

export interface RoundStartedPayload {
  eventId: string;
  roundNumber: number;
  challengeId: string;
  endsAt: string;
}

export interface RoundClosedPayload {
  roundNumber: number;
  results: Array<{ subjectId: string; score: number }>;
}

/**
 * Diffusion des manches (T224) : l'enveloppe commune est portée par
 * `RealtimeGateway.emitToRoom`. Les deux salles reçoivent le même flux ;
 * un socket n'en rejoint qu'une seule (participant ou spectateur).
 */
@Injectable()
export class BattleRoyaleGateway {
  constructor(private readonly realtime: RealtimeGateway) {}

  started(payload: RoundStartedPayload): void {
    this.emit(payload.eventId, ROUND_EVENTS.started, { ...payload });
  }

  warning(eventId: string, roundNumber: number, remainingMs: number): void {
    this.emit(eventId, ROUND_EVENTS.warning, { roundNumber, remainingMs });
  }

  closed(eventId: string, payload: RoundClosedPayload): void {
    this.emit(eventId, ROUND_EVENTS.closed, { ...payload });
  }

  eliminated(
    eventId: string,
    payload: { subjectId: string; roundNumber: number; remaining: number; reason: string }
  ): void {
    this.emit(eventId, ROUND_EVENTS.eliminated, { ...payload });
  }

  finished(eventId: string, winner: { subjectId: string; displayName: string }): void {
    this.emit(eventId, ROUND_EVENTS.finished, { eventId, winner });
  }

  /** FR-101 : les inscrits sont informés quand la battle royale est reportée. */
  postponed(eventId: string, userIds: readonly string[]): void {
    for (const userId of userIds) {
      this.realtime.emitToUser(userId, NOTIFICATION_NEW, {
        kind: 'event_postponed',
        payload: { eventId, reason: 'min_participants' }
      });
    }
  }

  private emit(eventId: string, type: string, data: Record<string, unknown>): void {
    for (const room of [eventRoom(eventId), spectatorRoom(eventId)]) {
      this.realtime.emitToRoom(room, type, data);
    }
  }
}
