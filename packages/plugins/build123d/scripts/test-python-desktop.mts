#!/usr/bin/env node

/**
 * Purpose: Run Build123d's Python tests and strict coverage gate with the prepared desktop interpreter, including on
 * Windows, where the registry closure is not yet declared.
 * Why: The desktop ships its own interpreter; its tests and coverage gate are the shared runner's
 * (`@taucad/python-kernel-core`'s `tau-python-kernel test --package <dir>`), which `build123d:test-python` runs with
 * the sealed closure's interpreter instead.
 * Environment: the prepared desktop resources (`pnpm nx run desktop:prepare-build123d-python`).
 * Usage: pnpm nx run build123d:test-python-desktop
 * Exit codes: 0 when the tests pass with 100% line and branch coverage; 1 when resource validation, tests or coverage
 * fail.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../../..');
const coreRoot = dirname(createRequire(import.meta.url).resolve('@taucad/python-kernel-core/package.json'));

const target = `${process.platform}-${process.arch}`;
const targetRoot = resolve(repoRoot, 'apps/desktop/resources/python', target);
const manifest = z
  .object({
    target: z.literal(target),
    build123dVersion: z.literal('0.13.0'),
    pythonSha256: z.string().regex(/^[\da-f]{64}$/u),
  })
  .parse(JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')));
const pythonExecutable = resolve(targetRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const digest = createHash('sha256').update(readFileSync(pythonExecutable)).digest('hex');
if (digest !== manifest.pythonSha256) {
  throw new Error('Prepared desktop interpreter digest mismatch; run desktop:prepare-build123d-python.');
}

const { status, error } = spawnSync(
  process.execPath,
  [
    '--import',
    '@oxc-node/core/register',
    resolve(coreRoot, 'scripts/tau-python-kernel.mts'),
    'test',
    '--package',
    packageRoot,
    '--python',
    pythonExecutable,
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (error) {
  throw error;
}
process.exitCode = status ?? 1;
