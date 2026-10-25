import { defineConfig, devices } from '@playwright/test';

const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
const externalServer = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalServer
    ? undefined
    : [
        {
          command: `pnpm --filter @pokero/api dev`,
          cwd: '../..',
          url: `http://127.0.0.1:${API_PORT}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            APP_BASE_URL: baseURL,
            COOKIE_SECURE: 'false',
            EMAIL_VERIFICATION_REQUIRED: 'false',
          },
        },
        {
          command: `pnpm --filter @pokero/web dev -- --port ${WEB_PORT}`,
          cwd: '../..',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
