import { casesFor, solutionFor } from './challenges/cases';
import { CHALLENGE_DEFINITIONS } from './challenges/definitions';
import { HINTS } from './challenges/hints';
import { statementFor } from './challenges/templates';
import { LESSONS } from './courses/lessons';
import { BOSSES } from './bosses';
import { BADGES, SHOP_ITEMS } from './economy';
import { EVENTS, SEASONS } from './events';
import { LORE_CHAPTERS } from './lore';
import { PREREQUISITES } from './prerequisites';
import { THEMES } from './themes';
import type { Catalogue, ChallengeSeed } from './types';

/** Énoncés, solutions et cas de test dérivés des définitions, sans copie manuelle. */
export const CHALLENGES: ChallengeSeed[] = CHALLENGE_DEFINITIONS.map((definition) => ({
  ...definition,
  status: 'published',
  statementMd: statementFor(definition.family, definition.context),
  solution: solutionFor(definition.family),
  cases: casesFor(definition.family, definition.caseCount, definition.hiddenCount)
}));

/** Point d'entrée unique du catalogue, consommé par les loaders et les tests. */
export const CATALOG: Catalogue = {
  themes: THEMES,
  loreChapters: LORE_CHAPTERS,
  lessons: LESSONS,
  challenges: CHALLENGES,
  hints: HINTS,
  seasons: SEASONS,
  events: EVENTS,
  bosses: BOSSES,
  shopItems: SHOP_ITEMS,
  badges: BADGES,
  prerequisites: PREREQUISITES
};
