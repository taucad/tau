import process from 'node:process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import type { PlaywrightTestConfig } from '@playwright/test';

const port = process.env['PORT'] ?? '3000';
const baseURL = process.env['BASE_URL'] ?? `http://localhost:${port}`;
const isCi = Boolean(process.env['CI']);
const configDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(configDirectory, '../..');
const uiRoot = join(workspaceRoot, 'apps/ui');
const outputRoot = join(workspaceRoot, 'dist/.playwright/apps/ui-e2e');
const htmlReportOutput = process.env['PLAYWRIGHT_HTML_OUTPUT_DIR'] ?? join(outputRoot, 'playwright-report');
const reporter: NonNullable<PlaywrightTestConfig['reporter']> = [
  [
    'html',
    {
      outputFolder: htmlReportOutput,
      open: 'on-failure',
    },
  ],
];

if (isCi) {
  reporter.push([
    'blob',
    {
      outputDir: join(outputRoot, 'blob-report'),
    },
  ]);
}

export default defineConfig({
  testDir: './src',
  outputDir: join(outputRoot, 'test-output'),
  fullyParallel: true,
  forbidOnly: isCi,
  workers: isCi ? 1 : undefined,
  timeout: 60_000,
  retries: isCi ? 2 : 0,
  reporter,

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },

  use: {
    baseURL,
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    /* Boots the already-built production React Router server (`apps/ui/server.ts`) under
     * `NODE_ENV=production`. The Nx e2e target depends on `ui:build`; running the server
     * process directly here avoids nesting Nx inside Nx for a continuous `ui:serve` task.
     * `TAU_DEBUG=true` flips on the diagnostic panel below the preview "Downloads" section
     * so e2e specs can scrape `bbox-*` / `count-*` / `asset-*` testids — the same surface
     * the Electron suite consumes.
     *
     * Endpoint env vars are stubbed to localhost defaults; the e2e flow
     * never hits the API (geometry is computed entirely client-side via
     * the web-worker transport). */
    command: 'node --env-file-if-exists=.env --import @oxc-node/core/register server.ts',
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      PORT: port,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      TAU_DEBUG: 'true',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      TAU_API_URL: 'http://localhost:4000',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      TAU_WEBSOCKET_URL: 'ws://localhost:4001',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      TAU_FRONTEND_URL: baseURL,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- env var keys
      NODE_ENV: 'production',
    },
    url: baseURL,
    reuseExistingServer: !isCi,
    cwd: uiRoot,
    timeout: 180_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    {
      name: 'webkit',
      testMatch: /(?:birdhouse-)?preview\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },

    // Uncomment for mobile browsers support
    /* {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    }, */

    // Uncomment for branded browsers
    /* {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    } */
  ],
});
