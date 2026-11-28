/**
 * Types du catalogue de contenu. Ces fichiers sont purement déclaratifs :
 * aucune dépendance à Prisma ni à l'environnement d'exécution, afin que les
 * invariants puissent être testés sans base de données (TDD, garde CI).
 */

export type FamilyKey =
  | 'tri_croissant'
  | 'tri_decroissant'
  | 'inversion'
  | 'somme'
  | 'maximum'
  | 'minimum'
  | 'compte_paires'
  | 'factorielle'
  | 'fibonacci'
  | 'palindrome'
  | 'valeurs_uniques'
  | 'somme_chiffres'
  | 'pgcd'
  | 'fizzbuzz'
  | 'recherche_binaire'
  | 'comptage_mots';

export type ChallengeTypeSeed =
  'sorting' | 'debugging' | 'decryption' | 'steganography' | 'qr_code';
export type ChallengeStatusSeed = 'published';
export type EventStatusSeed = 'draft' | 'scheduled' | 'finished' | 'archived';
export type EventTypeSeed = 'standard' | 'battle_royale';
export type RoundStatusSeed = 'scheduled' | 'open' | 'closed';
export type ShopItemKindSeed =
  'hint' | 'potion' | 'avatar' | 'title' | 'editor_theme' | 'early_access';
export type BadgeCriteriaKindSeed =
  'passed_submissions_at_least' | 'best_score_at_least' | 'boss_defeats_at_least';

export interface TestCaseSeed {
  input: unknown[];
  expected: unknown;
  hidden: boolean;
  name: string;
}

export interface QuizQuestionSeed {
  id: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
}

export interface QuizSeed {
  passScore: number;
  questions: QuizQuestionSeed[];
}

export interface LoreChapterSeed {
  slug: string;
  title: string;
  contentMd: string;
  requiredLevel: number;
  order: number;
  audioKey: string;
}

export interface ThemeSeed {
  slug: string;
  name: string;
  loreChapterSlug?: string;
  sortOrder: number;
}

export interface LessonSeed {
  slug: string;
  themeSlug: string;
  title: string;
  contentMd: string;
  order: number;
  estimatedMinutes: number;
  status: ChallengeStatusSeed;
  quiz: QuizSeed;
}

export interface ChallengeDefinition {
  slug: string;
  title: string;
  themeSlug: string;
  type: ChallengeTypeSeed;
  difficulty: number;
  family: FamilyKey;
  /** Phrase ajoutée à l'énoncé généré par la famille de cas. */
  context: string;
  languages: readonly ('python' | 'javascript')[];
  caseCount: number;
  hiddenCount: number;
  basePoints: number;
  perfMax: number;
  tOptMs: number;
  tMaxMs: number;
  isEventOnly: boolean;
  isBossPhase: boolean;
  buggyCode?: string;
  maxModifiedLines?: number;
  cipher?: string;
  keySeedRef?: string;
}

export interface ChallengeSeed extends ChallengeDefinition {
  status: ChallengeStatusSeed;
  statementMd: string;
  solution: string;
  cases: TestCaseSeed[];
}

export interface HintSeed {
  challengeSlug: string;
  order: number;
  content: string;
  priceBits: number;
}

export interface SeasonSeed {
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface BattleRoundSeed {
  roundNumber: number;
  challengeSlug: string;
  startsAt: string;
  endsAt: string;
  status: RoundStatusSeed;
}

export interface EventSeed {
  slug: string;
  title: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: EventStatusSeed;
  type: EventTypeSeed;
  maxAttempts: 1;
  minParticipants: number;
  eliminationRule: { threshold: number; percent: number };
  rewards: { bits: number; places: number };
  challengeSlugs: string[];
  rounds: BattleRoundSeed[];
}

export interface BossPhaseSeed {
  order: number;
  challengeSlug: string;
  hpShare: number;
  damageRule: { per_100_score: number; failureCost: number };
}

export interface BossSeed {
  slug: string;
  name: string;
  loreChapterSlug: string;
  maxHp: number;
  rewards: { bits: number };
  phases: BossPhaseSeed[];
}

export interface ShopItemSeed {
  sku: string;
  name: string;
  kind: ShopItemKindSeed;
  priceBits: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  availableFrom?: string;
  availableUntil?: string;
  /** Résolu en `metadata.hintId` par le loader, après le seed des indices. */
  hintRef?: { challengeSlug: string; order: number };
}

export interface BadgeSeed {
  key: string;
  name: string;
  description: string;
  criteria: { kind: BadgeCriteriaKindSeed; value: number; bits: number };
}

export interface PrerequisiteSeed {
  challengeSlug: string;
  requiredChallengeSlug?: string;
  requiredLevel?: number;
  requiredLessonSlug?: string;
  requiredLoreSlug?: string;
}

export interface Catalogue {
  themes: ThemeSeed[];
  loreChapters: LoreChapterSeed[];
  lessons: LessonSeed[];
  challenges: ChallengeSeed[];
  hints: HintSeed[];
  seasons: SeasonSeed[];
  events: EventSeed[];
  bosses: BossSeed[];
  shopItems: ShopItemSeed[];
  badges: BadgeSeed[];
  prerequisites: PrerequisiteSeed[];
}
