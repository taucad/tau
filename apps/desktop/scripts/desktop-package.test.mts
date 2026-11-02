#!/usr/bin/env node

/**
 * Purpose: Check the unsigned Linux/Windows package plans and the shared runtime platform packages without packaging.
 * Why: A wrong platform package, archive name or host check ships a package that silently loses a native engine.
 * Environment: Node.js 24+.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/desktop-package.test.mts
 * Exit codes: 0 when every check passes; non-zero on regression.
 */

import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  keepsNodePtyPath,
  markNodePtySpawnHelperExecutable,
  nodePtySpawnHelper,
  packagePathPayloads,
  runtimeAsarOptions,
  runtimePlatformPackages,
  stageNativePackageFiles,
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

/* The ASAR unpack-directory glob is a union, and every group is load-bearing: `@agentclientprotocol` adapters are
 * spawned from disk, `@img` carries libvips, `node-pty` carries the Terminal addon and the `spawn-helper` its fork
 * path runs from `app.asar.unpacked`, and the sandbox runtime's vendored `seccomp` and `java-proxy-agent` payloads
 * are containment-relevant. Pin each entry so a later edit cannot silently drop one. */
const unpackedPackageDirectories = [
  '@agentclientprotocol',
  '@img',
  'node-pty',
  '@anthropic-ai/sandbox-runtime/vendor/{seccomp,java-proxy-agent}',
];
assert.equal(runtimeAsarOptions.unpackDir, `**/node_modules/{${unpackedPackageDirectories.join(',')}}`);
assert.equal(runtimeAsarOptions.unpack, '{*.node,*.dll,esbuild,esbuild.exe}');
console.log('✓ the ASAR unpack globs keep every spawned adapter, libvips, node-pty and sandbox-runtime vendor payload');

