import type { Event } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ELIMINATION_RULE,
  normalizeRule,
  selectEliminated,
  type EliminationCandidate,
  type EliminationRule
} from './elimination.rule';

/** T221 [US14] — lit `events.elimination_rule` sans jamais le deviner. */
@Injectable()
export class EliminationService {
  ruleFor(event: Pick<Event, 'eliminationRule'>): EliminationRule {
    return normalizeRule(event.eliminationRule ?? DEFAULT_ELIMINATION_RULE);
  }

  select<T extends EliminationCandidate>(
    candidates: readonly T[],
    event: Pick<Event, 'eliminationRule'>
  ): T[] {
    return selectEliminated(candidates, event.eliminationRule ?? DEFAULT_ELIMINATION_RULE);
  }
}
