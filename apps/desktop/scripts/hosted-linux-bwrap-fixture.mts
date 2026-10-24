#!/usr/bin/env node
/**
 * Purpose: Build the real APT selector/runtime pair around an inert app for the hosted VM sandbox-bwrap proof.
 * Environment: Linux x64 with dpkg-deb; no signing keys, network or host package mutation.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/hosted-linux-bwrap-fixture.mts <output-directory>
 * Exit: nonzero when the producer refuses the fixture or the output directory is missing.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// oxlint-disable-next-line no-restricted-imports -- Exercise the real package producer.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';

const output = process.argv[2];
if (!output) {
  throw new TypeError('Usage: hosted-linux-bwrap-fixture.mts <output-directory>');
}
// Only the selector's maintainer scripts, profile and trigger are under test; the app never runs.
const app = await mkdtemp(join(tmpdir(), 'tau-bwrap-fixture-'));
await mkdir(join(app, 'resources/branding'), { recursive: true });
await writeFile(join(app, 'resources/branding/icon.png'), 'fixture icon');
await writeFile(join(app, 'Tau'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
const files = await buildLinuxAptPackages({
  appDirectory: app,
  outputDirectory: resolve(output),
  tag: 'desktop-staging@0.1.0-staging.1',
  sourceCommit: 'f'.repeat(40),
  maintainer: 'Tau VM proof <proof@example.invalid>',
});
console.log(files.join('\n'));
