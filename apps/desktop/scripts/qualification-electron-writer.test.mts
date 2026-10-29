#!/usr/bin/env node
/**
 * Qualify Linux dependency discovery and authority ownership in real Electron utilities, without security overrides.
 * Usage: pnpm nx run desktop:test-qualification-electron-writer in a disposable graphical Linux guest.
 * Exit codes: 0 native exclusion/release/crash recovery passed; nonzero unavailable host or failed assertion.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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
const lookups = [];
const childProcess = require('node:child_process');
const originalSpawnSync = childProcess.spawnSync;
// Record the original lookup result, not a second probe that may succeed after a transient failure.
childProcess.spawnSync = (command, args, options) => {
  const started = Date.now();
  const result = originalSpawnSync(command, args, options);
  if (command === 'which') lookups.push({target: args[0], elapsed: Date.now() - started,
    status: result.status, signal: result.signal, error: result.error?.code ?? null});
  return result;
};
require('node:module').syncBuiltinESMExports();
import(${JSON.stringify(import.meta.resolve('@anthropic-ai/sandbox-runtime'))}).then(async ({SandboxManager}) => {
  try {
    const dependencies = await SandboxManager.checkDependenciesAsync();
    console.log(JSON.stringify({kind:'sandbox-dependency-lookups', lookups, ...dependencies}));
    if (dependencies.errors.length) throw new Error(dependencies.errors.join('; '));
  } finally {
    childProcess.spawnSync = originalSpawnSync;
    require('node:module').syncBuiltinESMExports();
  }
  return acquireNodeAuthorityWriter({authorityRoot: process.argv[2]});
}).then(writer => {
  keepAlive = setInterval(() => {}, 1000);
  parentPort.on('message', async ({data}) => {
    if (data !== 'release') throw new Error('Unexpected fixture command');
    await writer.release();
    await writer.release();
    clearInterval(keepAlive);
    parentPort.postMessage({status: 'released'});
  });
  parentPort.postMessage({status: 'owned', electron: process.versions.electron, type: process.type, lookups});
}).catch(error => parentPort.postMessage({status: 'refused', code: error.code, message: error.message, lookups}));
`,
  );
  await writeFile(
    join(root, 'main.cjs'),
    `
const { app, utilityProcess, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { mkdirSync, symlinkSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
app.setPath('userData', join(__dirname, 'profile'));
// The software probe closes its window before the utility assertions; only explicit completion may quit.
app.on('window-all-closed', () => {});
const children = [];
let softwareRenderer;
const message = child => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Utility response deadline')), 15000);
  child.once('message', value => { clearTimeout(timer); resolve(value); });
  child.once('exit', code => { clearTimeout(timer); reject(new Error('Utility exited before response: '+code)); });
});
const launch = root => {
  const child = utilityProcess.fork(join(__dirname, 'utility.cjs'), [root], {stdio: 'pipe'});
  child.stdout.on('data', chunk => process.stdout.write(chunk));
  child.stderr.on('data', chunk => process.stderr.write(chunk));
  children.push(child);
  return child;
};
app.whenReady().then(async () => {
  if (process.env.TAU_QUALIFICATION_GRAPHICS === 'isolated-software') {
    const window = new BrowserWindow({show:false, webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false}});
    try {
      await window.loadURL('data:text/html,<canvas></canvas>');
      const graphics = await window.webContents.executeJavaScript("(() => { const gl = document.querySelector('canvas').getContext('webgl2'); const debug = gl?.getExtension('WEBGL_debug_renderer_info'); return {webgl2:gl !== null, renderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : ''}; })()");
      console.log(JSON.stringify({kind:'isolated-software-ci-preflight', ...graphics,
        rendererSandbox:window.webContents.getLastWebPreferences().sandbox,
        stockGpuAcceptance:'open'}));
      assert.equal(graphics.webgl2, true);
      assert.match(graphics.renderer, /SwiftShader/i);
      softwareRenderer = graphics.renderer;
      assert.equal(window.webContents.getLastWebPreferences().sandbox, true);
    } finally {
      window.destroy();
    }
  }
  const authority = join(__dirname, 'authority with spaces');
  const alias = join(__dirname, 'alias');
  mkdirSync(authority);
  symlinkSync(authority, alias);
  const owner = launch(authority);
  const first = await message(owner);
  assert.equal(first.status, 'owned', JSON.stringify(first));
  assert.equal(first.type, 'utility');
  const ripgrep = first.lookups.find(lookup => lookup.target === 'rg');
  assert.ok(ripgrep, 'Pinned sandbox runtime must actually probe ripgrep');
  assert.equal(ripgrep.status, 0, JSON.stringify(ripgrep));
  assert.equal(ripgrep.signal, null);
  assert.equal(ripgrep.error, null);
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
  const completed = {status:'passed', platform:process.platform, electron:first.electron,
    dependencyLookups:first.lookups,
    ...(softwareRenderer ? {softwareRenderer} : {}),
    utilityExclusion:true, physicalAliasExclusion:true, sigkillRecovery:true, explicitRelease:true, symlinkRefusal:true};
  writeFileSync(join(__dirname, 'completed.json'), JSON.stringify(completed), {flag:'wx'});
  console.log(JSON.stringify(completed));
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
  const graphicsArguments =
    process.env['TAU_QUALIFICATION_GRAPHICS'] === 'isolated-software'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : [];
  const result = spawnSync('/usr/bin/tau-staging', [join(root, 'main.cjs'), ...graphicsArguments], {
    stdio: 'inherit',
    timeout: 90_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Real Electron utility ownership qualification failed');
  const completed = z
    .object({
      status: z.literal('passed'),
      utilityExclusion: z.literal(true),
      physicalAliasExclusion: z.literal(true),
      sigkillRecovery: z.literal(true),
      explicitRelease: z.literal(true),
      symlinkRefusal: z.literal(true),
      softwareRenderer: z.string().optional(),
    })
    .parse(JSON.parse(await readFile(join(root, 'completed.json'), 'utf8')));
  if (process.env['TAU_QUALIFICATION_GRAPHICS'] === 'isolated-software') {
    assert.match(completed.softwareRenderer ?? '', /SwiftShader/iu);
  }
} finally {
  if (installationStarted) {
    runQualificationApt('remove', ['tau-staging', 'tau-staging-runtime-1.0.1']);
  }
  await rm(root, { recursive: true, force: true });
}
