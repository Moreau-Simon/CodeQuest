import { expect, test } from '@playwright/test';

test("la page d'accueil se charge et expose un titre", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('CodeQuest');
});

test('la navigation principale est accessible au clavier', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Défis' })).toBeVisible();
});
