import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installApiStub } from './helpers/api';

/** T239 / SC-015 : zéro violation critique axe sur les parcours critiques. */
const PARCOURS = ['/', '/login', '/challenges', '/lore', '/events', '/bosses', '/chat'];

for (const path of PARCOURS) {
  test(`aucune violation critique axe sur ${path}`, async ({ page }) => {
    await installApiStub(page);
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const critical = results.violations.filter((violation) => violation.impact === 'critical');
    expect(critical).toEqual([]);
  });
}

test('le parcours critique est navigable au clavier seul', async ({ page, browserName }) => {
  // Le moteur WebKit headless ne déplace pas le focus avec `Tab` (limitation
  // du moteur, pas de l'application). Le parcours reste vérifié sur les autres
  // navigateurs et par axe sur WebKit.
  test.skip(browserName === 'webkit', 'navigation Tab non prise en charge par WebKit headless');
  await installApiStub(page);
  await page.goto('/');

  const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
  // Selon le moteur, le premier `Tab` peut encore laisser le focus sur `body`.
  for (
    let index = 0;
    index < 5 && !(await skipLink.evaluate((node) => node === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(skipLink).toBeFocused();

  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  const defis = navigation.getByRole('link', { name: 'Défis' });
  for (
    let index = 0;
    index < 15 && !(await defis.evaluate((node) => node === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(defis).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/challenges$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
