#!/usr/bin/env node
/**
 * Purpose: Build and inspect a tiny AppImage with the real pinned maker and test-only public key.
 * Environment: Linux x64 and the builder tool downloads; no signing service or publication.
 * Usage: pnpm nx run desktop:test-appimage-package
 * Exit: nonzero on changed input, incorrect embedded trust or sandbox-disabling launcher.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createPackage } from '@electron/asar';
// oxlint-disable-next-line no-restricted-imports -- Exercise the real managed package producer.
import { buildLinuxAptPackages } from './linux-apt-package.mjs';

const main = async (): Promise<void> => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('AppImage assembly acceptance requires Linux x64');
  }
  const desktopRoot = resolve(import.meta.dirname, '..');
  const root = resolve(
    desktopRoot,
    '../../out/research/desktop-release-signing-pipeline/implementation-2026-10-21/appimage',
  );
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(join(root, 'maker-'));
  const input = join(fixture, 'input');
  const source = join(fixture, 'source');
  await mkdir(join(input, 'resources'), { recursive: true });
  await mkdir(source);
  await mkdir(join(input, 'resources/branding'));
  await copyFile(join(desktopRoot, 'resources/icon.png'), join(input, 'resources/branding/icon.png'));
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'tau-fixture',
      version: '0.1.0',
      tauDesktop: {
        channel: 'production',
        sourceCommit: 'a'.repeat(40),
        environmentOverrides: false,
      },
    }),
  );
  await createPackage(source, join(input, 'resources/app.asar'));
  await writeFile(join(input, 'Tau'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  const inputBytes = await readFile(join(input, 'resources/app.asar'));
  const keyFile = join(fixture, 'keys.json');
  const { publicKey } = generateKeyPairSync('ed25519');
  await writeFile(keyFile, JSON.stringify({ fixture: publicKey.export({ type: 'spki', format: 'pem' }) }));
  const output = join(fixture, 'output');
  const maker = process.env['TAU_APPIMAGE_MAKER_TEST_FILE'] ?? join(import.meta.dirname, 'package-appimage.mts');
  const env = {
    ...process.env,
    ...Object.fromEntries([
      ['TAU_APPIMAGE_APP_DIR', input],
      ['DESKTOP_RELEASE_TAG', 'desktop@0.1.0'],
      ['TAU_DESKTOP_SOURCE_SHA', 'a'.repeat(40)],
      ['TAU_APPIMAGE_PUBLIC_KEYS_FILE', keyFile],
      ['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT', output],
    ]),
  };
  const built = spawnSync(process.execPath, [...process.execArgv, maker, '--test-trust'], {
    env,
    encoding: 'utf8',
    timeout: 240_000,
  });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  assert.deepEqual(await readFile(join(input, 'resources/app.asar')), inputBytes);
  const appDirectory = join(output, 'verification/squashfs-root');
  const image = join(output, 'Tau-linux-x64.AppImage');
  const packages = await buildLinuxAptPackages({
    appDirectory,
    appImagePath: image,
    outputDirectory: join(fixture, 'managed'),
    tag: 'desktop@0.1.0',
    sourceCommit: 'a'.repeat(40),
    maintainer: 'Test <test@example.invalid>',
  });
  const runtime = join(fixture, 'runtime');
  const selector = join(fixture, 'selector');
  execFileSync('dpkg-deb', ['--extract', packages[0]!, runtime]);
  execFileSync('dpkg-deb', ['--extract', packages[1]!, selector]);
  assert.deepEqual(
    await readFile(join(runtime, 'opt/tau-appimage/releases/0.1.0/Tau.AppImage')),
    await readFile(image),
  );
  assert.deepEqual(
    await readFile(join(runtime, 'opt/tau-appimage/releases/0.1.0/resources/desktop-installation.json')),
    await readFile(join(appDirectory, 'resources/desktop-installation.json')),
  );
  assert.match(
    await readFile(join(selector, 'etc/apparmor.d/tau-appimage'), 'utf8'),
    /\/opt\/tau-appimage\/releases\/\*\/Tau\.AppImage/u,
  );
  assert.match(
    execFileSync('dpkg-deb', ['--field', packages[1]!, 'Depends'], { encoding: 'utf8' }),
    /tau-appimage-runtime-0\.1\.0 \(= 0\.1\.0\)/u,
  );
  assert.match(
    await readFile(join(selector, 'usr/share/applications/tau-appimage.desktop'), 'utf8'),
    /x-scheme-handler\/tau;/u,
  );
  const launcher = join(appDirectory, 'AppRun');
  await chmod(launcher, 0o755);
  const launched = spawnSync(launcher, ['space argument', '--fixture'], {
    env: { ...process.env, ...Object.fromEntries([['APPDIR', appDirectory]]) },
    encoding: 'utf8',
  });
  assert.equal(launched.status, 0, launched.stderr);
  assert.equal(launched.stdout, 'space argument\n--fixture\n');
  if (process.env['TAU_QUALIFICATION_DISPOSABLE_VM'] === '1') {
    assert.ok(!process.env['APPIMAGE_EXTRACT_AND_RUN'], 'Native mount proof must not extract-and-run');
    const entries = await readdir(output);
    const images = entries.filter((name) => name.endsWith('.AppImage'));
    assert.equal(images.length, 1);
    const mounted = spawnSync(join(output, images[0]!), ['space argument', '--fixture'], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.ifError(mounted.error);
    assert.equal(mounted.status, 0, mounted.stderr);
    assert.equal(mounted.stdout, 'space argument\n--fixture\n');
    console.log('PASS native FUSE AppImage mount and launcher arguments; no Electron sandbox claim');
  }
  const assembly: unknown = JSON.parse(await readFile(join(output, 'appimage-assembly.json'), 'utf8'));
  assert.ok(typeof assembly === 'object' && assembly !== null && 'trust' in assembly && assembly.trust === 'test');
  const wrongSource = spawnSync(process.execPath, [...process.execArgv, maker, '--test-trust'], {
    env: { ...env, ...Object.fromEntries([['TAU_DESKTOP_SOURCE_SHA', 'b'.repeat(40)]]) },
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.notEqual(wrongSource.status, 0);
  assert.match(wrongSource.stderr, /source or release hardening disagrees/u);
  console.log(
    'PASS real AppImage assembly, extracted launcher arguments/sandbox, input identity preservation and mismatch refusal',
  );
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
