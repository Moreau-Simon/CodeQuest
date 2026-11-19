import { Injectable } from '@nestjs/common';

const HINT_PENALTY_RATE = 0.1;
const EXCESS_LINE_PENALTY_RATE = 0.02;
const MAX_PENALTY_RATIO = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface ResolutionScoringInput {
  /** Points de base du défi (identiques à ceux du scoring de tri). */
  basePoints: number;
  /** Bonus maximum, ici lié au temps de résolution plutôt qu'au CPU médian. */
  perfMax: number;
  testsPassed: number;
  testsTotal: number;
  /** Début explicite de l'essai — jamais l'ouverture de la page. */
  startedAt: Date;
  /** Fin du chrono : verdict `passed`, sinon abandon à `expiredAt`. */
  verdictAt?: Date;
  expiredAt?: Date;
  tOptMs: number;
  tMaxMs: number;
  hintsUsed?: number;
  attempts?: number;
  modifiedLines?: number;
  /** Limite configurée de lignes modifiées pour conserver le bonus. */
  maxModifiedLines?: number;
}

export interface ResolutionScoringResult {
  score: number;
  testsRatio: number;
  timeRatio: number;
  resolutionMs: number;
  bonusEligible: boolean;
  hintPenalty: number;
  linePenalty: number;
}

/**
 * Score des défis de débogage/décryptage (T144, FR-038, FR-039, A5).
 *
 * `score = base_points × tests_ratio
 *        + (bonus temps si la limite de lignes est respectée)
 *        − pénalités indices / lignes excédentaires`
 *
 * Le temps est mesuré du `start` explicite au verdict `passed`, plafonné à
 * `t_max_ms`. Sans verdict, il court jusqu'à `attempt.expiredAt` (abandon) puis
 * est plafonné de la même façon. Aucun bonus n'est versé si les tests échouent.
 */
@Injectable()
export class ResolutionScoringService {
  compute(input: ResolutionScoringInput): ResolutionScoringResult {
    this.validate(input);

    const end = input.verdictAt ?? input.expiredAt;
    if (!end || Number.isNaN(end.getTime())) {
      throw new Error('`expiredAt` est requis en l’absence de verdict `passed`');
    }

    const resolutionMs = clamp(end.getTime() - input.startedAt.getTime(), 0, input.tMaxMs);
    const timeRatio = clamp(
      (input.tMaxMs - resolutionMs) / (input.tMaxMs - input.tOptMs),
      0,
      1
    );
    const testsRatio = clamp(input.testsPassed / input.testsTotal, 0, 1);

    const hintsUsed = Math.max(0, input.hintsUsed ?? 0);
    const modifiedLines = Math.max(0, input.modifiedLines ?? 0);
    const maxModifiedLines = input.maxModifiedLines ?? Number.POSITIVE_INFINITY;
    const bonusEligible = modifiedLines <= maxModifiedLines;

    const hintPenalty = Math.min(
      input.basePoints * HINT_PENALTY_RATE * hintsUsed,
      input.basePoints * MAX_PENALTY_RATIO
    );
    const linePenalty = bonusEligible
      ? 0
      : Math.min(
          input.basePoints * EXCESS_LINE_PENALTY_RATE * (modifiedLines - maxModifiedLines),
          input.basePoints * MAX_PENALTY_RATIO
        );

    const raw =
      input.basePoints * testsRatio +
      (bonusEligible && testsRatio > 0 ? input.perfMax * timeRatio : 0) -
      hintPenalty -
      linePenalty;
    const score = Math.round(clamp(raw, 0, input.basePoints + input.perfMax) * 100) / 100;

    return {
      score,
      testsRatio,
      timeRatio,
      resolutionMs,
      bonusEligible,
      hintPenalty,
      linePenalty
    };
  }

  private validate(input: ResolutionScoringInput): void {
    if (input.basePoints < 0 || input.perfMax < 0) {
      throw new Error('basePoints et perfMax doivent être positifs ou nuls');
    }
    if (input.testsTotal <= 0) {
      throw new Error('testsTotal doit être strictement positif');
    }
    if (!(input.tOptMs > 0) || !(input.tMaxMs > input.tOptMs)) {
      throw new Error('Les bornes doivent vérifier 0 < t_opt_ms < t_max_ms');
    }
    if (Number.isNaN(input.startedAt.getTime())) {
      throw new Error('`startedAt` doit être une date valide');
    }
    if ((input.attempts ?? 1) !== 1) {
      throw new Error('Une seule tentative par défi est autorisée en v1');
    }
  }
}
