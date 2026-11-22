import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @hero/api run dev',
      cwd: '../..',
      env: {
        ...process.env,
        DEMO: 'true',
        PORT: '3000',
      },
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @hero/web exec ng serve --proxy-config proxy.conf.json --port 4200',
      cwd: '../..',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});
