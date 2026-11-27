import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Locally the stack reads its secrets from the .env next to docker-compose.yml: reuse them.
// Variables already set (CI) win over the file.
if (existsSync('../.env')) process.loadEnvFile('../.env');

/** Pages a guest sees: they also run on a phone, where the public menu is mostly used. */
const PUBLIC_SPECS = /\.public\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  // One backend and one SQLite file behind every test: the journeys create their own data
  // with a unique suffix and run one after the other, which keeps them free of races.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // No retry: a test that passes on the second try is a flaky test, and must show as one
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The interface and the assertions are in English whatever the browser language
    locale: 'en-US',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },
    {
      name: 'chromium',
      testMatch: /\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      testMatch: PUBLIC_SPECS,
      // Pixel 7 runs on Chromium: a single browser keeps the job short
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
  ],
});
