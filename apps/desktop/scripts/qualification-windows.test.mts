#!/usr/bin/env node
/** Purpose: Exercise Windows driver execution guards and real artifact-byte admission without granting installer authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Native driver admission tests use actual fixture bytes. */
import {
  windowsQualificationPackageSchema,
  admitWindowsConsumerDestination,
  createWindowsQualificationDriver,
  verifyWindowsQualificationArtifact,
  removeWindowsUninstallerRemainder,
  readWindowsConsumerResponse,
} from './qualification-windows.mjs';
import { createQualificationReinstallGuard, QualificationUnavailable } from './qualification-platform-types.mjs';
import {
  assertWindowsConsumerHost,
  assertWindowsConsumerManual,
  windowsConsumerHostDigest,
} from './qualification-evidence.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
  const consumer = {
    runner: 'stock-windows',
    identity: 'a'.repeat(64),
    osVersion: 'Microsoft Windows 11 Pro 10.0.26100',
    productType: 1,
    build: 26_100,
    nativeMachine: 34_404,
    processMachine: 0,
    elevated: 0,
    elevationType: 1,
    administrator: false,
    uacEnabled: 1,
    defender: { service: true, antivirus: true, realTime: true, mode: 'Normal' },
    existing: [],
  };
  assert.deepEqual(assertWindowsConsumerHost(consumer), consumer);
  for (const change of [
    { nativeMachine: 43_620 },
    { processMachine: 34_404 },
    { elevationType: 3 },
    { elevationType: 2 },
    { administrator: true },
    { elevated: 1 },
    { productType: 3 },
    { build: 19_045 },
    { osVersion: 'Microsoft Windows Server 2025' },
    { uacEnabled: 0 },
    { uacEnabled: null },
    { defender: null },
    { defender: { ...consumer.defender, realTime: false } },
    { defender: { ...consumer.defender, mode: 'Passive' } },
    { existing: ['prior-profile'] },
  ]) {
    assert.throws(() => assertWindowsConsumerHost({ ...consumer, ...change }));
  }
  const binding = {
    nonce: '123e4567-e89b-42d3-a456-426614174000',
    hostSha256: windowsConsumerHostDigest(consumer),
    stage: 'initial',
    artifactSha256: 'b'.repeat(64),
    requestedAt: 1000,
  } as const;
  const manual = {
    ...binding,
    observedAt: 1100,
    observer: 'operator',
    launchedFrom: 'explorer',
    defaultDestination: true,
    freshCapturesForRequest: true,
    smartScreen: { checkAppsAndFiles: 'enabled', result: 'not-shown', publisher: null },
    uac: 'not-shown',
    installer: 'completed',
    screenshots: [
      { kind: 'security-settings', name: 'security.png', capturedAt: 1050, sha256: 'c'.repeat(64), size: 10 },
      { kind: 'installer-result', name: 'installed.png', capturedAt: 1050, sha256: 'd'.repeat(64), size: 10 },
    ],
  };
  assert.deepEqual(assertWindowsConsumerManual(manual, binding, 'Publisher'), manual);
  for (const change of [
    { nonce: '123e4567-e89b-42d3-a456-426614174001' },
    { hostSha256: 'e'.repeat(64) },
    { stage: 'reinstall' },
    { artifactSha256: 'e'.repeat(64) },
    { observedAt: 999 },
    { screenshots: manual.screenshots.map((entry) => ({ ...entry, capturedAt: 999 })) },
    { freshCapturesForRequest: false },
    { defaultDestination: false },
    { screenshots: [] },
    { installer: 'unknown' },
    { uac: 'credentials-requested' },
    { smartScreen: { ...manual.smartScreen, checkAppsAndFiles: 'unknown' } },
    { smartScreen: { ...manual.smartScreen, result: 'blocked' } },
    { smartScreen: { ...manual.smartScreen, result: 'warning-approved', publisher: 'Other' } },
  ]) {
    assert.throws(() => assertWindowsConsumerManual({ ...manual, ...change }, binding, 'Publisher'));
  }
  // Exact desktopManifestFields production contract omits channel and false environmentOverrides.
  const packageMetadata = {
    version: '1.0.1',
    tauDesktop: { sourceCommit: 'a'.repeat(40), releaseTag: 'desktop@0.1.0' },
  };
  assert.equal(windowsQualificationPackageSchema.parse(packageMetadata).tauDesktop.channel, 'production');
  assert.equal(
    windowsQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'staging' },
    }).tauDesktop.channel,
    'staging',
  );
  assert.throws(() => {
    windowsQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, environmentOverrides: true },
    });
  });
  assert.throws(() => {
    windowsQualificationPackageSchema.parse({
      ...packageMetadata,
      tauDesktop: { ...packageMetadata.tauDesktop, channel: 'unknown' },
    });
  });

  const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-windows-admission-')));
  const originalGuard = process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  delete process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'];
  try {
    const installationPath = join(root, 'removed-installation');
    const uninstaller = 'Uninstall Tau Staging.exe';
    const remainder = Buffer.from('inert owned uninstaller');
    const cleanup = { installationPath, uninstaller, sha256: createHash('sha256').update(remainder).digest('hex') };
    await removeWindowsUninstallerRemainder(cleanup);
    await mkdir(installationPath);
    await writeFile(join(installationPath, uninstaller), remainder);
    const retainedProfile = join(root, 'retained-profile');
    await writeFile(retainedProfile, 'preserved user bytes');
    /* oxlint-disable no-await-in-loop -- Mutate and inspect the same installation fixture in lifecycle order. */
    for (const name of ['Tau.exe', 'unexpected-project']) {
      await writeFile(join(installationPath, name), 'never delete');
      await assert.rejects(removeWindowsUninstallerRemainder(cleanup), /unexpected installation contents/u);
      assert.equal(await readFile(join(installationPath, name), 'utf8'), 'never delete');
      assert.deepEqual(await readFile(join(installationPath, uninstaller)), remainder);
      await rm(join(installationPath, name));
    }
    /* oxlint-enable no-await-in-loop */
    await writeFile(join(installationPath, uninstaller), 'changed');
    await assert.rejects(removeWindowsUninstallerRemainder(cleanup), /remainder bytes changed/u);
    await writeFile(join(installationPath, uninstaller), remainder);
    await removeWindowsUninstallerRemainder(cleanup);
    await removeWindowsUninstallerRemainder(cleanup);
    assert.equal(await readFile(retainedProfile, 'utf8'), 'preserved user bytes');
    await assert.rejects(readFile(join(installationPath, uninstaller)), { code: 'ENOENT' });
    await mkdir(installationPath);
    await removeWindowsUninstallerRemainder(cleanup);
    await symlink(root, installationPath, 'junction');
    await assert.rejects(removeWindowsUninstallerRemainder(cleanup), /path redirects/u);
    await rm(installationPath);
    if (process.platform !== 'win32') {
      await mkdir(installationPath);
      await symlink(retainedProfile, join(installationPath, uninstaller));
      await assert.rejects(removeWindowsUninstallerRemainder(cleanup), /canonical regular file/u);
      assert.equal(await readFile(retainedProfile, 'utf8'), 'preserved user bytes');
      await rm(installationPath, { recursive: true });
    }
    const responsePath = join(root, 'response.json');
    /* oxlint-disable no-await-in-loop -- Exercise successive writes to the same operator response path. */
    for (const partial of [undefined, '{"nonce":']) {
      if (partial !== undefined) {
        await writeFile(responsePath, partial);
      }
      const pending = readWindowsConsumerResponse(responsePath, Date.now() + 5000);
      const writer = (async () => {
        await wait(25);
        await writeFile(responsePath, JSON.stringify(manual));
      })();
      try {
        assert.deepEqual(assertWindowsConsumerManual(await pending, binding, 'Publisher'), manual);
      } finally {
        await writer;
      }
    }
    /* oxlint-enable no-await-in-loop */
    await writeFile(responsePath, JSON.stringify({ ...manual, nonce: '123e4567-e89b-42d3-a456-426614174001' }));
    const wrongBinding = await readWindowsConsumerResponse(responsePath, Date.now() + 5000);
    assert.throws(() => assertWindowsConsumerManual(wrongBinding, binding, 'Publisher'));
    await writeFile(responsePath, '{}');
    assert.deepEqual(await readWindowsConsumerResponse(responsePath, Date.now() + 5000), {});
    await writeFile(responsePath, '{');
    await assert.rejects(readWindowsConsumerResponse(responsePath, Date.now() + 20), /deadline expired/u);
    await rm(responsePath);
    await assert.rejects(readWindowsConsumerResponse(responsePath, Date.now() + 20), /deadline expired/u);
    await mkdir(responsePath);
    await assert.rejects(
      readWindowsConsumerResponse(responsePath, Date.now() + 5000),
      (error: unknown) =>
        error instanceof Error && 'code' in error && ['EISDIR', 'EPERM', 'EACCES'].includes(String(error.code)),
    );
    const programs = join(root, 'missing-programs');
    assert.equal(await admitWindowsConsumerDestination(programs, false), join(programs, 'tau-desktop'));
    await assert.rejects(admitWindowsConsumerDestination(programs, true), /retained installer/u);
    await mkdir(join(programs, 'tau-desktop'), { recursive: true });
    await assert.rejects(admitWindowsConsumerDestination(programs, false), /destination exists/u);
    await symlink(programs, join(root, 'redirect'), 'dir');
    await rm(join(programs, 'tau-desktop'), { recursive: true });
    await assert.rejects(admitWindowsConsumerDestination(join(root, 'redirect'), false), /parent redirects/u);
    assert.throws(
      () => createWindowsQualificationDriver({ mode: 'fixture', installationPath: join(root, 'installed') }),
      QualificationUnavailable,
    );
    const bytes = Buffer.from('explicit inert fixture, never executed');
    const name = 'Tau-win32-x64.exe';
    const path = join(root, name);
    await writeFile(path, bytes);
    const manifest = parseDesktopArtifactManifest({
      schemaVersion: 1,
      tag: 'desktop-staging@0.1.0-staging.1',
      channel: 'staging',
      version: '1.0.1',
      sourceCommit: 'a'.repeat(40),
      artifacts: [
        {
          target: 'win32-x64',
          kind: 'windows-nsis',
          name,
          format: 'exe',
          roles: ['installer', 'update'],
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          sha512: createHash('sha512').update(bytes).digest('base64'),
        },
      ],
    });
    const candidate = { manifest, artifactDirectory: root, route: 'windows-nsis' } as const;
    const lifecycle = createQualificationReinstallGuard();
    const retained = [{ path: 'project', sha256: 'a'.repeat(64) }];
    assert.throws(() => {
      lifecycle.admit(candidate, retained);
    }, /own completed removal/u);
    lifecycle.installed();
    lifecycle.observed(candidate);
    assert.throws(() => {
      lifecycle.admit(candidate, retained);
    }, /own completed removal/u);
    lifecycle.removed(retained);
    assert.throws(() => {
      lifecycle.admit({ ...candidate, manifest: { ...manifest, sourceCommit: 'b'.repeat(40) } }, retained);
    }, /exact last observed candidate/u);
    assert.throws(() => {
      lifecycle.admit(candidate, []);
    }, /preserved files/u);
    lifecycle.admit(candidate, retained);
    assert.throws(() => {
      lifecycle.admit(candidate, retained);
    }, /own completed removal/u);
    assert.equal(await verifyWindowsQualificationArtifact(candidate), path);
    await writeFile(path, Buffer.alloc(bytes.length, 1));
    await assert.rejects(verifyWindowsQualificationArtifact(candidate), /bytes differ/u);
    await writeFile(path, bytes.subarray(1));
    await assert.rejects(verifyWindowsQualificationArtifact(candidate), /bytes differ/u);
    await assert.rejects(
      verifyWindowsQualificationArtifact({ ...candidate, route: 'linux-appimage' }),
      /Wrong Windows/u,
    );
    if (process.platform !== 'win32') {
      const target = join(root, 'elsewhere');
      await writeFile(target, bytes);
      await rm(path);
      await symlink(target, path);
      await assert.rejects(verifyWindowsQualificationArtifact(candidate), /canonical regular/u);
    }
    console.log(
      'PASS Windows driver guard and real installer-byte tamper/route/path refusal; native install/security execution remains a separate qualification',
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
