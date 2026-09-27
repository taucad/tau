#!/usr/bin/env node

/**
 * Purpose: Check the macOS package mode boundary without invoking packaging or signing tools.
 * Why: Measurement packages must never combine unsigned and release behavior, and only a release
 * writes the distribution ZIP unless --zip asks for it.
 * Environment: Node.js 22+.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/macos-package-mode.test.mts
 * Exit codes: 0 when package mode validation passes; non-zero on regression.
 */

import assert from 'node:assert/strict';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { parseMacosPackageMode } from './macos-package-mode.mjs';

assert.deepEqual(parseMacosPackageMode([]), { release: false, unsigned: false, zip: false });
assert.deepEqual(parseMacosPackageMode(['--release']), { release: true, unsigned: false, zip: true });
assert.deepEqual(parseMacosPackageMode(['--unsigned']), { release: false, unsigned: true, zip: false });
assert.deepEqual(parseMacosPackageMode(['--unsigned', '--zip']), { release: false, unsigned: true, zip: true });
assert.deepEqual(parseMacosPackageMode(['--zip']), { release: false, unsigned: false, zip: true });
assert.throws(() => parseMacosPackageMode(['--release', '--unsigned']), {
  name: 'TypeError',
  message: '--release and --unsigned cannot be used together',
});
assert.throws(() => parseMacosPackageMode(['--zipped']), {
  name: 'TypeError',
  message: 'Usage: <script> [--release | --unsigned] [--zip]',
});
console.log('✓ macOS package modes are mutually exclusive, and only release zips unless --zip is passed');
