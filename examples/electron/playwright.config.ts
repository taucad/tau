import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  /* Electron tests are inherently sequential — only one Electron app can
   * own the user-facing window at a time on most CI runners. */
  workers: 1,
  fullyParallel: false,
  reporter: process.env['CI'] ? [['line'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
