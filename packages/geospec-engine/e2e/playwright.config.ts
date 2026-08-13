import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env['CI']);
const port = 4330;
const baseURL = `http://localhost:${port}`;
const browserTestRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: browserTestRoot,
  testMatch: '*.spec.ts',
  outputDir: fileURLToPath(new URL('../../../dist/.playwright/packages/geospec-engine', import.meta.url)),
  forbidOnly: isCi,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  /* `vite build` runs first on purpose: the browser bundle is the contract. A
   * Node-only import reachable from the register entry fails here, before a
   * page ever loads — the same failure `nx serve ui` reports. */
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview',
    cwd: browserTestRoot,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
