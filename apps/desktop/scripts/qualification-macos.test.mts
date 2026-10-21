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
  macosQualificationPackageSchema,
  createMacosQualificationDriver,
  verifyMacosQualificationArtifact,
} from './qualification-macos.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
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
    console.log(
      'PASS Mac ZIP/DMG artifact byte admission and host/architecture/path guards; no native app qualification claimed',
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
