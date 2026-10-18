#!/usr/bin/env node

/**
 * Purpose: Run the shared Python kernel tau-plugin generator for Build123d, for callers that name this path.
 * Why: The generator moved to `@taucad/python-kernel-core` (its `scripts/generate-tau-plugin.mts --package <dir>`);
 * the desktop's `prepare-build123d-python.mts` still fills its seed through this script.
 * Environment: as the core generator: Node 24+ and network access for generate, check and seed.
 * Usage:
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts [--check]
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts seed [--target <key>]
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts golden
 *   Each takes the core generator's options, such as --seed <dir>.
 * Exit codes: the core generator's.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const coreRoot = dirname(createRequire(import.meta.url).resolve('@taucad/python-kernel-core/package.json'));

const { status, error } = spawnSync(
  process.execPath,
  [
    '--import',
    '@oxc-node/core/register',
    resolve(coreRoot, 'scripts/generate-tau-plugin.mts'),
    ...process.argv.slice(2),
    '--package',
    packageRoot,
  ],
  { stdio: 'inherit' },
);
if (error) {
  throw error;
}
process.exitCode = status ?? 1;
