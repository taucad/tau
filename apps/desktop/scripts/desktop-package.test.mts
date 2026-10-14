#!/usr/bin/env node

/**
 * Purpose: Check the unsigned Linux/Windows package plans and the shared runtime platform packages without packaging.
 * Why: A wrong platform package, archive name or host check ships a package that silently loses a native engine.
 * Environment: Node.js 24+.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/desktop-package.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageWithOptions, statFile } from '@electron/asar';

/* oxlint-disable no-restricted-imports -- Operational scripts are outside the app's # source alias. */
import {
  desktopArchiveCommand,
  desktopPackageOmissions,
  desktopPackagePlans,
  parseDesktopPackageArguments,
} from './desktop-package-target.mjs';
import {
  desktopManifestFields,
  desktopPackageChannel,
  runtimeAsarOptions,
  runtimePlatformPackages,
} from './runtime-stage.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

/* Target selection: exactly one supported target, on its own host. */
assert.deepEqual(parseDesktopPackageArguments(['--platform', 'linux-x64'], 'linux-x64'), {
  plan: desktopPackagePlans['linux-x64'],
  archive: false,
});
assert.deepEqual(parseDesktopPackageArguments(['--platform', 'win32-x64', '--archive'], 'win32-x64'), {
  plan: desktopPackagePlans['win32-x64'],
  archive: true,
});
for (const arguments_ of [
  [],
  ['--platform'],
  ['--platform', 'darwin-arm64'],
  ['--platform', 'linux-arm64'],
  ['--platform', 'linux-x64', '--zip'],
  ['--platform', 'linux-x64', '--archive', '--archive'],
  ['--archive', '--platform', 'linux-x64'],
  ['--target', 'linux-x64'],
]) {
  assert.throws(() => parseDesktopPackageArguments(arguments_, 'linux-x64'), {
    name: 'TypeError',
    message: 'Usage: package-desktop.mts --platform linux-x64|win32-x64 [--archive]',
  });
}
assert.throws(() => parseDesktopPackageArguments(['--platform', 'win32-x64'], 'linux-x64'), {
  message: 'The win32-x64 package is assembled on a win32-x64 host; this host is linux-x64.',
});
console.log('✓ the package target is one supported platform, built on its own host; only --archive archives');

/* Plans: archive names CI uploads, the Windows icon main loads, and the esbuild binary left out of the ASAR. */
assert.deepEqual(
  Object.values(desktopPackagePlans).map(({ target, platform, arch, appDirectory, archive }) => ({
    target,
    platform,
    arch,
    appDirectory,
    archive,
  })),
  [
    {
      target: 'linux-x64',
      platform: 'linux',
      arch: 'x64',
      appDirectory: 'Tau-linux-x64',
      archive: { name: 'Tau-linux-x64.tar.gz', format: 'tar.gz' },
    },
    {
      target: 'win32-x64',
      platform: 'win32',
      arch: 'x64',
      appDirectory: 'Tau-win32-x64',
      archive: { name: 'Tau-win32-x64.zip', format: 'zip' },
    },
  ],
);
assert.equal(desktopPackagePlans['win32-x64'].icon, 'icon.ico');
assert.ok(desktopPackagePlans['win32-x64'].branding.includes('icon.ico'), 'main loads branding/icon.ico on Windows');
console.log('✓ each plan names its archive and icon');

