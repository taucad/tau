#!/usr/bin/env node
/**
 * Qualify Linux authority ownership in real Electron utility processes, without renderer/sandbox overrides.
 * Usage: pnpm nx run desktop:test-qualification-electron-writer in a disposable graphical Linux guest.
 * Exit codes: 0 native exclusion/release/crash recovery passed; nonzero unavailable host or failed assertion.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- Exercise the shipping APT sandbox integration.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';
// oxlint-disable-next-line no-restricted-imports -- Use the same bounded native APT driver as installed qualification.
import { runQualificationApt } from './qualification-linux.mjs';

assert.equal(process.platform, 'linux');
assert.equal(process.env['TAU_QUALIFICATION_DISPOSABLE_VM'], '1');
assert.ok(process.env['DISPLAY']);
const output = resolve('out');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'electron-writer-'));
// The tooling guest is fresh; never replace an existing user installation.
await assert.rejects(stat('/opt/tau-staging'), { code: 'ENOENT' });
let installationStarted = false;
try {
  await mkdir(join(root, 'profile'));
  await build({
    entryPoints: ['packages/filesystem/src/backend/node/authority-writer-lock.ts'],
    outfile: join(root, 'authority.cjs'),
    platform: 'node',
    format: 'cjs',
    bundle: true,
  });
  await writeFile(
    join(root, 'utility.cjs'),
    `
const { parentPort } = require('node:process');
const { acquireNodeAuthorityWriter } = require('./authority.cjs');
if (!process.versions.electron || process.type !== 'utility' || !parentPort) throw new Error('Real Electron utility required');
let keepAlive;
acquireNodeAuthorityWriter({authorityRoot: process.argv[2]}).then(writer => {
  keepAlive = setInterval(() => {}, 1000);
  parentPort.on('message', async ({data}) => {
    if (data !== 'release') throw new Error('Unexpected fixture command');
    await writer.release();
    await writer.release();
    clearInterval(keepAlive);
    parentPort.postMessage({status: 'released'});
  });
  parentPort.postMessage({status: 'owned', electron: process.versions.electron, type: process.type});
}).catch(error => parentPort.postMessage({status: 'refused', code: error.code, message: error.message}));
`,
  );
  await writeFile(
    join(root, 'main.cjs'),
    `
const { app, utilityProcess } = require('electron');
const assert = require('node:assert/strict');
const { mkdirSync, symlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
app.setPath('userData', join(__dirname, 'profile'));
const children = [];
const message = child => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Utility response deadline')), 15000);
  child.once('message', value => { clearTimeout(timer); resolve(value); });
  child.once('exit', code => { clearTimeout(timer); reject(new Error('Utility exited before response: '+code)); });
});
const launch = root => {
  const child = utilityProcess.fork(join(__dirname, 'utility.cjs'), [root], {stdio: 'pipe'});
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  children.push(child);
  return child;
};
app.whenReady().then(async () => {
  const authority = join(__dirname, 'authority with spaces');
  const alias = join(__dirname, 'alias');
  mkdirSync(authority);
  symlinkSync(authority, alias);
  const owner = launch(authority);
  const first = await message(owner);
  assert.equal(first.status, 'owned');
  assert.equal(first.type, 'utility');
  const competitor = await message(launch(alias));
  assert.equal(competitor.code, 'AUTHORITY_ALREADY_OWNED');
  const died = new Promise(resolve => owner.once('exit', resolve));
  process.kill(owner.pid, 'SIGKILL');
  await died;
  const recovered = launch(authority);
  assert.equal((await message(recovered)).status, 'owned');
  const released = message(recovered);
  recovered.postMessage('release');
  assert.equal((await released).status, 'released');
  assert.equal((await message(launch(authority))).status, 'owned');
  const unsafe = join(__dirname, 'symlink-root');
  mkdirSync(unsafe);
  writeFileSync(join(__dirname, 'outside'), 'inert');
  symlinkSync(join(__dirname, 'outside'), join(unsafe, 'authority.writer.lock'));
  assert.equal((await message(launch(unsafe))).code, 'AUTHORITY_LOCK_UNAVAILABLE');
  console.log(JSON.stringify({status:'passed', platform:process.platform, electron:first.electron,
    utilityExclusion:true, physicalAliasExclusion:true, sigkillRecovery:true, explicitRelease:true, symlinkRefusal:true}));
}).then(() => {
  for (const child of children) if (child.pid) child.kill();
  app.exit(0);
}, error => {
  console.error(error);
  for (const child of children) if (child.pid) child.kill();
  app.exit(1);
});
`,
  );
  const require = createRequire(import.meta.url);
  const electron = z.string().parse(require('electron'));
  // Package the pinned Electron runtime through the shipping producer. Ubuntu needs the
  // same narrowly scoped AppArmor profile as installed Tau; node_modules has no profile.
  const appDirectory = join(root, 'app');
  await cp(dirname(electron), appDirectory, { recursive: true });
  await rename(join(appDirectory, 'electron'), join(appDirectory, 'Tau'));
  await mkdir(join(appDirectory, 'resources/branding'), { recursive: true });
  await cp('apps/desktop/resources/icon.png', join(appDirectory, 'resources/branding/icon.png'));
  const packages = await buildLinuxAptPackages({
    appDirectory,
    outputDirectory: join(root, 'packages'),
    tag: 'desktop-staging@0.1.0-staging.1',
    sourceCommit: 'a'.repeat(40),
    maintainer: 'Tau qualification <qualification@example.invalid>',
  });
  installationStarted = true;
  runQualificationApt('install', [...packages]);
  const installed = await stat('/opt/tau-staging/releases/1.0.1/Tau');
  assert.equal(installed.uid, 0);
  const result = spawnSync('/usr/bin/tau-staging', [join(root, 'main.cjs')], {
    stdio: 'inherit',
    timeout: 90_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Real Electron utility ownership qualification failed');
} finally {
  if (installationStarted) {
    runQualificationApt('remove', ['tau-staging', 'tau-staging-runtime-1.0.1']);
  }
  await rm(root, { recursive: true, force: true });
}
