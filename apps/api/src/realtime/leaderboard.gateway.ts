import { Injectable } from '@nestjs/common';
import type { LeaderboardScopeType, SubjectType } from '@prisma/client';
import { RealtimeGateway } from './realtime.gateway';
import {
  LEADERBOARD_EVENTS,
  leaderboardRoom,
  type LeaderboardPeriod
} from '../modules/leaderboards/leaderboard.constants';

export interface LeaderboardChange {
  rank: number;
  subjectId: string;
  displayName: string;
  score: number;
}

/**
 * Diffusion des classements (T099, FR-049, contrat `websocket-events.md` §3.2).
 *
 * Les changements sont incrémentaux et ordonnés. Un client qui détecte un trou
 * de curseur recharge la page complète via `GET /leaderboards/...` : le socket
 * n'est jamais la source de vérité.
 */
@Injectable()
export class LeaderboardGateway {
  constructor(private readonly realtime: RealtimeGateway) {}

  updated(
    scope: { type: LeaderboardScopeType; id: string; subjectType: SubjectType },
    period: LeaderboardPeriod,
    changes: LeaderboardChange[]
  ): void {
    if (changes.length === 0) return;

    this.realtime.emitToRoom(
      leaderboardRoom(scope.type, scope.id, scope.subjectType, period),
      LEADERBOARD_EVENTS.updated,
      {
        scope: scope.type,
        scopeId: scope.id,
        subjectType: scope.subjectType,
        period,
        changes,
        computedAt: new Date().toISOString()
      }
    );
  }
}