/* ASAR matches absolute filenames: hidden checkout ancestors must not hide spawned payloads. */
const fixtureParent = fileURLToPath(new URL('../../../out/test-results/desktop-package/', import.meta.url));
await mkdir(fixtureParent, { recursive: true });
const fixtureRoot = await mkdtemp(join(fixtureParent, '.hidden-checkout-'));
try {
  const source = join(fixtureRoot, 'stage');
  const archive = join(fixtureRoot, 'app.asar');
  const unpacked = [
    'node_modules/native/addon.node',
    'node_modules/native/engine.dll',
    'node_modules/@esbuild/darwin-arm64/bin/esbuild',
    'node_modules/@esbuild/win32-x64/esbuild.exe',
    'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
    'node_modules/@agentclientprotocol/codex-acp/node_modules/dependency/index.js',
    'node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
    'node_modules/@gltf-transform/functions/node_modules/ndarray-pixels/node_modules/sharp/node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
  ];
  await Promise.all(
    [...unpacked, 'app.js'].map(async (file) => {
      const path = join(source, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, 'fixture');
    }),
  );
  await createPackageWithOptions(source, archive, runtimeAsarOptions);
  for (const file of unpacked) {
    const entry = statFile(archive, file);
    assert.ok('unpacked' in entry && entry.unpacked, `${file} must exist outside the archive`);
    assert.equal(readFileSync(join(`${archive}.unpacked`, file), 'utf8'), 'fixture');
  }
  assert.ok(!('unpacked' in statFile(archive, 'app.js')), 'ordinary JavaScript remains packed');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
console.log('✓ native binaries and spawned adapters stay unpacked beneath hidden checkout directories');

/* Omissions: GeoSpec native and PicoGK are always named; git only when it is absent. */
const linux = desktopPackagePlans['linux-x64'];
const windows = desktopPackagePlans['win32-x64'];
const withGit = desktopPackageOmissions(linux, { git: true, gitResourceRoot: '/r/git/linux-x64' });
assert.ok(withGit.some((line) => line.startsWith('GeoSpec native engine')));
assert.ok(withGit.some((line) => line.startsWith('PicoGK C# worker')));
assert.ok(!withGit.some((line) => line.startsWith('git payload')));
assert.ok(
  desktopPackageOmissions(linux, { git: false, gitResourceRoot: '/r/git/linux-x64' }).includes(
    "git payload: none at /r/git/linux-x64; this package records with the machine's own git and git-lfs.",
  ),
);
assert.ok(
  desktopPackageOmissions(windows, { git: false, gitResourceRoot: 'C:\\r\\git\\win32-x64' }).some((line) =>
    line.startsWith('git payload: prepare-git builds git from kernel.org source'),
  ),
);
assert.equal(linux.gitPayloadSupported, true);
assert.equal(windows.gitPayloadSupported, false);
console.log('✓ every payload a target leaves out is named');

/* Archives: GNU/bsd tar on Linux; the inbox bsdtar on Windows, which writes ZIP. */
assert.deepEqual(desktopArchiveCommand(linux, '/out', undefined), {
  command: 'tar',
  arguments: ['-czf', join('/out', 'Tau-linux-x64.tar.gz'), '-C', '/out', 'Tau-linux-x64'],
});
assert.deepEqual(desktopArchiveCommand(windows, '/out', String.raw`D:\Windows`), {
  command: String.raw`D:\Windows\System32\tar.exe`,
  arguments: ['-a', '-c', '-f', join('/out', 'Tau-win32-x64.zip'), '-C', '/out', 'Tau-win32-x64'],
});
assert.equal(desktopArchiveCommand(windows, '/out', undefined).command, String.raw`C:\Windows\System32\tar.exe`);
console.log('✓ archives are written by tar, and on Windows by its inbox bsdtar');

/* Runtime platform packages: each name is one its engine declares as an optional dependency. */
assert.deepEqual(Object.keys(runtimePlatformPackages).sort(), ['darwin-arm64', 'linux-x64', 'win32-x64']);
assert.deepEqual(runtimePlatformPackages['darwin-arm64'], {
  openrscadEngine: '@taulabs/openrscad-engine-darwin-arm64',
  esbuild: '@esbuild/darwin-arm64',
  libassimp: 'libassimp-darwin-arm64',
  nanoraster: 'nanoraster-darwin-arm64',
  bundledOptionalDependencies: [
    '@img/sharp-libvips-darwin-arm64',
    '@img/sharp-darwin-arm64',
    '@parcel/watcher-darwin-arm64',
  ],
  unusedSandboxHelpers: ['vendor/seccomp', 'vendor/srt-win'],
});
for (const [target, packages] of Object.entries(runtimePlatformPackages)) {
  const [platform, arch] = target.split('-') as [string, string];
  for (const name of [packages.openrscadEngine, packages.esbuild, packages.libassimp, packages.nanoraster]) {
    assert.ok(name.includes(`${platform}-${arch}`), `${name} is a ${target} package`);
  }
  assert.ok(packages.bundledOptionalDependencies.includes(`@img/sharp-${target}`), `${target} stages sharp's addon`);
  assert.ok(
    packages.bundledOptionalDependencies.some((name) => name.startsWith(`@parcel/watcher-${target}`)),
    `${target} stages the file watcher's addon`,
  );
}
console.log('✓ each target stages its own native platform packages');

/* Sandbox helpers: a target keeps only the one it executes, for its own architecture. */
const sandboxHelpers = ['vendor/seccomp/arm64', 'vendor/seccomp/x64', 'vendor/srt-win/arm64', 'vendor/srt-win/x64'];
const keptSandboxHelpers = (target: keyof typeof runtimePlatformPackages): string[] =>
  sandboxHelpers.filter(
    (helper) =>
      !runtimePlatformPackages[target].unusedSandboxHelpers.some(
        (unused) => helper === unused || helper.startsWith(`${unused}/`),
      ),
  );
assert.deepEqual(keptSandboxHelpers('darwin-arm64'), []);
assert.deepEqual(keptSandboxHelpers('linux-x64'), ['vendor/seccomp/x64']);
assert.deepEqual(keptSandboxHelpers('win32-x64'), ['vendor/srt-win/x64']);
console.log('✓ macOS stages no sandbox helper; Linux keeps x64 apply-seccomp and Windows x64 srt-win');

/* The licence gate precedes every archive the script writes. */
const packageSource = readFileSync(new URL('package-desktop.mts', import.meta.url), 'utf8');
const licenceGate = packageSource.indexOf('if (writesArchive) {');
assert.ok(licenceGate > 0);
assert.ok(
  packageSource.slice(licenceGate).startsWith(`if (writesArchive) {
  execFileSync(process.execPath, [resolve(workspaceRoot, 'packages/plugins/tscircuit/check-vendored-licenses.mjs')],`),
);
assert.ok(licenceGate < packageSource.indexOf('await packager('));
assert.ok(licenceGate < packageSource.indexOf('desktopArchiveCommand(plan'));
console.log('✓ the vendored-licence gate runs before packaging whenever an archive is written');

/* TAU_DESKTOP_CHANNEL selects the channel main reads from the staged manifest. */
assert.equal(desktopPackageChannel(undefined), 'production');
assert.equal(desktopPackageChannel(' '), 'production');
assert.equal(desktopPackageChannel('production'), 'production');
assert.equal(desktopPackageChannel('staging'), 'staging');
assert.throws(() => desktopPackageChannel('beta'), /production or staging/u);
assert.deepEqual(desktopManifestFields({ environmentOverrides: false, channel: 'production' }), {});
assert.deepEqual(desktopManifestFields({ environmentOverrides: true, channel: 'production' }), {
  tauDesktop: { environmentOverrides: true },
});
assert.deepEqual(desktopManifestFields({ environmentOverrides: false, channel: 'staging' }), {
  tauDesktop: { channel: 'staging' },
});
console.log('✓ a staging package records its channel and a production release records nothing');
