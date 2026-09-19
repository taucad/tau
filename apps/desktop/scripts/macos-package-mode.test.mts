#!/usr/bin/env node

/**
 * Purpose: Check the macOS package mode boundary without invoking packaging or signing tools.
 * Why: Measurement packages must never combine unsigned and release behavior.
 * Environment: Node.js 22+.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/macos-package-mode.test.mts
 * Exit codes: 0 when package mode validation passes; non-zero on regression.
 */

import assert from 'node:assert/strict';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { parseMacosPackageMode } from './macos-package-mode.mjs';

assert.deepEqual(parseMacosPackageMode([]), { release: false, unsigned: false });
assert.deepEqual(parseMacosPackageMode(['--release']), { release: true, unsigned: false });
assert.deepEqual(parseMacosPackageMode(['--unsigned']), { release: false, unsigned: true });
assert.throws(() => parseMacosPackageMode(['--release', '--unsigned']), /cannot be used together/u);
console.log('✓ macOS package modes are mutually exclusive');
