import { BOSS_CHALLENGES, CORE_CHALLENGES, EVENT_CHALLENGES } from './challenges/definitions';
import { LESSONS } from './courses/lessons';
import { THEMES } from './themes';
import type { PrerequisiteSeed } from './types';

const chapterByTheme = new Map(THEMES.map((theme) => [theme.slug, theme.loreChapterSlug]));
const lessonsByTheme = new Map<string, string[]>();
for (const lesson of LESSONS) {
  lessonsByTheme.set(lesson.themeSlug, [
    ...(lessonsByTheme.get(lesson.themeSlug) ?? []),
    lesson.slug
  ]);
}

/** Chaîne de prérequis sans cycle : chaque défi succède à un défi déjà seedé. */
function chain(
  challenges: readonly { slug: string; themeSlug: string }[],
  startLevel: number
): PrerequisiteSeed[] {
  const byTheme = new Map<string, string[]>();
  for (const challenge of challenges) {
    byTheme.set(challenge.themeSlug, [...(byTheme.get(challenge.themeSlug) ?? []), challenge.slug]);
  }
  return challenges.flatMap((challenge, index) => {
    const siblings = byTheme.get(challenge.themeSlug) ?? [];
    const position = siblings.indexOf(challenge.slug);
    const prerequisites: PrerequisiteSeed[] = [];
    if (position === 0) {
      prerequisites.push({ challengeSlug: challenge.slug, requiredLevel: startLevel });
      const chapter = chapterByTheme.get(challenge.themeSlug);
      if (chapter) prerequisites.push({ challengeSlug: challenge.slug, requiredLoreSlug: chapter });
    } else {
      prerequisites.push({
        challengeSlug: challenge.slug,
        requiredChallengeSlug: siblings[position - 1]!
      });
      const lesson = lessonsByTheme.get(challenge.themeSlug)?.[position - 1];
      if (lesson) prerequisites.push({ challengeSlug: challenge.slug, requiredLessonSlug: lesson });
    }
    void index;
    return prerequisites;
  });
}

/**
 * Prérequis du parcours permanent, des défis d'événement et des phases de boss.
 * Le graphe reste acyclique (vérifié par la suite unitaire du catalogue).
 */
export const PREREQUISITES: PrerequisiteSeed[] = [
  ...chain(CORE_CHALLENGES, 2),
  ...chain(EVENT_CHALLENGES, 4).map((prerequisite) => ({
    ...prerequisite,
    requiredLevel:
      prerequisite.requiredLevel === undefined ? undefined : Math.max(prerequisite.requiredLevel, 4)
  })),
  ...chain(BOSS_CHALLENGES, 6).map((prerequisite) => ({
    ...prerequisite,
    requiredLevel:
      prerequisite.requiredLevel === undefined ? undefined : Math.max(prerequisite.requiredLevel, 6)
  }))
];
