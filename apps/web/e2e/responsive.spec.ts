import { expect, test } from '@playwright/test';
import { installApiStub } from './helpers/api';

/**
 * T238 / SC-016 (FR-102) : les parcours critiques restent lisibles sur les
 * trois formats, sur chaque navigateur déclaré dans `playwright.config.ts`.
 */
const PARCOURS = ['/', '/challenges', '/lore', '/events', '/bosses'];

for (const path of PARCOURS) {
  test(`${path} ne déborde pas horizontalement`, async ({ page }) => {
    await installApiStub(page);
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(debordement).toBeLessThanOrEqual(1);
  });
}

test('la navigation mobile expose des cibles tactiles d’au moins 44 px', async ({
  page
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Barre inférieure réservée au mobile');

  await installApiStub(page);
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(navigation).toBeVisible();

  const liens = navigation.getByRole('link');
  expect(await liens.count()).toBeGreaterThan(0);
  for (const lien of await liens.all()) {
    const box = await lien.boundingBox();
    expect(box?.height, `hauteur de « ${await lien.textContent()} »`).toBeGreaterThanOrEqual(44);
  }
});

test('le bouton d’envoi du chat reste atteignable sur mobile', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Vérification tactile mobile');

  await installApiStub(page);
  await page.goto('/chat');
  const envoi = page.getByRole('button', { name: 'Envoyer' });
  await expect(envoi).toBeVisible();
  const box = await envoi.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});
