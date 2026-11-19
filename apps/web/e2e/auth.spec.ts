import { expect, test } from '@playwright/test';

const profile = {
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

/**
 * Parcours US1 (T048) : inscription → confirmation → connexion → révocation.
 *
 * L'API est simulée au niveau réseau pour que le scénario reste focalisé sur
 * l'interface et reproductible sans base : les contrats réels sont couverts par
 * `apps/api/test/contract/auth.contract.spec.ts`.
 */
test('inscription, confirmation, connexion puis révocation de session', async ({ page }) => {
  await page.route('**/api/v1/auth/register', (route) => route.fulfill({ status: 201, body: '' }));
  await page.route('**/api/v1/auth/verify-email', (route) =>
    route.fulfill({ status: 204, body: '' })
  );
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
  );
  // État mutable : la révocation doit retirer la session du prochain GET, sinon
  // l'invalidation TanStack Query réaffiche une liste figée (faux positif).
  const activeSessions = [
    {
      id: 'session-1',
      userAgent: 'Playwright / Chromium',
      ipPrefix: '203.0.113.0/24',
      createdAt: '2026-11-13T10:00:00.000Z',
      lastUsedAt: '2026-11-13T12:00:00.000Z',
      current: true
    },
    {
      id: 'session-2',
      userAgent: 'Autre appareil',
      ipPrefix: '198.51.100.0/24',
      createdAt: '2026-11-12T10:00:00.000Z',
      lastUsedAt: '2026-11-12T12:00:00.000Z',
      current: false
    }
  ];

  await page.route('**/api/v1/me/sessions/**', (route) => {
    if (route.request().method() === 'DELETE') {
      const id = new URL(route.request().url()).pathname.split('/').pop();
      const index = activeSessions.findIndex((session) => session.id === id);
      if (index >= 0) activeSessions.splice(index, 1);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, body: '[]' });
  });
  await page.route('**/api/v1/me/sessions', (route) => {
    if (route.request().method() === 'DELETE') {
      activeSessions.splice(0);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(activeSessions)
    });
  });

  await page.goto('/register');
  await page.getByLabel('Adresse e-mail').fill('ada@example.com');
  await page.getByLabel('Pseudo').fill('ada');
  await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('status')).toContainText('Compte créé');

  await page.goto('/verify-email?token=jeton-de-test');
  await expect(page.getByRole('status')).toContainText('adresse e-mail est confirmée');

  await page.goto('/login');
  await page.getByLabel('E-mail ou pseudo').fill('ada@example.com');
  await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mon profil');

  await page.goto('/settings/sessions');
  await expect(page.getByText('Playwright / Chromium')).toBeVisible();
  await expect(page.getByText('Session courante')).toBeVisible();
  await page.getByRole('button', { name: /Révoquer : Autre appareil/ }).click();
  await expect(page.getByText('Autre appareil')).toHaveCount(0);

  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/$/);
});
