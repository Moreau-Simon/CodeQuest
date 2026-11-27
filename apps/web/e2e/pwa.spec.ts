import { expect, test } from '@playwright/test';
import { installApiStub, LESSON, LESSON_ID, PROFILE } from './helpers/api';

test.use({ serviceWorkers: 'allow' });

/**
 * Une fois le service worker actif, Playwright ne peut plus intercepter les
 * requêtes réseau via `page.route` (limitation documentée). Le stub est donc
 * aussi installé dans la page : il répond aux seuls appels API dont dépend
 * l'affichage du cours, sans toucher aux ressources gérées par le SW.
 */
async function installFetchStub(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ profile, lesson }) => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/api/v1/')) return nativeFetch(input, init);
        const path = new URL(url, window.location.origin).pathname;
        const body = path.endsWith('/me')
          ? profile
          : path.includes(`/lessons/${lesson.id}`)
            ? lesson
            : [];
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };
    },
    { profile: PROFILE, lesson: LESSON }
  );
}

/** T240 / FR-103 : PWA installable, cours déjà consulté lisible hors ligne. */
test.beforeEach(async ({ page }) => {
  await installApiStub(page);
  await installFetchStub(page);
});

test('le manifest est installable avec des icônes 192 et 512', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) throw new Error('Lien de manifest absent');
    const response = await fetch(link.href);
    return (await response.json()) as {
      display?: string;
      start_url?: string;
      icons?: Array<{ src: string; sizes: string; type?: string; purpose?: string }>;
    };
  });

  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons?.some((icon) => icon.sizes === '192x192')).toBe(true);
  expect(manifest.icons?.some((icon) => icon.sizes === '512x512')).toBe(true);
});

test('un cours déjà consulté reste lisible hors ligne', async ({ page, context }) => {
  await page.goto(`/lessons/${LESSON_ID}`);
  await expect(page.getByRole('heading', { name: 'Variables et types' })).toBeVisible();
  await expect(page.getByText(/déjà consultée/)).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  // Une navigation en ligne avec le service worker actif met la coquille en cache.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variables et types' })).toBeVisible();
  const cachesAvant = await page.evaluate(() => caches.keys());
  expect(cachesAvant.length).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Variables et types' })).toBeVisible();
  await expect(page.getByText(/déjà consultée/)).toBeVisible();
  await expect(page.getByText(/Hors ligne/)).toBeVisible();
});

test('les scores, transactions et sockets ne sont jamais mis en cache', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  const urls = await page.evaluate(async () => {
    const collected: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) collected.push(request.url);
    }
    return collected;
  });

  const sensibles = urls.filter((url) =>
    /\/(api\/v1\/(submissions|leaderboards|wallet|admin)|socket\.io)/.test(url)
  );
  expect(sensibles).toEqual([]);
});
