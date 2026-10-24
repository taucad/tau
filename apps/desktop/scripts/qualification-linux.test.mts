#!/usr/bin/env node
/** Purpose: Exercise Linux stable-image install/observation/removal with an explicit inert extraction fixture, never release receipts. */
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackage } from '@electron/asar';
import { desktopArtifactName, parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Exercise real driver filesystem behavior with explicit diagnostic trust. */
import {
  linuxQualificationPackageSchema,
  aptQualificationPayloadHashes,
  createLinuxAppImageQualificationDriver,
  waitForScheduledAptCompletion,
} from './qualification-linux.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
  // Exact desktopManifestFields production contract omits channel and false environmentOverrides.
  const packageMetadata = {
    version: '1.0.1',
    tauDesktop: { sourceCommit: 'a'.repeat(40), releaseTag: 'desktop@0.1.0' },
  };
  assert.equal(linuxQualificationPackageSchema.parse(packageMetadata).tauDesktop.channel, 'production');
  assert.equal(
    linuxQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'staging' },
    }).tauDesktop.channel,
    'staging',
  );
  assert.throws(() => {
    linuxQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, environmentOverrides: true },
    });
  });
  assert.throws(() => {
    linuxQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'unknown' },
    });
  });

  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-linux-driver-')));
  const originalGuard = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  try {
    await assert.rejects(
      waitForScheduledAptCompletion(async () => ({ selected: true, inactive: false }), 10, 1),
      /before deadline/u,
    );
    await assert.rejects(
      waitForScheduledAptCompletion(async () => ({ selected: false, inactive: true }), 10, 1),
      /before deadline/u,
    );
    await waitForScheduledAptCompletion(async () => ({ selected: true, inactive: true }), 100, 1);
    const installed = join(root, 'Tau.AppImage');
    assert.throws(
      () => createLinuxAppImageQualificationDriver({ mode: 'fixture', installationPath: installed }),
      QualificationUnavailable,
    );
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      console.log('PASS host refusal; native fixture requires Linux x64 and was not run');
      return;
    }
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = '1';
    const source = join(root, 'source');
    const image = join(root, 'fixture-app');
    await mkdir(source);
    await mkdir(join(image, 'resources'), { recursive: true });
    const identity = {
      tag: 'desktop-staging@0.1.0-staging.1',
      channel: 'staging',
      version: '1.0.1',
      sourceCommit: 'a'.repeat(40),
    };
    await writeFile(
      join(source, 'package.json'),
      JSON.stringify({
        version: identity.version,
        tauDesktop: { channel: identity.channel, sourceCommit: identity.sourceCommit },
      }),
    );
    await createPackage(source, join(image, 'resources/app.asar'));
    await writeFile(
      join(image, 'resources/desktop-installation.json'),
      JSON.stringify({
        schemaVersion: 1,
        ...identity,
        route: 'linux-appimage',
        arch: 'x64',
        trust: 'test',
        cache: 'tau-staging-updater',
        keys: {},
      }),
    );
    await writeFile(join(image, 'Tau'), 'inert fixture executable');
    const name = 'Tau-linux-x64.AppImage';
    // This shell is a diagnostic extraction fixture, never claimed to be a FUSE/AppImage runtime.
    const extractor = `#!/bin/sh\n[ "$1" = --appimage-extract ] || exit 1\ncp -R '${image}' squashfs-root\n`;
    await writeFile(join(root, name), extractor, { mode: 0o755 });
    const data = await readFile(join(root, name));
    const manifest = parseDesktopArtifactManifest({
      schemaVersion: 1,
      ...identity,
      artifacts: [
        {
          target: 'linux-x64',
          kind: 'linux-appimage',
          name,
          format: 'AppImage',
          roles: ['installer', 'update'],
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
          sha512: createHash('sha512').update(data).digest('base64'),
        },
      ],
    });
    const candidate = { manifest, artifactDirectory: root, route: 'linux-appimage' } as const;
    const driver = createLinuxAppImageQualificationDriver({ mode: 'fixture', installationPath: installed });
    const observed = await driver.install(candidate);
    assert.equal(observed.installationPath, installed);
    assert.equal(observed.executablePath, installed);
    assert.equal(observed.sourceCommit, identity.sourceCommit);
    assert.equal(observed.artifactSha256, manifest.artifacts[0]!.sha256);
    assert.equal(
      observed.asarSha256,
      createHash('sha256')
        .update(await readFile(join(image, 'resources/app.asar')))
        .digest('hex'),
    );
    await assert.rejects(driver.install(candidate), /Initial AppImage/u);
    await assert.rejects(
      driver.measureSecurity({ mainPid: process.pid, rendererPids: [], nativeChildPids: [] }),
      QualificationUnavailable,
    );
    await writeFile(installed, 'tamper');
    await assert.rejects(driver.observe(candidate), /bytes differ/u);
    await writeFile(installed, data);
    const profile = join(root, 'project.json');
    await writeFile(profile, 'preserved');
    const retained = [{ path: profile, sha256: createHash('sha256').update('preserved').digest('hex') }];
    await assert.rejects(driver.reinstall(candidate, retained), /own completed removal/u);
    await driver.remove(retained);
    assert.equal(await readFile(profile, 'utf8'), 'preserved');
    await assert.rejects(readFile(installed), { code: 'ENOENT' });
    await assert.rejects(
      driver.reinstall({ ...candidate, manifest: { ...manifest, sourceCommit: 'b'.repeat(40) } }, retained),
      /exact last observed candidate/u,
    );
    assert.deepEqual(await driver.reinstall(candidate, retained), observed);
    assert.equal(await readFile(profile, 'utf8'), 'preserved');
    await driver.remove(retained);
    const stage = join(root, 'deb-stage');
    await mkdir(join(stage, 'DEBIAN'), { recursive: true });
    await writeFile(
      join(stage, 'DEBIAN/control'),
      `Package: tau-staging-runtime-${identity.version}\nVersion: ${identity.version}\nArchitecture: amd64\nMaintainer: Fixture <fixture@example.invalid>\nDescription: Inert qualification payload\n`,
    );
    const generation = join(stage, 'opt/tau-staging/releases', identity.version);
    await mkdir(generation, { recursive: true });
    await cp(image, generation, { recursive: true });
    const debName = desktopArtifactName({
      kind: 'linux-deb-runtime',
      channel: 'staging',
      version: identity.version,
      arch: 'x64',
    });
    const built = spawnSync('dpkg-deb', ['--build', stage, join(root, debName)], { encoding: 'utf8' });
    assert.equal(built.status, 0, built.stderr);
    const deb = await readFile(join(root, debName));
    const aptManifest = parseDesktopArtifactManifest({
      ...manifest,
      artifacts: (['linux-deb-runtime', 'linux-deb-selector'] as const).map((kind) => ({
        kind,
        target: 'linux-x64',
        format: 'deb',
        roles: kind === 'linux-deb-runtime' ? ['runtime', 'repository'] : ['installer', 'repository'],
        name: desktopArtifactName({ kind, channel: 'staging', version: identity.version, arch: 'x64' }),
        size: deb.length,
        sha256: createHash('sha256').update(deb).digest('hex'),
        sha512: createHash('sha512').update(deb).digest('base64'),
      })),
    });
    const aptCandidate = { manifest: aptManifest, artifactDirectory: root, route: 'linux-apt' } as const;
    assert.deepEqual(await aptQualificationPayloadHashes(aptCandidate), {
      executableSha256: createHash('sha256')
        .update(await readFile(join(image, 'Tau')))
        .digest('hex'),
      asarSha256: observed.asarSha256,
    });
    await writeFile(join(root, debName), 'tampered runtime');
    await assert.rejects(aptQualificationPayloadHashes(aptCandidate), /artifact bytes differ/u);
    console.log(
      'PASS Linux diagnostic driver initial-copy identity, stable outer binding, tamper refusal, no repeated install and data retention; genuine AppImage/security/scheduler qualification not claimed',
    );
  } finally {
    if (originalGuard === undefined) {
      delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
    } else {
      process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = originalGuard;
    }
    await rm(root, { recursive: true, force: true });
  }
};
try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
