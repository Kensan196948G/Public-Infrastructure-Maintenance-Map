import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
// API dev server port. 8787 is the API default; local machines that already
// run another service there can override via E2E_API_PORT (node.ts honors
// PORT, DL-025). CI uses the default.
const apiPort = Number(process.env.E2E_API_PORT ?? 8787);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
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
      command: `PORT=${apiPort} pnpm --filter @pimm/api dev`,
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      env: {
        ...process.env,
        // E2E では管理UIの認証済み経路を検証するため、ヘッダー注入した
        // テスト利用者をサーバ側 allowlist へ登録する（Access JWT はオフのまま）。
        ADMIN_EMAILS: 'admin@example.com',
        REVIEWER_EMAILS: 'reviewer@example.com',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm --dir apps/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      env: {
        ...process.env,
        // Point the dev proxy at the E2E API port (vite.config reads this).
        VITE_DEV_API_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
