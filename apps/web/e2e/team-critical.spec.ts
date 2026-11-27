import { expect, test } from '@playwright/test';
import { CHALLENGE_ID, installJourneyStub, TEAM_ID } from './helpers/journey';

/**
 * SC-011 / T277 : création d'équipe, invitation par lien, édition collaborative,
 * désignation officielle et classement d'équipe forment un même parcours.
 */
test('création, invitation, collaboration, soumission officielle et classement', async ({
  page
}) => {
  await installJourneyStub(page);

  await page.goto('/teams');
  await page.getByLabel('Nom de l’équipe').fill('Byte Me');
  await page.getByLabel('Tag (2 à 6 caractères)').fill('BYTE');
  await page.getByRole('button', { name: 'Créer l’équipe' }).click();
  await expect(page.getByRole('heading', { name: /Byte Me/ }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Paramètres de l’équipe' }).first().click();
  await page.getByRole('button', { name: 'Générer une invitation' }).click();
  const inviteUrl = (await page.locator('dd.font-mono').nth(1).textContent())?.trim();
  expect(inviteUrl).toContain(`/teams/join?teamId=${TEAM_ID}`);

  await page.goto(inviteUrl!);
  await expect(page.getByText('Vous avez rejoint l’équipe')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Byte Me/ })).toBeVisible();

  // Le transport collaboratif est simulé : le vrai Y.Doc et le vrai binding
  // Monaco restent exercés (la convergence complète est dans team-collab.spec.ts).
  await page.addInitScript(() => {
    (window as unknown as {
      __codequestSocketFactory: () => {
        on(): void;
        emit(): void;
        disconnect(): void;
      };
    }).__codequestSocketFactory = () => ({ on() {}, emit() {}, disconnect() {} });
  });
  await page.goto(`/challenges/${CHALLENGE_ID}?teamId=${TEAM_ID}`);
  await expect(page.getByTestId('collab-status')).toContainText('Édition collaborative active');

  await page.goto(`/teams/${TEAM_ID}`);
  await page.getByLabel('Identifiant du défi').fill(CHALLENGE_ID);
  await page.getByLabel('Identifiant de la soumission').fill(
    '018f2c9e-7b3a-7c4d-9e11-2a6f5d4c8b04'
  );
  await page.getByRole('button', { name: 'Désigner la soumission' }).click();
  await expect(page.getByRole('status')).toContainText('Soumission officielle désignée');

  await page.goto('/leaderboards');
  await page.getByRole('tab', { name: 'Équipes' }).click();
  await expect(page.getByRole('table')).toContainText('Byte Me');
});
