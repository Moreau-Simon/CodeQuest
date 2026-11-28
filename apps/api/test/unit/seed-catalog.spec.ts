import { CATALOG } from '../../prisma/seed/content';
import { casesFor } from '../../prisma/seed/content/challenges/cases';

/**
 * Garde du catalogue de contenu : ces tests n'ont besoin d'aucune base de
 * données. Ils empêchent qu'une mise à jour des fichiers de données casse
 * une contrainte SQL, une règle métier ou une référence entre entités.
 */
const {
  themes,
  loreChapters,
  lessons,
  challenges,
  hints,
  seasons,
  events,
  bosses,
  shopItems,
  badges,
  prerequisites
} = CATALOG;

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

function expectOrders(values: readonly number[]): void {
  const sorted = [...values].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    expect(sorted[index] ?? 0).toBe((sorted[index - 1] ?? 0) + 1);
  }
}

describe('catalogue de contenu CodeQuest', () => {
  it('fournit un volume de contenu exploitable pour la plateforme', () => {
    expect(themes.length).toBeGreaterThanOrEqual(10);
    expect(loreChapters.length).toBeGreaterThanOrEqual(12);
    expect(lessons.length).toBeGreaterThanOrEqual(30);
    expect(challenges.length).toBeGreaterThanOrEqual(50);
    expect(
      challenges.reduce((total, challenge) => total + challenge.caseCount, 0)
    ).toBeGreaterThanOrEqual(800);
    expect(hints.length).toBeGreaterThanOrEqual(100);
    expect(seasons.length).toBeGreaterThanOrEqual(4);
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(bosses.length).toBeGreaterThanOrEqual(4);
    expect(bosses.reduce((total, boss) => total + boss.phases.length, 0)).toBeGreaterThanOrEqual(
      12
    );
    expect(shopItems.length).toBeGreaterThanOrEqual(30);
    expect(badges.length).toBeGreaterThanOrEqual(20);
    expect(prerequisites.length).toBeGreaterThanOrEqual(50);
  });

  it('garantit l’unicité des clés naturelles utilisées par les seeds', () => {
    expectUnique(themes.map((theme) => theme.slug));
    expectUnique(loreChapters.map((chapter) => chapter.slug));
    expectUnique(lessons.map((lesson) => lesson.slug));
    expectUnique(challenges.map((challenge) => challenge.slug));
    expectUnique(seasons.map((season) => season.slug));
    expectUnique(events.map((event) => event.slug));
    expectUnique(bosses.map((boss) => boss.slug));
    expectUnique(shopItems.map((item) => item.sku));
    expectUnique(badges.map((badge) => badge.key));
    expectUnique(challenges.map((challenge) => `${challenge.themeSlug}/${challenge.title}`));
  });

  it('respecte les contraintes SQL des défis et de leurs versions', () => {
    for (const challenge of challenges) {
      expect(challenge.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(challenge.title.length).toBeGreaterThanOrEqual(3);
      expect(challenge.title.length).toBeLessThanOrEqual(120);
      expect(challenge.difficulty).toBeGreaterThanOrEqual(1);
      expect(challenge.difficulty).toBeLessThanOrEqual(5);
      expect(challenge.languages.length).toBeGreaterThan(0);
      expect(
        challenge.languages.every((language) => language === 'python' || language === 'javascript')
      ).toBe(true);
      expect(challenge.basePoints).toBeGreaterThanOrEqual(0);
      expect(challenge.perfMax).toBeGreaterThanOrEqual(0);
      expect(challenge.tOptMs).toBeGreaterThan(0);
      expect(challenge.tOptMs).toBeLessThan(challenge.tMaxMs);
      expect(challenge.statementMd).toContain('## Objectif');
      expect(challenge.statementMd).toContain('## Exemple');
      expect(challenge.solution).toContain('def solve(');
      expect(challenge.status).toBe('published');
    }
  });

  it('génère des cas déterministes, nommés et partiellement cachés', () => {
    for (const challenge of challenges) {
      expect(challenge.cases).toEqual(
        casesFor(challenge.family, challenge.caseCount, challenge.hiddenCount)
      );
      expect(challenge.cases).toHaveLength(challenge.caseCount);
      expect(challenge.cases.filter((testCase) => testCase.hidden)).toHaveLength(
        challenge.hiddenCount
      );
      expect(challenge.cases.some((testCase) => !testCase.hidden)).toBe(true);
      expectUnique(challenge.cases.map((testCase) => testCase.name));
    }
  });

  it('calcule les résultats attendus des familles de cas', () => {
    const checks: Record<string, (input: readonly unknown[]) => unknown> = {
      somme: ([values]) => (values as number[]).reduce((total, value) => total + value, 0),
      maximum: ([values]) => Math.max(...(values as number[])),
      palindrome: ([value]) => {
        const text = value as string;
        return text === [...text].reverse().join('');
      },
      factorielle: ([value]) => {
        let result = 1;
        for (let index = 2; index <= (value as number); index += 1) result *= index;
        return result;
      },
      pgcd: ([first, second]) => {
        let a = first as number;
        let b = second as number;
        while (b !== 0) [a, b] = [b, a % b];
        return a;
      },
      fizzbuzz: ([value]) => {
        const number = value as number;
        return number % 15 === 0
          ? 'FizzBuzz'
          : number % 3 === 0
            ? 'Fizz'
            : number % 5 === 0
              ? 'Buzz'
              : String(number);
      },
      recherche_binaire: ([values, target]) => (values as number[]).indexOf(target as number),
      comptage_mots: ([value]) => (value as string).trim().split(/\s+/).filter(Boolean).length
    };

    for (const [family, compute] of Object.entries(checks)) {
      const challenge = challenges.find((item) => item.family === family);
      expect(challenge).toBeDefined();
      const visible = challenge?.cases.find((testCase) => !testCase.hidden);
      expect(visible).toBeDefined();
      expect(visible?.expected).toEqual(compute(visible?.input ?? []));
    }
  });

  it('ne propose des indices que sur les défis qui les autorisent', () => {
    const bySlug = new Map(challenges.map((challenge) => [challenge.slug, challenge]));
    const grouped = new Map<string, typeof hints>();
    for (const hint of hints) {
      const challenge = bySlug.get(hint.challengeSlug);
      expect(challenge).toBeDefined();
      expect(challenge?.type).not.toBe('sorting');
      expect(hint.content.length).toBeGreaterThan(20);
      expect(hint.priceBits).toBeGreaterThanOrEqual(0);
      grouped.set(hint.challengeSlug, [...(grouped.get(hint.challengeSlug) ?? []), hint]);
    }
    for (const group of grouped.values()) {
      expect(group.length).toBeGreaterThanOrEqual(2);
      expect(group.length).toBeLessThanOrEqual(3);
      expectOrders(group.map((hint) => hint.order));
    }
  });

  it('lit des cours structurés avec des quiz valides', () => {
    const themeSlugs = new Set(themes.map((theme) => theme.slug));
    const orders = new Map<string, number[]>();
    for (const lesson of lessons) {
      expect(themeSlugs.has(lesson.themeSlug)).toBe(true);
      expect(lesson.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(lesson.contentMd.length).toBeGreaterThan(200);
      expect(lesson.estimatedMinutes).toBeGreaterThan(0);
      expect(lesson.status).toBe('published');
      expect(lesson.quiz.passScore).toBeGreaterThanOrEqual(0);
      expect(lesson.quiz.passScore).toBeLessThanOrEqual(100);
      expect(lesson.quiz.questions.length).toBeGreaterThanOrEqual(2);
      expect(lesson.quiz.questions.length).toBeLessThanOrEqual(5);
      expectUnique(lesson.quiz.questions.map((question) => question.id));
      for (const question of lesson.quiz.questions) {
        expect(question.prompt.length).toBeGreaterThan(10);
        expect(question.choices.length).toBeGreaterThanOrEqual(2);
        expect(question.answerIndex).toBeGreaterThanOrEqual(0);
        expect(question.answerIndex).toBeLessThan(question.choices.length);
      }
      orders.set(lesson.themeSlug, [...(orders.get(lesson.themeSlug) ?? []), lesson.order]);
    }
    for (const values of orders.values()) expectOrders(values);
  });

  it('construit un lore structuré par niveaux et sans ordres dupliqués', () => {
    expectOrders(loreChapters.map((chapter) => chapter.order));
    for (const chapter of loreChapters) {
      expect(chapter.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(chapter.title.length).toBeGreaterThan(3);
      expect(chapter.contentMd.length).toBeGreaterThan(300);
      expect(chapter.requiredLevel).toBeGreaterThanOrEqual(1);
      expect(chapter.requiredLevel).toBeLessThanOrEqual(100);
      expect(chapter.audioKey).toMatch(/^lore\.[a-z0-9-]+$/);
    }
  });

  it('planifie des saisons et des événements cohérents', () => {
    const challengeSlugs = new Set(challenges.map((challenge) => challenge.slug));
    const timezones: readonly string[] = Intl.supportedValuesOf('timeZone');
    const sortedSeasons = [...seasons].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let index = 1; index < sortedSeasons.length; index += 1) {
      expect(
        sortedSeasons[index]?.startsAt.localeCompare(sortedSeasons[index - 1]!.endsAt)
      ).toBeGreaterThan(0);
    }
    expectUnique(seasons.map((season) => season.slug));
    for (const season of seasons) expect(season.startsAt < season.endsAt).toBe(true);

    for (const event of events) {
      expect(timezones).toContain(event.timezone);
      expect(event.startsAt < event.endsAt).toBe(true);
      expect(event.maxAttempts).toBe(1);
      expect(event.minParticipants).toBeGreaterThanOrEqual(2);
      expect(event.eliminationRule.threshold).toBeGreaterThan(0);
      expect(event.eliminationRule.percent).toBeGreaterThan(0);
      expect(event.challengeSlugs.length).toBeGreaterThanOrEqual(3);
      expectUnique(event.challengeSlugs);
      for (const slug of event.challengeSlugs) expect(challengeSlugs.has(slug)).toBe(true);
      expectOrders(event.rounds.map((round) => round.roundNumber));
      for (const round of event.rounds) {
        expect(event.type).toBe('battle_royale');
        expect(round.startsAt >= event.startsAt).toBe(true);
        expect(round.endsAt <= event.endsAt).toBe(true);
        expect(round.startsAt < round.endsAt).toBe(true);
        expect(challengeSlugs.has(round.challengeSlug)).toBe(true);
      }
      if (event.type === 'standard') expect(event.rounds).toHaveLength(0);
    }
  });

  it('équilibre les phases de boss et leurs références', () => {
    const challengeBySlug = new Map(challenges.map((challenge) => [challenge.slug, challenge]));
    const chapterSlugs = new Set(loreChapters.map((chapter) => chapter.slug));
    for (const boss of bosses) {
      expect(chapterSlugs.has(boss.loreChapterSlug)).toBe(true);
      expect(boss.maxHp).toBeGreaterThan(0);
      expect(boss.phases.length).toBeGreaterThanOrEqual(2);
      expectOrders(boss.phases.map((phase) => phase.order));
      expect(boss.phases.reduce((total, phase) => total + phase.hpShare, 0)).toBe(100);
      for (const phase of boss.phases) {
        expect(phase.hpShare).toBeGreaterThan(0);
        expect(phase.hpShare).toBeLessThanOrEqual(100);
        expect(phase.damageRule.per_100_score).toBeGreaterThan(0);
        expect(phase.damageRule.failureCost).toBeGreaterThanOrEqual(0);
        expect(challengeBySlug.get(phase.challengeSlug)?.isBossPhase).toBe(true);
      }
    }
  });

  it('remplit une boutique dont les indices sont résolvables', () => {
    const allowedKinds = new Set([
      'hint',
      'potion',
      'avatar',
      'title',
      'editor_theme',
      'early_access'
    ]);
    const hintsByChallenge = new Map<string, number[]>();
    for (const hint of hints) {
      hintsByChallenge.set(hint.challengeSlug, [
        ...(hintsByChallenge.get(hint.challengeSlug) ?? []),
        hint.order
      ]);
    }
    for (const item of shopItems) {
      expect(allowedKinds.has(item.kind)).toBe(true);
      expect(item.priceBits).toBeGreaterThanOrEqual(0);
      expect(item.name.length).toBeGreaterThan(2);
      if (item.kind === 'hint') {
        expect(item.hintRef).toBeDefined();
        expect(hintsByChallenge.get(item.hintRef?.challengeSlug ?? '')).toContain(
          item.hintRef?.order
        );
      } else {
        expect(item.hintRef).toBeUndefined();
      }
    }
  });

  it('décrit des badges dont les critères sont évaluables', () => {
    const allowedCriteria = new Set([
      'passed_submissions_at_least',
      'best_score_at_least',
      'boss_defeats_at_least'
    ]);
    for (const badge of badges) {
      expect(allowedCriteria.has(badge.criteria.kind)).toBe(true);
      expect(badge.criteria.value).toBeGreaterThan(0);
      expect(badge.criteria.bits).toBeGreaterThanOrEqual(0);
      expect(badge.description.length).toBeGreaterThan(10);
    }
  });

  it('construit un graphe de prérequis acyclique et référencé', () => {
    const challengeSlugs = new Set(challenges.map((challenge) => challenge.slug));
    const lessonSlugs = new Set(lessons.map((lesson) => lesson.slug));
    const chapterSlugs = new Set(loreChapters.map((chapter) => chapter.slug));
    const edges = new Map<string, string[]>();

    for (const prerequisite of prerequisites) {
      expect(challengeSlugs.has(prerequisite.challengeSlug)).toBe(true);
      const conditions = [
        prerequisite.requiredChallengeSlug,
        prerequisite.requiredLevel,
        prerequisite.requiredLessonSlug,
        prerequisite.requiredLoreSlug
      ].filter((value) => value !== undefined);
      expect(conditions).toHaveLength(1);
      if (prerequisite.requiredChallengeSlug !== undefined) {
        expect(challengeSlugs.has(prerequisite.requiredChallengeSlug)).toBe(true);
        expect(prerequisite.requiredChallengeSlug).not.toBe(prerequisite.challengeSlug);
        edges.set(prerequisite.challengeSlug, [
          ...(edges.get(prerequisite.challengeSlug) ?? []),
          prerequisite.requiredChallengeSlug
        ]);
      }
      if (prerequisite.requiredLevel !== undefined) {
        expect(prerequisite.requiredLevel).toBeGreaterThanOrEqual(1);
        expect(prerequisite.requiredLevel).toBeLessThanOrEqual(100);
      }
      if (prerequisite.requiredLessonSlug !== undefined)
        expect(lessonSlugs.has(prerequisite.requiredLessonSlug)).toBe(true);
      if (prerequisite.requiredLoreSlug !== undefined)
        expect(chapterSlugs.has(prerequisite.requiredLoreSlug)).toBe(true);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (slug: string): void => {
      expect(visiting.has(slug)).toBe(false);
      if (visited.has(slug)) return;
      visiting.add(slug);
      for (const dependency of edges.get(slug) ?? []) visit(dependency);
      visiting.delete(slug);
      visited.add(slug);
    };
    for (const slug of challengeSlugs) visit(slug);
  });

  it('rattache chaque entité à un parent existant', () => {
    const themeSlugs = new Set(themes.map((theme) => theme.slug));
    const chapterSlugs = new Set(loreChapters.map((chapter) => chapter.slug));
    for (const theme of themes) {
      if (theme.loreChapterSlug) expect(chapterSlugs.has(theme.loreChapterSlug)).toBe(true);
    }
    for (const challenge of challenges) expect(themeSlugs.has(challenge.themeSlug)).toBe(true);
    const challengeSlugs = new Set(challenges.map((challenge) => challenge.slug));
    for (const event of events) {
      for (const slug of event.challengeSlugs) expect(challengeSlugs.has(slug)).toBe(true);
    }
  });
});
