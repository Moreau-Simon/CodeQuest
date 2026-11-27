import type { Page } from '@playwright/test';

export const PROFILE = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 1,
  xp: 0,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: { sound: { master: true, music: true, effects: true, voice: true } },
  badges: []
};

export const LESSON_ID = '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b10';

export const LESSON = {
  id: LESSON_ID,
  theme: 'Bases',
  title: 'Variables et types',
  order: 1,
  estimatedMinutes: 5,
  status: 'completed',
  positioningTestAvailable: false,
  applicationChallenge: null,
  progress: { status: 'completed', quizScore: 100, completedAt: '2031-06-03T10:00:00.000Z' },
  contentMd: '# Variables\n\nUne leçon déjà consultée, disponible hors ligne.',
  quiz: null
};

/** Stub réseau commun aux scénarios UI : aucun backend n'est nécessaire. */
export async function installApiStub(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROFILE)
      });
    }
    if (path === `/api/v1/lessons/${LESSON_ID}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(LESSON)
      });
    }
    if (path === '/api/v1/challenges') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] })
      });
    }
    if (/\/(lessons|lore|events|bosses|leaderboards|channels)(\/|$)/.test(path)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
}
