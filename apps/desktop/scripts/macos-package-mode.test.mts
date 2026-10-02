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
import { readFileSync } from 'node:fs';

import { FuseV1Options } from '@electron/fuses';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { macosPackageFuses, parseMacosPackageMode } from './macos-package-mode.mjs';

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

const packageSource = readFileSync(new URL('package-macos.mts', import.meta.url), 'utf8');
const licenceGate = packageSource.indexOf('if (zip) {');
assert.ok(licenceGate > packageSource.indexOf('parseMacosPackageMode(process.argv.slice(2))'));
assert.ok(
  packageSource.slice(licenceGate).startsWith(`if (zip) {
  execFileSync(process.execPath, [resolve(workspaceRoot, 'packages/plugins/tscircuit/check-vendored-licenses.mjs')],`),
);
assert.ok(licenceGate < packageSource.indexOf('let geospecAssemblyInput'));

/* Security assessment 2026-10 desktop F-3: the hardening fuses are on in every mode,
 * RunAsNode is never touched (ACP adapters need it), and only a release refuses --inspect. */
for (const release of [false, true]) {
  const fuses = macosPackageFuses({ release });
  assert.equal(fuses[FuseV1Options.RunAsNode], undefined);
  assert.equal(fuses[FuseV1Options.EnableCookieEncryption], true);
  assert.equal(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable], false);
  assert.equal(fuses[FuseV1Options.EnableNodeCliInspectArguments], !release);
  assert.equal(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation], true);
  assert.equal(fuses[FuseV1Options.OnlyLoadAppFromAsar], true);
}
const fuseFlip = packageSource.indexOf('await flipFuses(appPath');
assert.ok(fuseFlip !== -1 && fuseFlip < packageSource.indexOf('await sign({'));
assert.ok(packageSource.includes('...(release ? {} : { tauDesktop: { environmentOverrides: true } }),'));
console.log('✓ macOS packages flip the hardening fuses before signing, and only a release refuses --inspect');
