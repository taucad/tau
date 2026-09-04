import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Desktop smoke E2E (batch Z).
 *
 * Plain Node vitest, not browser mode: the harness drives the Electron app
 * through Playwright's `_electron` from the test process itself, so every
 * assertion — DOM *and* raw `node:fs` — runs in one place. `apps/react-e2e`
 * needs its browser-command indirection because one spec has to serve web
 * targets too; this suite only ever launches Electron.
 */
export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      {
        find: '@taucad/runtime-testing',
        replacement: resolve(import.meta.dirname, '../../packages/runtime-testing/src/index.ts'),
      },
      {
        find: /^#support\/(.*)\.js$/u,
        replacement: `${resolve(import.meta.dirname, 'src/support')}/$1.ts`,
      },
    ],
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globalSetup: [resolve(import.meta.dirname, 'global-setup.ts')],
    // The replay chat budgets 180 s for success; a cold Electron launch, an
    // OpenSCAD render and a re-render ride on top of that.
    testTimeout: 600_000,
    hookTimeout: 300_000,
    // One Electron app, one API, one exclusive port pair.
    fileParallelism: false,
    pool: 'forks',
    reporters: ['default'],
  },
});
