#!/usr/bin/env node
/**
 * Purpose: Exercise actual Debian generation packages with dpkg and APT in a disposable Linux container.
 * Environment: Linux root container, dpkg-deb/apt; /opt/tau-staging mounted as a 1 MiB tmpfs for ENOSPC.
 * Usage: pnpm nx run desktop:test-linux-apt-package
 * Exit: nonzero on selector, retention, disk accounting or failed-install recovery regressions.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// oxlint-disable-next-line no-restricted-imports -- Exercise the real package producer.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';

assert.equal(process.platform, 'linux', 'Run only in a disposable Linux container');
assert.equal(process.getuid?.(), 0, 'Disposable container root is required');
assert.equal(process.env['TAU_APT_DISPOSABLE_CONTAINER'], '1', 'Explicit disposable-container guard is required');
const root = await mkdtemp('/tmp/tau-apt-test-');
const command = (name: string, args: string[]): string => execFileSync(name, args, { encoding: 'utf8' });
command('dpkg', ['--add-architecture', 'amd64']);
// Dependency stand-ins make package lifecycle tests independent of a GUI image/network.
// They never qualify Tau execution, sandboxing, or stock-distro compatibility.
const provider = join(root, 'provider');
await mkdir(join(provider, 'DEBIAN'), { recursive: true });
await writeFile(
  join(provider, 'DEBIAN/control'),
  `Package: tau-test-system-dependencies\nVersion: 999\nArchitecture: amd64\nMaintainer: Test <test@example.invalid>\nDescription: Inert dependency stand-ins for isolated package lifecycle tests\nProvides: libc6 (= 999), libgtk-3-0, libnss3, libasound2t64, libgbm1, libdrm2, libx11-6, libxcomposite1, libxdamage1, libxrandr2, libxkbcommon0, libsecret-1-0, libatk1.0-0, libatk-bridge2.0-0, libcups2, bubblewrap, xdg-utils, libfuse2t64, fuse3\n`,
);
command('dpkg-deb', ['--build', provider, join(root, 'provider.deb')]);
command('dpkg', ['-i', join(root, 'provider.deb')]);
const sourceCommit = 'a'.repeat(40);
const build = async (version: string, full = false) => {
  const app = join(root, `app-${version}`);
  await mkdir(join(app, 'resources/branding'), { recursive: true });
  await writeFile(join(app, 'resources/branding/icon.png'), 'test icon');
  await writeFile(
    join(app, 'Tau'),
    `#!/bin/sh\nif [ "\${1:-}" = wait ]; then touch "$3"; while [ ! -f "$2" ]; do sleep 0.05; done; fi\ncat "$(dirname "$0")/lazy-resource"\n`,
    { mode: 0o755 },
  );
  await writeFile(join(app, 'lazy-resource'), version);
  if (full) {
    await writeFile(join(app, 'too-large'), Buffer.alloc(2 * 1024 * 1024, 1));
  }
  return buildLinuxAptPackages({
    appDirectory: app,
    outputDirectory: join(root, `out-${version}`),
    tag: `desktop-staging@0.1.0-staging.${version.split('.')[2]}`,
    sourceCommit,
    maintainer: 'Test <test@example.invalid>',
  });
};
const first = await build('1.0.1');
command('dpkg', ['-i', ...first]);
assert.equal(command('/usr/bin/tau-staging', []), '1.0.1');
const active = spawn('/usr/bin/tau-staging', ['wait', join(root, 'release-reader'), join(root, 'reader-ready')], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
let activeOutput = '';
active.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
  activeOutput += new TextDecoder().decode(chunk);
});
const activeExit = new Promise<void>((resolve, reject) => {
  active.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`Active generation exited ${code}`));
    }
  });
  active.on('error', reject);
});
await new Promise<void>((resolve, reject) => {
  const deadline = Date.now() + 10_000;
  const poll = async (): Promise<void> => {
    try {
      await readFile(join(root, 'reader-ready'));
      resolve();
    } catch {
      if (Date.now() > deadline) {
        reject(new Error('A reader did not acknowledge startup'));
        return;
      }
      setTimeout(() => {
        void poll();
      }, 20);
    }
  };
  void poll();
});
const second = await build('1.0.2');
command('dpkg', ['-i', ...second]);
assert.equal(command('/usr/bin/tau-staging', []), '1.0.2');
await writeFile(join(root, 'release-reader'), 'B selected');
await activeExit;
assert.equal(activeOutput, '1.0.1', 'Running app resolves lazy resources from its original immutable generation');
command('apt-mark', ['auto', 'tau-staging-runtime-1.0.1']);
const retained = command('apt-config', ['dump']);
assert.match(retained, /tau-staging-runtime/u);
const removal = command('apt-get', ['--simulate', 'autoremove']);
assert.doesNotMatch(
  removal,
  /^Remv tau-staging-runtime-1\.0\.1/mu,
  'Real APT resolver must retain old automatic runtime',
);
for (const file of [...first, ...second]) {
  const size = Number(command('dpkg-deb', ['-f', file, 'Installed-Size']).trim());
  assert.ok(size > 0, 'Every package reports retained disk cost');
}
// Inert executable images exercise dpkg lifecycle; native FUSE/sandbox proof is a separate guest test.
const managed = async (sequence: number) => {
  const version = `1.0.${sequence}`;
  const app = join(root, `managed-source-${version}`);
  await mkdir(join(app, 'resources/branding'), { recursive: true });
  await writeFile(join(app, 'resources/branding/icon.png'), 'test icon');
  const tag = `desktop-staging@0.1.0-staging.${sequence}`;
  await writeFile(
    join(app, 'resources/desktop-installation.json'),
    JSON.stringify({
      schemaVersion: 1,
      route: 'linux-appimage',
      tag,
      channel: 'staging',
      version,
      sourceCommit,
      arch: 'x64',
      trust: 'test',
      cache: 'tau-staging-updater',
      keys: {},
    }),
  );
  const image = join(app, 'Tau.AppImage');
  await writeFile(image, `#!/bin/sh\nprintf '${version}'\n`, { mode: 0o755 });
  return buildLinuxAptPackages({
    appDirectory: app,
    appImagePath: image,
    outputDirectory: join(root, `managed-out-${version}`),
    tag,
    sourceCommit,
    maintainer: 'Test <test@example.invalid>',
  });
};
const managedA = await managed(10);
const managedB = await managed(11);
command('dpkg', ['-i', ...managedA]);
assert.equal(command('/usr/bin/tau-staging-appimage', []), '1.0.10');
const originalImage = await readFile('/opt/tau-staging-appimage/releases/1.0.10/Tau.AppImage');
command('dpkg', ['-i', ...managedB]);
assert.equal(command('/usr/bin/tau-staging-appimage', []), '1.0.11');
assert.deepEqual(await readFile('/opt/tau-staging-appimage/releases/1.0.10/Tau.AppImage'), originalImage);
command('apt-mark', ['auto', 'tau-staging-appimage-runtime-1.0.10']);
assert.doesNotMatch(command('apt-get', ['--simulate', 'autoremove']), /^Remv tau-staging-appimage-runtime-1\.0\.10/mu);
// Explicit administrator rollback reselects retained authenticated bytes; no application writes /opt.
command('dpkg', ['-i', ...managedA]);
assert.equal(command('/usr/bin/tau-staging-appimage', []), '1.0.10');
command('dpkg', ['--purge', 'tau-staging-appimage']);
assert.notEqual(spawnSync('test', ['-e', '/opt/tau-staging-appimage/current']).status, 0);
assert.notEqual(spawnSync('test', ['-e', '/etc/apparmor.d/tau-staging-appimage']).status, 0);
assert.deepEqual(await readFile('/opt/tau-staging-appimage/releases/1.0.10/Tau.AppImage'), originalImage);
command('dpkg', ['-i', ...managedB]);
assert.equal(command('/usr/bin/tau-staging-appimage', []), '1.0.11');
const third = await build('1.0.3', true);
const failed = spawnSync('dpkg', ['-i', ...third], { encoding: 'utf8' });
assert.notEqual(failed.status, 0, '1 MiB runtime filesystem must reject 2 MiB generation');
assert.match(failed.stderr, /No space left on device/u);
assert.equal(await readlink('/opt/tau-staging/current'), 'releases/1.0.2');
assert.equal(command('/usr/bin/tau-staging', []), '1.0.2');
assert.equal(await readFile('/opt/tau-staging/releases/1.0.1/lazy-resource', 'utf8'), '1.0.1');
console.log(
  'APT lifecycle passed: exact dependency, active lazy-resource safety, selector switching, real autoremove retention, Installed-Size and ENOSPC recovery',
);
