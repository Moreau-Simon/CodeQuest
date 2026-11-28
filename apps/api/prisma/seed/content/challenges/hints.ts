import type { HintSeed } from '../types';
import { CHALLENGE_DEFINITIONS } from './definitions';
import { hintsFor } from './templates';

/**
 * Les indices ne sont générés que pour les types qui les autorisent
 * (`hint.policy.ts` interdit explicitement `sorting`). Trois niveaux
 * progressifs par défi, tarifés selon la difficulté.
 */
export const HINTS: HintSeed[] = CHALLENGE_DEFINITIONS.filter(
  (challenge) => challenge.type !== 'sorting'
).flatMap((challenge) =>
  hintsFor(challenge.family).map((content, index) => ({
    challengeSlug: challenge.slug,
    order: index + 1,
    content,
    priceBits: 20 + challenge.difficulty * 10 + index * 15
  }))
);
