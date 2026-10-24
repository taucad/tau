#!/usr/bin/env node
/**
 * Exercise the built desktop preload's IPC, save and MessagePort bridges with a real sandboxed renderer.
 * Usage: pnpm nx run desktop:test-preload-sandbox on macOS or Windows; Linux uses the full-guest AppImage proof.
 * Environment: graphical native host; no accounts, credentials, release installs or update feeds are used.
 * Exit: nonzero on build, preload, bridge or process failure.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- Same native bridge fixture as the full Linux guest.
import { writeSandboxedPreloadFixture } from './preload-sandbox-fixture.mjs';

assert.ok(process.platform === 'darwin' || process.platform === 'win32');
assert.ok(!process.env['ELECTRON_RUN_AS_NODE']);
const output = resolve('out');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'preload-sandbox-'));
try {
  const source = await writeSandboxedPreloadFixture(root);
  const electron = z.string().parse(createRequire(import.meta.url)('electron'));
  const result = spawnSync(electron, [source, '--fixture-exit', `--user-data-dir=${join(root, 'profile')}`], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const line = result.stdout.split('\n').find((entry) => entry.startsWith('TAU_SANDBOX_PROOF:'));
  assert.ok(line, `No native preload proof: ${result.stderr}`);
  const proof = z
    .object({ sandboxed: z.literal(true), isolated: z.literal(true), bridge: z.literal('desktop') })
    .parse(JSON.parse(line.slice('TAU_SANDBOX_PROOF:'.length)));
  console.log(JSON.stringify({ platform: process.platform, status: 'passed', ...proof }));
} finally {
  await rm(root, { recursive: true, force: true });
}
