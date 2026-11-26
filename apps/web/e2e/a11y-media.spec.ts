import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * T198 [P] [US12] : audio après interaction explicite (FR-080) et animations
 * réduites sans perte d'information (FR-082). L'API est simulée au niveau réseau
 * comme dans `auth.spec.ts` : les contrats réels sont couverts côté API.
 */
const profile = {
  id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b01',
  pseudonym: 'ada',
  email: 'ada@example.com',
  emailVerified: true,
  level: 3,
  xp: 250,
  avatarUrl: null,
  preferredLanguage: 'python',
  preferences: {
    sound: { master: true, music: true, effects: true, voice: true },
    reducedMotion: true
  },
  badges: []
};

const chapters = [
  {
    id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b02',
    slug: 'foret',
    title: 'La forêt',
    requiredLevel: 1,
    order: 1,
    audioKey: 'regions/forest',
    unlocked: true,
    read: false,
    readAt: null,
    content: '# La forêt\n\nLe réveil du réseau.'
  },
  {
    id: '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b03',
    slug: 'profondeurs',
    title: 'Les profondeurs',
    requiredLevel: 9,
    order: 2,
    audioKey: null,
    unlocked: false,
    read: false,
    readAt: null
  }
];

type SpyWindow = Window & { __cqAudioStarts?: number };

test('aucun son avant interaction, animations désactivées sans perte d’information', async ({
  page
}) => {
  await page.addInitScript(() => {
    const w = window as SpyWindow;
    w.__cqAudioStarts = 0;
    window.AudioContext = class CountingAudioContext extends AudioContext {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__cqAudioStarts = (w.__cqAudioStarts ?? 0) + 1;
      }
    };
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args: Parameters<HTMLMediaElement['play']>) {
      w.__cqAudioStarts = (w.__cqAudioStarts ?? 0) + 1;
      return nativePlay.apply(this, args);
    };
  });

  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
  );
  await page.route('**/api/v1/lore/chapters', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(chapters)
    })
  );
  await page.route('**/api/v1/lore/chapters/*/read', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...chapters[0], read: true, readAt: '2026-11-26T12:00:00.000Z' })
    })
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lore');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Chroniques de CodeQuest' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'La forêt' })).toBeVisible();

  const audioStarts = (): Promise<number | undefined> =>
    page.evaluate(() => (window as SpyWindow).__cqAudioStarts);
  await expect.poll(audioStarts).toBe(0);

  const status = page.getByRole('status', { name: 'Ambiance sonore' });
  await expect(status).toContainText('Ambiance désactivée');
  await expect(page.getByRole('button', { name: 'Activer l’ambiance' })).toBeVisible();

  const duration = await page
    .locator('[data-cq-animated]')
    .first()
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await expect(page.getByText('Le réveil du réseau.')).toBeVisible();

  await page.getByRole('button', { name: 'Activer l’ambiance' }).click();
  await expect(status).toContainText('Ambiance activée');
  await expect.poll(audioStarts).toBe(1);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});
