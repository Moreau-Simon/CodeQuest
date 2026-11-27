/**
 * T216/T221 [US14] — règle d'élimination pure (FR-098, clarification 4).
 *
 * Une élimination par manche jusqu'à `threshold` participants restants, puis
 * `percent` % arrondis au supérieur. À score égal, la soumission la plus
 * tardive est éliminée en premier.
 */

export type BattleSubjectType = 'player' | 'team';

export interface EliminationRule {
  threshold: number;
  percent: number;
}

export interface EliminationCandidate {
  subjectType: BattleSubjectType;
  subjectId: string;
  score: number;
  submittedAt: string | Date;
}

export const DEFAULT_ELIMINATION_RULE: Readonly<EliminationRule> = Object.freeze({
  threshold: 50,
  percent: 10
});

/** Valide et normalise `events.elimination_rule` (jsonb) sans jamais le deviner. */
export function normalizeRule(value: unknown = DEFAULT_ELIMINATION_RULE): EliminationRule {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const threshold = source.threshold ?? DEFAULT_ELIMINATION_RULE.threshold;
  const percent = source.percent ?? DEFAULT_ELIMINATION_RULE.percent;
  if (
    !Number.isInteger(threshold) ||
    (threshold as number) < 1 ||
    !Number.isFinite(percent) ||
    (percent as number) <= 0 ||
    (percent as number) > 100
  ) {
    throw new Error('Règle d’élimination invalide');
  }
  return { threshold: threshold as number, percent: percent as number };
}

/** Nombre d'éliminés pour une manche, borné à `remaining - 1`. */
export function eliminationCount(
  remaining: number,
  rule: unknown = DEFAULT_ELIMINATION_RULE
): number {
  if (!Number.isInteger(remaining) || remaining < 0) return 0;
  if (remaining <= 1) return 0;
  const normalized = normalizeRule(rule);
  const raw =
    remaining <= normalized.threshold
      ? 1
      : Math.ceil((remaining * normalized.percent) / 100);
  return Math.min(Math.max(raw, 1), remaining - 1);
}

/** Sélectionne les éliminés : score croissant, puis soumission décroissante. */
export function selectEliminated<T extends EliminationCandidate>(
  candidates: readonly T[],
  rule: unknown = DEFAULT_ELIMINATION_RULE
): T[] {
  const count = eliminationCount(candidates.length, rule);
  if (count === 0) return [];
  return [...candidates]
    .sort((left, right) => {
      const byScore = left.score - right.score;
      if (byScore !== 0) return byScore;
      const byTime =
        new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
      return byTime !== 0 ? byTime : left.subjectId.localeCompare(right.subjectId);
    })
    .slice(0, count);
}

/** Clé d'identité d'un sujet dans une manche. */
export function subjectKey(subject: Pick<EliminationCandidate, 'subjectType' | 'subjectId'>): string {
  return `${subject.subjectType}:${subject.subjectId}`;
}
