import { expect, test } from '@playwright/test';
import { installJourneyStub } from './helpers/journey';

/**
 * SC-017 / T275 : le cycle de vie du compte inclut la réinitialisation, la
 * suppression réauthentifiée et la anonymisation visible des scores.
 */
test('réinitialisation puis suppression réauthentifiée du compte', async ({ page }) => {
  await installJourneyStub(page);

  await page.goto('/forgot-password');
  await page.getByLabel('E-mail ou pseudo').fill('ada@example.com');
  await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('status')).toContainText('vient d’être envoyé');

  await page.goto('/reset-password?token=jeton-de-reinitialisation');
  await page.getByLabel('Nouveau mot de passe').fill('nouveau-mot-de-passe-valide');
  await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
  await expect(page.getByText('Toutes vos sessions ont été fermées')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('E-mail ou pseudo').fill('ada@example.com');
  await page.getByLabel('Mot de passe').fill('nouveau-mot-de-passe-valide');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/profile$/);

  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('purgé sous 30 jours');
  await dialog.getByLabel('Mot de passe actuel').fill('nouveau-mot-de-passe-valide');
  await dialog.getByRole('button', { name: 'Supprimer mon compte' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toContainText(
    'Connexion'
  );

  await page.goto('/leaderboards');
  await expect(page.getByText('Joueur anonyme').first()).toBeVisible();
});
