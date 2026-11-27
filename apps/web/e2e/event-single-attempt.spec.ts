import { expect, test } from '@playwright/test';
import { EVENT_ID, installJourneyStub } from './helpers/journey';

/**
 * FR-062 / SC-011 : un event n'est consommé que par un démarrage explicite,
 * l'essai reste consommé après abandon de la page et un second départ est
 * refusé par l'API.
 */
test('essai unique : confirmation explicite, refus du second essai, abandon consommé', async ({
  page
}) => {
  await installJourneyStub(page);

  await page.goto(`/events/${EVENT_ID}`);
  await expect(page.getByRole('heading', { level: 1, name: 'La grande chasse' })).toBeVisible();
  await expect(page.getByText('Un seul essai : confirmez pour le démarrer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Démarrer l’essai' })).toBeDisabled();

  await page.getByRole('checkbox', { name: 'Je confirme vouloir consommer mon unique essai' }).check();
  await page.getByRole('button', { name: 'Démarrer l’essai' }).click();
  await expect(page.getByRole('status')).toContainText('Essai consommé');

  const secondAttempt = await page.evaluate(async (eventId) => {
    const response = await fetch(`/api/v1/events/${eventId}/start`, {
      method: 'POST',
      credentials: 'include'
    });
    return { status: response.status, body: await response.json() };
  }, EVENT_ID);
  expect(secondAttempt.status).toBe(409);
  expect(secondAttempt.body.code).toBe('ATTEMPT_ALREADY_CONSUMED');

  await page.goto('/events');
  await page.getByRole('link', { name: 'Voir le détail' }).click();
  await expect(page.getByRole('status')).toContainText('Essai consommé');
  await expect(page.getByRole('button', { name: 'Démarrer l’essai' })).toHaveCount(0);
});
