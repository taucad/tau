import { resolve } from 'node:path';
import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const uiRoot = resolve(workspaceRoot, 'apps/ui');
const port = '3215';
const baseURL = `http://127.0.0.1:${port}`;
const environment: Record<string, string> = {};
environment['TAU_API_URL'] = 'http://localhost:4000';
environment['TAU_DEBUG'] = 'true';
environment['TAU_FRONTEND_URL'] = baseURL;
environment['TAU_WEBSOCKET_URL'] = 'ws://localhost:4001';
environment['NODE_OPTIONS'] = '--max-old-space-size=8192';

export default defineConfig({
  testDir: './src',
  testMatch: /(?:preview|geospec-runner)\.spec\.ts/,
  grep: /renders a 3D model for the Hollow Box project|produces GLB evidence through both real workers/,
  timeout: 60_000,
  expect: { timeout: 60_000 },
  reporter: 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${resolve(workspaceRoot, 'node_modules/.bin/react-router')} dev --host 127.0.0.1 --port ${port} --strictPort --force`,
    cwd: uiRoot,
    env: environment,
    reuseExistingServer: !process.env['CI'],
    timeout: 600_000,
    url: baseURL,
  },
  projects: [
    {
      name: 'chromium-development',
      metadata: { mode: 'development' },
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
