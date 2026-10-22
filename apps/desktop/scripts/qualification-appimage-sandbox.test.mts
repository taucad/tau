#!/usr/bin/env node
/**
 * Prove scoped AppArmor inheritance into a real AppImage and sandboxed Electron renderer.
 * Environment: disposable ordinary-user graphical Linux VM, sudo, AppArmor and native FUSE.
 * Usage: pnpm nx run desktop:test-qualification-appimage-sandbox
 * Exit: nonzero on lost sandbox, broad profile attachment or failed cleanup. No shipping support claim.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { createPackage } from '@electron/asar';
import { z } from 'zod';

assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
assert.equal(process.env['TAU_QUALIFICATION_DISPOSABLE_VM'], '1');
assert.notEqual(process.getuid?.(), 0);
assert.ok(process.env['DISPLAY']);
assert.ok(!process.env['APPIMAGE_EXTRACT_AND_RUN']);
assert.ok(!process.env['CHROME_DEVEL_SANDBOX']);
const installation = '/opt/tau-appimage-qualification';
const profile = '/etc/apparmor.d/tau-appimage-qualification';
const installedImage = join(installation, 'Tau.AppImage');
await assert.rejects(stat(installation), { code: 'ENOENT' });
await assert.rejects(stat(profile), { code: 'ENOENT' });
const output = resolvePath('out');
await mkdir(output, { recursive: true });
const root = await mkdtemp(join(output, 'appimage-sandbox-'));
const sudo = (args: string[]): string => execFileSync('sudo', ['-n', ...args], { encoding: 'utf8', timeout: 30_000 });
const proofSchema = z.object({
  sandboxed: z.literal(true),
  isolated: z.literal(true),
  pid: z.number().int().positive(),
  browserPid: z.number().int().positive(),
  executable: z.string(),
});
let installed = false;
let profileWritten = false;
let profileLoaded = false;
try {
  const appDirectory = join(root, 'app');
  const electron = z.string().parse(createRequire(import.meta.url)('electron'));
  await cp(dirname(electron), appDirectory, { recursive: true });
  await rename(join(appDirectory, 'electron'), join(appDirectory, 'Tau'));
  const source = join(root, 'source');
  await mkdir(source);
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'tau-sandbox-fixture',
      version: '1.0.1',
      main: 'main.cjs',
      tauDesktop: { channel: 'staging', sourceCommit: 'a'.repeat(40), environmentOverrides: false },
    }),
  );
  await writeFile(
    join(source, 'preload.cjs'),
    `const {ipcRenderer} = require('electron'); ipcRenderer.send('fixture-ready', {sandboxed:process.sandboxed, isolated:process.contextIsolated});`,
  );
  await writeFile(
    join(source, 'main.cjs'),
    `
const {app, BrowserWindow, ipcMain} = require('electron');
const {join} = require('node:path');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  const window = new BrowserWindow({show:false, webPreferences:{sandbox:true, contextIsolation:true, nodeIntegration:false, preload:join(__dirname,'preload.cjs')}});
  ipcMain.once('fixture-ready', (event, result) => {
    assert.equal(event.sender, window.webContents);
    assert.equal(result.sandboxed, true);
    assert.equal(result.isolated, true);
    console.log('TAU_SANDBOX_PROOF:'+JSON.stringify({...result,pid:window.webContents.getOSProcessId(),browserPid:process.pid,executable:process.execPath}));
  });
  await window.loadURL('data:text/html,<title>Tau sandbox fixture</title>');
}).catch(error => {console.error(error); app.exit(1);});
setTimeout(() => app.exit(1), 45000);
`,
  );
  await createPackage(source, join(appDirectory, 'resources/app.asar'));
  const { publicKey } = generateKeyPairSync('ed25519');
  const keyFile = join(root, 'keys.json');
  await writeFile(keyFile, JSON.stringify({ fixture: publicKey.export({ type: 'spki', format: 'pem' }) }));
  const packages = join(root, 'packages');
  const buildEnv = { ...process.env };
  buildEnv['TAU_APPIMAGE_APP_DIR'] = appDirectory;
  buildEnv['DESKTOP_RELEASE_TAG'] = 'desktop-staging@0.1.0-staging.1';
  buildEnv['TAU_DESKTOP_SOURCE_SHA'] = 'a'.repeat(40);
  buildEnv['TAU_APPIMAGE_PUBLIC_KEYS_FILE'] = keyFile;
  buildEnv['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] = packages;
  const built = spawnSync(
    process.execPath,
    [...process.execArgv, 'apps/desktop/scripts/package-appimage.mts', '--test-trust'],
    {
      env: buildEnv,
      encoding: 'utf8',
      timeout: 300_000,
    },
  );
  assert.ifError(built.error);
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const image = join(packages, 'Tau-linux-x64.AppImage');
  await stat(image);
  const restriction = await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').catch(() => '0');
  const restricted = restriction.trim() === '1';
  const operatingSystem = await readFile('/etc/os-release', 'utf8');
  if (/^ID=ubuntu$/mu.test(operatingSystem)) {
    assert.equal(restricted, true, 'Ubuntu proof requires its stock namespace restriction');
  }
  const refusals: Array<{ path: string; status: number | undefined; signal: string | undefined; stderr: string }> = [];
  const refuse = (path: string): void => {
    const result = spawnSync(path, [`--user-data-dir=${join(root, 'profile')}`], { encoding: 'utf8', timeout: 30_000 });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes('TAU_SANDBOX_PROOF:'));
    assert.match(result.stderr, /sandbox/iu);
    refusals.push({
      path,
      status: result.status ?? undefined,
      signal: result.signal ?? undefined,
      stderr: result.stderr,
    });
  };
  const launch = async (path: string, expectedProfile: string | undefined) => {
    const child = spawn(path, [`--user-data-dir=${join(root, 'profile')}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise<void>((resolve) => {
      child.once('close', () => {
        resolve();
      });
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (data: string) => {
      stderr += data;
    });
    try {
      const observation = await new Promise<z.infer<typeof proofSchema>>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Sandbox readiness deadline: ${stderr}`));
        }, 30_000);
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('exit', (code, signal) => {
          clearTimeout(timer);
          reject(new Error(`Electron exited ${code}/${signal}: ${stderr}`));
        });
        child.stdout.on('data', (data: string) => {
          stdout += data;
          const line = stdout.split('\n').find((entry) => entry.startsWith('TAU_SANDBOX_PROOF:'));
          if (!line || !stdout.includes(`${line}\n`)) {
            return;
          }
          clearTimeout(timer);
          try {
            resolve(proofSchema.parse(JSON.parse(line.slice('TAU_SANDBOX_PROOF:'.length))));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });
      const status = sudo(['cat', `/proc/${observation.pid}/status`]);
      assert.match(status, /^Seccomp:\s+2$/mu);
      assert.match(status, /^NoNewPrivs:\s+1$/mu);
      const rendererNamespace = sudo(['readlink', `/proc/${observation.pid}/ns/user`]).trim();
      const browserNamespace = sudo(['readlink', `/proc/${observation.browserPid}/ns/user`]).trim();
      assert.notEqual(rendererNamespace, browserNamespace);
      const label = sudo(['cat', `/proc/${observation.browserPid}/attr/current`]).trim();
      if (expectedProfile) {
        assert.equal(label, `${expectedProfile} (unconfined)`);
      }
      // Default FUSE access belongs to the mounting user, not even root without allow_root.
      const mount = execFileSync('findmnt', ['-n', '-o', 'FSTYPE,OPTIONS', '-T', observation.executable], {
        encoding: 'utf8',
        timeout: 10_000,
      }).trim();
      assert.match(mount, /fuse/iu);
      assert.match(mount, /nosuid/u);
      return { ...observation, label, rendererNamespace, browserNamespace, seccomp: 2, noNewPrivs: 1, mount };
    } finally {
      child.kill('SIGKILL');
      await exited;
    }
  };
  if (restricted) {
    refuse(image);
  }
  const unrestricted = restricted ? undefined : await launch(image, undefined);
  sudo(['install', '-d', '-m', '0755', installation]);
  installed = true;
  sudo(['install', '-m', '0755', image, installedImage]);
  const installedStat = await stat(installedImage);
  assert.equal(installedStat.uid, 0);
  const profileSource = join(root, 'apparmor-profile');
  await writeFile(
    profileSource,
    `abi <abi/4.0>,\ninclude <tunables/global>\nprofile tau-appimage-qualification ${installedImage} flags=(unconfined) {\n  userns,\n}\n`,
  );
  sudo(['install', '-m', '0644', profileSource, profile]);
  profileWritten = true;
  sudo(['apparmor_parser', '-r', profile]);
  profileLoaded = true;
  const first = await launch(installedImage, 'tau-appimage-qualification');
  const second = await launch(installedImage, 'tau-appimage-qualification');
  if (restricted) {
    refuse(image);
  }
  // Administrator-controlled atomic inode replacement; not a portable updater acceptance claim.
  sudo(['install', '-m', '0755', image, join(installation, 'next.AppImage')]);
  sudo(['mv', '-f', join(installation, 'next.AppImage'), installedImage]);
  const replaced = await launch(installedImage, 'tau-appimage-qualification');
  sudo(['apparmor_parser', '-R', profile]);
  profileLoaded = false;
  if (restricted) {
    refuse(installedImage);
  }
  assert.equal(
    await readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').catch(() => '0'),
    restriction,
  );
  console.log(
    JSON.stringify({
      test: 'AppImage scoped sandbox proof',
      status: 'passed',
      restricted,
      unrestricted,
      first,
      second,
      replaced,
      outsidePathRefused: restricted,
      removedProfileRefused: restricted,
      refusals,
      kernelDiagnostics: sudo(['journalctl', '-k', '-n', '120', '--no-pager']),
      publicReleaseQualification: false,
    }),
  );
} catch (error) {
  const audit = spawnSync('sudo', ['-n', 'journalctl', '-k', '-n', '120', '--no-pager'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  console.error('Disposable guest kernel diagnostics:', audit.stdout, audit.stderr);
  throw error;
} finally {
  if (profileLoaded) {
    sudo(['apparmor_parser', '-R', profile]);
  }
  if (profileWritten) {
    sudo(['rm', '--', profile]);
  }
  if (installed) {
    sudo(['rm', '-rf', '--', installation]);
  }
  await rm(root, { recursive: true, force: true });
}
