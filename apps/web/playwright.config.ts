import { defineConfig, devices } from '@playwright/test';

/**
 * 4 navigateurs × 3 viewports (plan.md / T009).
 * Les scénarios E2E sont ajoutés histoire par histoire.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    // Le service worker n'est autorisé que dans la suite PWA (T240) : ailleurs
    // il rendrait les scénarios dépendants d'un cache partagé entre pages.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000
      },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'edge-desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'chromium-tablet', use: { ...devices['iPad (gen 7)'] } }
  ]
});