/* ASAR matches absolute filenames: hidden checkout ancestors must not hide spawned payloads. */
const fixtureParent = fileURLToPath(new URL('../../../out/test-results/desktop-package/', import.meta.url));
await mkdir(fixtureParent, { recursive: true });
const fixtureRoot = await mkdtemp(join(fixtureParent, '.hidden-checkout-'));
try {
  const source = join(fixtureRoot, 'stage');
  const archive = join(fixtureRoot, 'app.asar');
  const unpacked = [
    'node_modules/native/addon.node',
    'node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/x64/apply-seccomp',
    'node_modules/@anthropic-ai/sandbox-runtime/vendor/java-proxy-agent/srt-proxy-agent.jar',
    'node_modules/native/engine.dll',
    'node_modules/@esbuild/darwin-arm64/bin/esbuild',
    'node_modules/@esbuild/win32-x64/esbuild.exe',
    'node_modules/@agentclientprotocol/codex-acp/dist/index.js',
    'node_modules/@agentclientprotocol/codex-acp/node_modules/dependency/index.js',
    'node_modules/@img/sharp-libvips-darwin-arm64/lib/libvips.dylib',
    /* The node-pty fork path runs `spawn-helper` from `app.asar.unpacked`. */
    'node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper',
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
    const entry = statFile(archive, join(file));
    assert.ok('unpacked' in entry && entry.unpacked, `${file} must exist outside the archive`);
    assert.equal(readFileSync(join(`${archive}.unpacked`, file), 'utf8'), 'fixture');
  }
  assert.ok(!('unpacked' in statFile(archive, 'app.js')), 'ordinary JavaScript remains packed');
  if (process.platform === 'linux') {
    const helper = `node_modules/@anthropic-ai/sandbox-runtime/vendor/seccomp/${process.arch}/apply-seccomp`;
    const dependency = dirname(dirname(fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime'))));
    await mkdir(dirname(join(source, helper)), { recursive: true });
    // A copy over the text placeholder retains its non-executable mode on Linux.
    await rm(join(source, helper), { force: true });
    await copyFile(join(dependency, 'vendor/seccomp', process.arch, 'apply-seccomp'), join(source, helper));
    const executableArchive = join(fixtureRoot, 'executable.asar');
    await createPackageWithOptions(source, executableArchive, runtimeAsarOptions);
    const executable = join(`${executableArchive}.unpacked`, helper);
    assert.doesNotThrow(() => {
      accessSync(executable, constants.X_OK);
    }, 'unpacked seccomp helper retains executable permission');
    assert.deepEqual(readFileSync(executable), readFileSync(join(source, helper)));
  }
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
console.log('✓ native binaries and spawned adapters stay unpacked beneath hidden checkout directories');

/* Omissions: GeoSpec native is always named; git only when it is absent; no kernel closure ships anywhere. */
const linux = desktopPackagePlans['linux-x64'];
const windows = desktopPackagePlans['win32-x64'];
const withGit = desktopPackageOmissions(linux, { git: true, gitResourceRoot: '/r/git/linux-x64' });
assert.ok(withGit.some((line) => line.startsWith('GeoSpec native engine')));
assert.ok(!withGit.some((line) => line.includes('PicoGK')));
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
assert.deepEqual(Object.keys(runtimePlatformPackages).sort(), ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);
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
  nodePtyNative: 'prebuilds/darwin-arm64',
});
for (const [target, packages] of Object.entries(runtimePlatformPackages)) {
  const [platform, arch] = target.split('-') as [string, string];
  for (const name of [packages.openrscadEngine, packages.esbuild, packages.libassimp, packages.nanoraster]) {
    if (name === undefined) {
      continue;
    }
    assert.ok(name.includes(`${platform}-${arch}`), `${name} is a ${target} package`);
  }
  assert.ok(packages.bundledOptionalDependencies.includes(`@img/sharp-${target}`), `${target} stages sharp's addon`);
  assert.ok(
    packages.bundledOptionalDependencies.some((name) => name.startsWith(`@parcel/watcher-${target}`)),
    `${target} stages the file watcher's addon`,
  );
}
const assimpManifest = JSON.parse(
  readFileSync(
    new URL('../../../packages/plugins/assimp/node_modules/libassimp/package.json', import.meta.url),
    'utf8',
  ),
) as { optionalDependencies: Record<string, string> };
for (const packages of Object.values(runtimePlatformPackages)) {
  if (packages.libassimp !== undefined) {
    assert.ok(
      assimpManifest.optionalDependencies[packages.libassimp],
      `${packages.libassimp} must be published by the pinned engine`,
    );
  }
}
assert.equal(runtimePlatformPackages['darwin-x64'].libassimp, undefined, 'Intel uses the staged Assimp WASM backend');
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

/* Node-pty: its runtime JavaScript everywhere, and only the target's own addon directory. */
const nodePtyPaths = [
  'package.json',
  'LICENSE',
  'lib/index.js',
  'lib/unixTerminal.js',
  'lib/unixTerminal.test.js',
  'lib/index.js.map',
  'src/unix/pty.cc',
  'deps/winpty/src/agent/Agent.cc',
  'third_party/conpty/1.23/win10-x64/conpty.dll',
  'build/Makefile',
  'build/Release/pty.node',
  'prebuilds/darwin-arm64/pty.node',
  'prebuilds/darwin-arm64/spawn-helper',
  'prebuilds/darwin-x64/pty.node',
  'prebuilds/win32-x64/pty.node',
  'prebuilds/win32-x64/pty.pdb',
];
const keptNodePty = (target: keyof typeof runtimePlatformPackages): string[] =>
  nodePtyPaths.filter((path) => keepsNodePtyPath(path, runtimePlatformPackages[target].nodePtyNative));
const nodePtyRuntime = ['package.json', 'LICENSE', 'lib/index.js', 'lib/unixTerminal.js'];
assert.deepEqual(keptNodePty('linux-x64'), [...nodePtyRuntime, 'build/Release/pty.node']);
assert.deepEqual(keptNodePty('darwin-arm64'), [
  ...nodePtyRuntime,
  'prebuilds/darwin-arm64/pty.node',
  'prebuilds/darwin-arm64/spawn-helper',
]);
assert.deepEqual(keptNodePty('darwin-x64'), [...nodePtyRuntime, 'prebuilds/darwin-x64/pty.node']);
assert.deepEqual(keptNodePty('win32-x64'), nodePtyRuntime);
/* The copy walks directories through the same predicate, so the addon's ancestors must be kept. */
assert.deepEqual(
  ['', 'lib', 'build', 'prebuilds'].map((directory) => keepsNodePtyPath(directory, 'build/Release')),
  [true, true, true, false],
);
assert.deepEqual(
  ['build', 'prebuilds'].map((directory) => keepsNodePtyPath(directory, 'prebuilds/darwin-arm64')),
  [false, true],
);
console.log('✓ node-pty ships its runtime and only the target addon, without sources, build tree or symbols');

/* The node-pty 1.1.0 package publishes `spawn-helper` mode 0644; the macOS fork path execs it, so staging must set the bit. */
assert.equal(
  nodePtySpawnHelper(runtimePlatformPackages['darwin-arm64'].nodePtyNative),
  'prebuilds/darwin-arm64/spawn-helper',
);
assert.equal(
  nodePtySpawnHelper(runtimePlatformPackages['darwin-x64'].nodePtyNative),
  'prebuilds/darwin-x64/spawn-helper',
);
assert.equal(nodePtySpawnHelper(runtimePlatformPackages['linux-x64'].nodePtyNative), undefined);
assert.equal(nodePtySpawnHelper(runtimePlatformPackages['win32-x64'].nodePtyNative), undefined);
{
  /* Stage a 0644 helper as node-pty publishes it, then check the bit staging sets. */
  const stagedPty = await mkdtemp(join(fixtureParent, 'node-pty-'));
  try {
    const native = runtimePlatformPackages['darwin-arm64'].nodePtyNative;
    const helper = join(stagedPty, 'prebuilds/darwin-arm64/spawn-helper');
    await mkdir(dirname(helper), { recursive: true });
    await writeFile(helper, 'fixture', { mode: 0o644 });
    await markNodePtySpawnHelperExecutable(stagedPty, native);
    assert.equal(statSync(helper).mode.toString(8).slice(-3), '755');
    await markNodePtySpawnHelperExecutable(stagedPty, runtimePlatformPackages['linux-x64'].nodePtyNative);
  } finally {
    await rm(stagedPty, { recursive: true, force: true });
  }
}
console.log('✓ the staged macOS node-pty spawn-helper is made executable');

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

/* Main prepares a kernel on first use from the package files the app ships, so every one must be staged. */
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const nativeResources = await mkdtemp(join(tmpdir(), 'tau-native-packages-'));
try {
  await stageNativePackageFiles(nativeResources);
  for (const name of ['build123d', 'smlibpy', 'picogk']) {
    const manifest: unknown = JSON.parse(
      readFileSync(join(workspaceRoot, `packages/plugins/${name}/tau-plugin.json`), 'utf8'),
    );
    for (const path of packagePathPayloads(manifest)) {
      assert.ok(
        statSync(join(nativeResources, 'native-packages', `@taucad/${name}`, path)).isFile(),
        `@taucad/${name} ${path} is staged`,
      );
    }
  }
  assert.ok(
    packagePathPayloads(
      JSON.parse(readFileSync(join(workspaceRoot, 'packages/plugins/build123d/tau-plugin.json'), 'utf8')),
    ).includes('python/worker.py'),
  );
} finally {
  await rm(nativeResources, { recursive: true, force: true });
}
console.log("✓ the app ships each native package's own payload files for first-use preparation");
