import { Injectable } from '@nestjs/common';

export interface ScoringInput {
  basePoints: number;
  perfMax: number;
  testsPassed: number;
  testsTotal: number;
  cpuTimeMedianMs: number;
  tOptMs: number;
  tMaxMs: number;
}

export interface ScoringResult {
  score: number;
  testsRatio: number;
  perfRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Source unique du calcul de score (T075, FR-030, FR-032).
 *
 * `score = base_points × (tests_passed / tests_total)
 *        + perf_max × clamp((t_max − t_median) / (t_max − t_opt), 0, 1)`
 *
 * Le runner ne transmet que des mesures brutes ; cette classe est la seule à
 * connaître les bornes de calibrage. Le résultat est arrondi au centième et
 * toujours compris dans `[0, base_points + perf_max]`.
 *
 * Aucun test réussi ⇒ aucun score, même si l'exécution est très rapide : le
 * bonus de performance ne récompense jamais un code incorrect (quickstart S2,
 * golden T069).
 */
@Injectable()
export class ScoringService {
  compute(input: ScoringInput): ScoringResult {
    const { basePoints, perfMax, testsPassed, testsTotal, cpuTimeMedianMs, tOptMs, tMaxMs } = input;

    if (basePoints < 0 || perfMax < 0) {
      throw new Error('basePoints et perfMax doivent être positifs ou nuls');
    }
    if (testsTotal <= 0) {
      throw new Error('testsTotal doit être strictement positif');
    }
    if (!(tOptMs > 0) || !(tMaxMs > tOptMs)) {
      throw new Error('Les bornes de temps doivent vérifier 0 < t_opt_ms < t_max_ms');
    }

    const testsRatio = clamp(testsPassed / testsTotal, 0, 1);
    if (testsRatio === 0) {
      return { score: 0, testsRatio: 0, perfRatio: 0 };
    }
    const perfRatio = clamp((tMaxMs - cpuTimeMedianMs) / (tMaxMs - tOptMs), 0, 1);

    const raw = basePoints * testsRatio + perfMax * perfRatio;
    const bounded = clamp(raw, 0, basePoints + perfMax);

    return {
      score: Math.round(bounded * 100) / 100,
      testsRatio,
      perfRatio
    };
  }

  /** Raccourci utilisé par les golden tests et le consommateur de verdicts. */
  score(input: ScoringInput): number {
    return this.compute(input).score;
  }
}
