#!/usr/bin/env node
/** Purpose: Exercise Mac driver guards and exact ZIP/DMG byte admission without installing or signing an app. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Native driver tests use the actual byte-admission API. */
import {
  isMacZipEntryInsideApp,
  macosQualificationPackageSchema,
  createMacosQualificationDriver,
  verifyMacosQualificationArtifact,
} from './qualification-macos.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
import type { MacosCleanHost } from './qualification-evidence.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
  // Packaging's `ditto --sequesterRsrc` AppleDouble members are admitted only when they mirror Tau.app.
  for (const entry of [
    'Tau.app/',
    'Tau.app/Contents/MacOS/Tau',
    '__MACOSX/',
    '__MACOSX/Tau.app/',
    '__MACOSX/Tau.app/Contents/Resources/ui/client/textures/',
    '__MACOSX/Tau.app/Contents/Resources/ui/client/textures/._matcap-soft.png',
  ]) {
    assert.equal(isMacZipEntryInsideApp(entry), true, entry);
  }
  for (const entry of [
    '',
    'Other.app/Contents/MacOS/Other',
    'Tau.app/../escape',
    'Tau.app/./Contents',
    '__MACOSX/Other.app/._x',
    '__MACOSX/Tau.app/Contents/MacOS/Tau',
    '__MACOSX/Tau.app/../._x',
    '__MACOSX/._Tau.app',
    '__MACOSXevil/Tau.app/._x',
  ]) {
    assert.equal(isMacZipEntryInsideApp(entry), false, entry);
  }
  // Exact desktopManifestFields production contract omits channel and false environmentOverrides.
  const packageMetadata = {
    version: '1.0.1',
    tauDesktop: { sourceCommit: 'a'.repeat(40), releaseTag: 'desktop@0.1.0' },
  };
  assert.equal(macosQualificationPackageSchema.parse(packageMetadata).tauDesktop.channel, 'production');
  assert.equal(
    macosQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'staging' },
    }).tauDesktop.channel,
    'staging',
  );
  assert.throws(() => {
    macosQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, environmentOverrides: true },
    });
  });
  assert.throws(() => {
    macosQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'unknown' },
    });
  });

  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-mac-admission-')));
  const originalGuard = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  try {
    assert.throws(
      () =>
        createMacosQualificationDriver({
          mode: 'fixture',
          installationPath: join(root, 'Tau.app'),
          architecture: 'arm64',
          teamId: 'AAAAAAAAAA',
          installFormat: 'zip',
        }),
      QualificationUnavailable,
    );
    const bytes = Buffer.from('explicit inert fixture; never mounted or executed');
    const artifacts = (['zip', 'dmg'] as const).map((format) => ({
      target: 'darwin-arm64',
      kind: `macos-${format}`,
      name: `Tau-macos-arm64.${format}`,
      format,
      roles: format === 'zip' ? ['archive', 'update'] : ['installer'],
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sha512: createHash('sha512').update(bytes).digest('base64'),
    }));
    await Promise.all(
      artifacts.map(async (artifact) => {
        await writeFile(join(root, artifact.name), bytes);
      }),
    );
    const manifest = parseDesktopArtifactManifest({
      schemaVersion: 1,
      tag: 'desktop-staging@0.1.0-staging.1',
      channel: 'staging',
      version: '1.0.1',
      sourceCommit: 'a'.repeat(40),
      artifacts,
    });
    for (const format of ['zip', 'dmg'] as const) {
      const candidate = {
        manifest,
        artifactDirectory: root,
        route: format === 'zip' ? 'macos-zip' : 'macos-dmg',
      } as const;
      const path = join(root, `Tau-macos-arm64.${format}`);
      // oxlint-disable-next-line no-await-in-loop -- Mutate and validate each independent archive sequentially.
      assert.equal(await verifyMacosQualificationArtifact(candidate, 'arm64', format), path);
      // oxlint-disable-next-line no-await-in-loop -- Each refusal precedes the next fixture mutation.
      await assert.rejects(verifyMacosQualificationArtifact(candidate, 'x64', format), /Missing Mac/u);
      // oxlint-disable-next-line no-await-in-loop -- Preserve causal fixture mutation order.
      await writeFile(path, Buffer.alloc(bytes.length, 1));
      // oxlint-disable-next-line no-await-in-loop -- Observe same-size tampering before restoring the fixture.
      await assert.rejects(verifyMacosQualificationArtifact(candidate, 'arm64', format), /bytes differ/u);
      // oxlint-disable-next-line no-await-in-loop -- Restore only this artifact for the later symlink refusal.
      await writeFile(path, bytes);
    }
    const path = join(root, 'Tau-macos-arm64.zip');
    await rm(path);
    await symlink(join(root, 'Tau-macos-arm64.dmg'), path);
    await assert.rejects(
      verifyMacosQualificationArtifact({ manifest, artifactDirectory: root, route: 'macos-zip' }, 'arm64', 'zip'),
      /canonical regular/u,
    );
    if (process.platform === 'darwin') {
      // Clean-host mode admits only a release run into /Applications/Tau.app on an observed SIP/Gatekeeper-enabled native host.
      process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] = '1';
      const architecture = process.arch === 'arm64' ? 'arm64' : 'x64';
      const host: MacosCleanHost = {
        runner: 'fixture',
        productVersion: '26.0.1',
        machine: architecture === 'arm64' ? 'arm64' : 'x86_64',
        arm64: architecture === 'arm64' ? '1' : 'absent',
        translated: '0',
        sip: 'System Integrity Protection status: enabled.',
        gatekeeper: 'assessments enabled',
        existing: [],
      };
      const cleanHost = (change: Partial<MacosCleanHost> = {}) => ({
        host: { ...host, ...change },
        origin: 'https://127.0.0.1:4443',
        directory: root,
        download: async () => {
          throw new Error('fixture never downloads');
        },
      });
      const clean = (mode: 'release' | 'fixture', installationPath: string, change?: Partial<MacosCleanHost>) => () =>
        createMacosQualificationDriver({
          mode,
          installationPath,
          architecture,
          teamId: 'AAAAAAAAAA',
          installFormat: 'dmg',
          cleanHost: cleanHost(change),
        });
      assert.equal(typeof clean('release', '/Applications/Tau.app')().launch, 'function');
      assert.throws(clean('fixture', '/Applications/Tau.app'), /release candidate/u);
      assert.throws(clean('release', join(root, 'Tau.app')), /release candidate/u);
      assert.throws(
        clean('release', '/Applications/Tau.app', { sip: 'System Integrity Protection status: disabled.' }),
        /System Integrity/u,
      );
      assert.throws(clean('release', '/Applications/Tau.app', { gatekeeper: 'assessments disabled' }), /Gatekeeper/u);
      assert.throws(clean('release', '/Applications/Tau.app', { translated: '1' }), /native architecture/u);
      assert.throws(clean('release', '/Applications/Tau.app', { existing: ['/Applications/Tau.app'] }), /already has/u);
      delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
    }
    console.log(
      'PASS Mac ZIP/DMG artifact byte admission, clean-host admission and host/architecture/path guards; no native app qualification claimed',
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
