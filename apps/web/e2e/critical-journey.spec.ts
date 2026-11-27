import { expect, test } from '@playwright/test';
import { CHALLENGE_ID, installJourneyStub } from './helpers/journey';

/**
 * SC-011 / principe IV : le parcours complet d'un joueur, de la création du
 * compte jusqu'au classement, doit rester navigable de bout en bout.
 */
test('inscription → confirmation → leçon → défi → classement', async ({ page }) => {
  await installJourneyStub(page);

  await page.goto('/register');
  await page.getByLabel('Adresse e-mail').fill('ada@example.com');
  await page.getByLabel('Pseudo').fill('ada');
  await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('status')).toContainText('Compte créé');

  await page.goto('/verify-email?token=jeton-de-test');
  await expect(page.getByText('Votre adresse e-mail est confirmée')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('E-mail ou pseudo').fill('ada@example.com');
  await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.goto('/lessons');
  await expect(page.getByRole('heading', { level: 1, name: 'Cours' })).toBeVisible();
  await page.getByRole('link', { name: 'Ouvrir la leçon' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Variables et types' })).toBeVisible();

  await page.getByRole('button', { name: 'Commencer la leçon' }).click();
  await expect(page.getByRole('heading', { name: 'Mini-quiz' })).toBeVisible();
  await page.getByLabel('aucun de ces mots-clés').check();
  await page.getByRole('button', { name: 'Valider le quiz' }).click();
  await expect(page.getByRole('status')).toContainText('Quiz réussi');

  await page.getByRole('button', { name: 'Terminer la leçon' }).click();
  await expect(page.getByText('+100 XP')).toBeVisible();
  await page.getByRole('link', { name: /Appliquer : Trier une liste/ }).click();
  await expect(page).toHaveURL(new RegExp(`/challenges/${CHALLENGE_ID}$`));

  await page.getByRole('button', { name: 'Soumettre' }).click();
  const verdict = page.locator('section[aria-live="polite"]').filter({
    has: page.getByRole('heading', { name: 'Verdict' })
  });
  await expect(verdict).toContainText('Réussi');
  await expect(verdict).toContainText('10/10');

  await page.goto('/leaderboards');
  await expect(page.getByRole('heading', { level: 1, name: 'Classements' })).toBeVisible();
  await expect(page.getByText('Votre position')).toBeVisible();
  await expect(page.getByText('Rang 1')).toBeVisible();
});
