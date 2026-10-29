#!/usr/bin/env node
/**
 * Purpose: Build the real APT selector/runtime pair around an inert app for the hosted VM sandbox-bwrap proof.
 * Environment: Linux x64 with dpkg-deb; no signing keys, network or host package mutation.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/hosted-linux-bwrap-fixture.mts <output-directory>
 * Exit: nonzero when the producer refuses the fixture or the output directory is missing.
 */
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageWithOptions } from '@electron/asar';

// oxlint-disable-next-line no-restricted-imports -- Exercise the real package producer.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';
// oxlint-disable-next-line no-restricted-imports -- Exercise the real ASAR packaging options.
import { runtimeAsarOptions } from './runtime-stage.mjs';

const output = process.argv[2];
if (!output) {
  throw new TypeError('Usage: hosted-linux-bwrap-fixture.mts <output-directory>');
}
// Only the selector's maintainer scripts, profile and trigger are under test; the app never runs.
const app = await mkdtemp(join(tmpdir(), 'tau-bwrap-fixture-'));
await mkdir(join(app, 'resources/branding'), { recursive: true });
await writeFile(join(app, 'resources/branding/icon.png'), 'fixture icon');
await writeFile(join(app, 'Tau'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
// Exercise the real helper after ASAR assembly and APT installation under the shipped AppArmor profile.
const stage = await mkdtemp(join(tmpdir(), 'tau-seccomp-stage-'));
const relativeHelper = 'node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp';
const dependency = dirname(dirname(fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime'))));
await mkdir(dirname(join(stage, relativeHelper)), { recursive: true });
await copyFile(join(dependency, 'vendor/seccomp/x64/apply-seccomp'), join(stage, relativeHelper));
const relativeJavaAgent = 'node_modules/@anthropic-ai/sandbox-runtime/vendor/java-proxy-agent/srt-proxy-agent.jar';
await mkdir(dirname(join(stage, relativeJavaAgent)), { recursive: true });
await copyFile(join(dependency, 'vendor/java-proxy-agent/srt-proxy-agent.jar'), join(stage, relativeJavaAgent));
await createPackageWithOptions(stage, join(app, 'resources/app.asar'), runtimeAsarOptions);

const files = await buildLinuxAptPackages({
  appDirectory: app,
  outputDirectory: resolve(output),
  tag: 'desktop-staging@0.1.0-staging.1',
  sourceCommit: 'f'.repeat(40),
  maintainer: 'Tau VM proof <proof@example.invalid>',
});
console.log(files.join('\n'));
