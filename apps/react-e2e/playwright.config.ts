import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const e2eRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(e2eRoot, '../..');
const nextAppRoot = resolve(e2eRoot, 'apps/nextjs');
const reactRouterAppRoot = resolve(e2eRoot, 'apps/react-router');
const nextBin = resolve(repoRoot, 'node_modules/.bin/next');
const viteBin = resolve(repoRoot, 'node_modules/.bin/vite');

const selectedProjects = new Set(
  process.argv.flatMap((arg, index, args) => {
    if (arg.startsWith('--project=')) {
      return [arg.slice('--project='.length)];
    }

    if (arg === '--project' && args[index + 1]) {
      return [args[index + 1]];
    }

    return [];
  }),
);

const shouldStartWebServer = (projectName: string): boolean =>
  selectedProjects.size === 0 || selectedProjects.has(projectName);

export default defineConfig({
  testDir: './specs',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  reporter: 'list',
  webServer: [
    shouldStartWebServer('nextjs') && {
      command: `${nextBin} build --turbopack && ${nextBin} start -H 127.0.0.1 -p 3101`,
      cwd: nextAppRoot,
      url: 'http://127.0.0.1:3101',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    shouldStartWebServer('react-router') && {
      command: `${viteBin} build --config vite.react-router.config.ts && ${viteBin} preview --config vite.react-router.config.ts --host 127.0.0.1 --port 3102`,
      cwd: reactRouterAppRoot,
      url: 'http://127.0.0.1:3102',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ].filter((server) => server !== false),
  projects: [
    {
      name: 'nextjs',
      testMatch: /nextjs\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3101',
      },
    },
    {
      name: 'react-router',
      testMatch: /react-router\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:3102',
      },
    },
    {
      name: 'electron',
      testMatch: /electron\.spec\.ts/,
    },
  ],
});
