#!/usr/bin/env node

/**
 * Purpose: Run the revisions round trip (record, back up, restore a large file) with the prepared Windows git payload.
 * Why: Windows desktop readiness R3: the bundled git and git-lfs must back a project up on a machine with neither.
 * Environment: Windows x64 with the runner's own git (the test server's `git http-backend`); `prepare-git-windows` run.
 * Usage: pnpm nx run desktop:test-windows-git-payload
 * Exit codes: the test run's.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { gitPayloadLayout } from './git-payload.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('The Windows git payload runs on a Windows x64 host');
}
const workspaceRoot = resolve(import.meta.dirname, '../../..');
const { git } = gitPayloadLayout(resolve(workspaceRoot, 'apps/desktop/resources/git'), 'win32-x64');
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', 'src/bundled-git.integration.test.ts'], {
  cwd: resolve(workspaceRoot, 'packages/revisions'),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment name
  env: { ...process.env, TAU_BUNDLED_GIT_EXECUTABLE: git },
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
