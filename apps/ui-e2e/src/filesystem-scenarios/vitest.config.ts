import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/**
 * The filesystem scenario harness (charter W0): the S1–S20 runners on real
 * OPFS in a real browser, with no UI server.
 *
 * `TAU_FS_SCENARIO_PROFILE` picks the fixture (`small`, CI's default, or `full`,
 * the STO-25 shape); `TAU_FS_SCENARIO_RUNS` the samples per scenario;
 * `TAU_FS_SCENARIO_RECORD=true` rewrites the baseline beside this file.
 * `TAU_E2E_CHROMIUM_EXECUTABLE` points at another installed Chromium when the
 * pinned Playwright's own is absent.
 *
 * The browser keeps a persistent profile under `node_modules/.cache` so OPFS
 * is disk-backed, as a person's is; an ephemeral context keeps it in memory.
 */
const workspaceRoot = resolve(import.meta.dirname, '../../../..');
const profile = process.env['TAU_FS_SCENARIO_PROFILE'] ?? 'small';
if (profile !== 'small' && profile !== 'full') {
  throw new Error(`TAU_FS_SCENARIO_PROFILE must be small or full; got ${profile}.`);
}
const runs = Number(process.env['TAU_FS_SCENARIO_RUNS'] ?? (profile === 'full' ? 1 : 3));
const head = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const executablePath = process.env['TAU_E2E_CHROMIUM_EXECUTABLE'];
/* Count gates are hard on all three engines (D15); only engines Playwright has installed can run. */
const engines = (process.env['TAU_FS_SCENARIO_ENGINES'] ?? 'chromium').split(',').map((engine) => engine.trim());
for (const engine of engines) {
  if (engine !== 'chromium' && engine !== 'firefox' && engine !== 'webkit') {
    throw new Error(`TAU_FS_SCENARIO_ENGINES lists an unknown engine: ${engine}.`);
  }
}

export default defineConfig({
  root: import.meta.dirname,
  server: { fs: { allow: [workspaceRoot] } },
  resolve: {
    alias: [
      { find: /^#filesystem-scenarios\/(.*)\.js$/u, replacement: `${import.meta.dirname}/$1.ts` },
      { find: /^#filesystem-scenarios\/(.*\.json)$/u, replacement: `${import.meta.dirname}/$1` },
    ],
  },
  test: {
    include: ['**/*.scenario.ts'],
    testTimeout: profile === 'full' ? 3_600_000 : 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    retry: 0,
    provide: {
      filesystemScenarioProfile: profile,
      filesystemScenarioRuns: runs,
      filesystemScenarioRecord: process.env['TAU_FS_SCENARIO_RECORD'] === 'true',
      filesystemScenarioHead: head,
      filesystemScenarioOutput: resolve(workspaceRoot, 'out/test-results/filesystem-scenarios'),
    },
    browser: {
      enabled: true,
      headless: true,
      api: { allowWrite: true },
      screenshotFailures: false,
      instances: engines.map((engine) => ({
        browser: engine as 'chromium' | 'firefox' | 'webkit',
        name: engine,
        provider: playwright({
          persistentContext: resolve(workspaceRoot, `node_modules/.cache/tau-filesystem-scenarios/${engine}-profile`),
          launchOptions: engine === 'chromium' && executablePath !== undefined ? { executablePath } : {},
        }),
      })),
    },
  },
});
