#!/usr/bin/env node

/**
 * Purpose: Assemble an unsigned Tau desktop package and its distribution archive for Linux x64 or Windows x64.
 * Why: CI publishes development builds for every desktop platform; only macOS is signed and notarized.
 * Environment: the matching host (no cross-builds): ubuntu-24.04 for linux-x64, windows-2025 for win32-x64;
 * built desktop/UI artifacts; network access for Electron Packager's Electron download;
 * optional TAU_DESKTOP_PACKAGE_OUTPUT_ROOT (default apps/desktop/package-out); optional TAU_DESKTOP_CHANNEL
 * (production, the default, or staging).
 * Payloads: no native kernel closure ships; the app downloads each one the first time a model needs it (desktop
 * first-use download blueprint, DS-1). git ships on linux-x64 when prepare-git has built it, and a linux-x64
 * --archive (a release) refuses to assemble without an executable git and git-lfs; it never ships on win32-x64
 * (prepare-git compiles kernel.org source, which is not how git ships on Windows). The Terminal's git store guard
 * (`tau-store-guard`, `sandbox:build:store-guard`) ships on linux-x64, and a linux-x64 --archive refuses to assemble
 * without it, since the APT package and the AppImage are built from that archive. PicoGK
 * and the GeoSpec native engine ship on darwin-arm64 only: the desktop enables PicoGK there alone, its voxel
 * natives are built on Darwin arm64 only, and the GeoSpec native assembly is produced for darwin-arm64 only.
 * Each omission is printed before packaging.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/package-desktop.mts --platform linux-x64|win32-x64
 *   [--archive]
 * Output: <output root>/Tau-<target>/ (the unpacked app); with --archive, after the vendored-licence gate,
 * <output root>/Tau-linux-x64.tar.gz or <output root>/Tau-win32-x64.zip.
 * Exit codes: 0 on an assembled app (and archive); non-zero on a wrong host, missing artifacts, a held licence, or a
 * linux-x64 archive without an executable bundled git and git-lfs, or without the store guard.
 */

import { execFileSync } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { access, cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packager } from '@electron/packager';

/* oxlint-disable no-restricted-imports -- Operational scripts are outside the app's # source alias. */
import {
  desktopArchiveCommand,
  desktopGitPayloadRefusal,
  desktopStoreGuardRefusal,
  desktopPackageOmissions,
  parseDesktopPackageArguments,
} from './desktop-package-target.mjs';
import { gitPayloadExecutables } from './git-payload.mjs';
import { copyTree } from '@taucad/nx/runtime-closure';
import {
  desktopManifestFields,
  desktopPackageChannel,
  desktopPackageVersion,
  excludesBuildDiagnostics,
  resolveRuntimePackages,
  runtimeAsarOptions,
  stageNativePackageFiles,
  stageRuntimePackages,
} from './runtime-stage.mjs';
/* oxlint-enable no-restricted-imports -- End operational script import exception. */

const { plan, archive: writesArchive } = parseDesktopPackageArguments(
  process.argv.slice(2),
  `${process.platform}-${process.arch}`,
);
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const outputRoot = resolve(process.env['TAU_DESKTOP_PACKAGE_OUTPUT_ROOT'] ?? resolve(desktopRoot, 'package-out'));
if ([resolve('/'), homedir(), tmpdir(), desktopRoot, workspaceRoot].includes(outputRoot)) {
  throw new Error(`Refusing unsafe package output root: ${outputRoot}`);
}
// Local unarchived packages remain development-only; every distribution archive is held.
if (writesArchive) {
  execFileSync(process.execPath, [resolve(workspaceRoot, 'packages/plugins/tscircuit/check-vendored-licenses.mjs')], {
    stdio: 'inherit',
  });
}

const stageRoot = resolve(outputRoot, 'stage');
const uiClientRoot = resolve(workspaceRoot, 'apps/ui/desktop/build/client');
const gitResourceRoot = resolve(desktopRoot, 'resources/git', plan.target);
/* GPL-2.0 §3(a): the exact source the payload was built from travels with it (`prepare-git.mts`). */
const gitSourceRoot = resolve(desktopRoot, 'resources/git/SOURCES');
const shipsGit = plan.gitPayloadSupported && existsSync(gitResourceRoot);
/* A distribution archive is a release: it ships the payload as macOS does, with both binaries executable. */
const gitRefusal = desktopGitPayloadRefusal(plan, writesArchive, {
  ...(await gitPayloadExecutables(resolve(desktopRoot, 'resources/git'), plan.target)),
  gitResourceRoot,
});
if (gitRefusal !== undefined) {
  throw new Error(gitRefusal);
}
if (shipsGit && !existsSync(gitSourceRoot)) {
  throw new Error(`The git payload ships with its source; ${gitSourceRoot} is missing. Run prepare-git again.`);
}
/* The Linux Terminal's git store guard (blueprint LP8): APT and AppImage are built from this archive. */
const storeGuardRoot = resolve(desktopRoot, 'resources/store-guard', plan.target);
/* A regular file with the access asked for: a directory passes `X_OK` too. */
const storeGuardFile = async (name: string, mode: number): Promise<boolean> => {
  const path = resolve(storeGuardRoot, name);
  const status = await stat(path).catch(() => undefined);
  return (
    status?.isFile() === true &&
    (await access(path, mode).then(
      () => true,
      () => false,
    ))
  );
};
const storeGuard = {
  executable: await storeGuardFile('tau-store-guard', constants.X_OK),
  notice: await storeGuardFile('NOTICE', constants.R_OK),
  storeGuardRoot,
};
const storeGuardRefusal = desktopStoreGuardRefusal(plan, writesArchive, storeGuard);
if (storeGuardRefusal !== undefined) {
  throw new Error(storeGuardRefusal);
}
const shipsStoreGuard = plan.storeGuard && storeGuard.executable && storeGuard.notice;
console.log(`Tau ${plan.target} leaves out:`);
for (const omission of desktopPackageOmissions(plan, {
  git: shipsGit,
  gitResourceRoot,
  storeGuard: shipsStoreGuard,
  storeGuardRoot,
})) {
  console.log(`  - ${omission}`);
}

const readJson = async <Value extends NonNullable<unknown>>(path: string): Promise<Value> =>
  JSON.parse(await readFile(path, 'utf8')) as Value;

/* Every runtime package is resolved before the previous output is removed. */
const runtimePackages = await resolveRuntimePackages({ desktopRoot, workspaceRoot, target: plan.target });
const metadata = await readJson<{ readonly version: string }>(resolve(desktopRoot, 'package.json'));
const electron = await readJson<{ readonly version: string }>(
  resolve(desktopRoot, 'node_modules/electron/package.json'),
);

await rm(outputRoot, { recursive: true, force: true });
await stageRuntimePackages({
  desktopRoot,
  stageRoot,
  packages: runtimePackages,
  manifestFields: desktopManifestFields({
    environmentOverrides: false,
    channel: desktopPackageChannel(process.env['TAU_DESKTOP_CHANNEL']),
  }),
});

const packagePaths = await packager({
  dir: stageRoot,
  out: outputRoot,
  overwrite: true,
  platform: plan.platform,
  arch: plan.arch,
  name: 'Tau',
  appVersion: desktopPackageVersion(metadata.version),
  buildVersion: desktopPackageVersion(metadata.version),
  electronVersion: electron.version,
  ...(plan.icon === undefined ? {} : { icon: resolve(desktopRoot, 'resources', plan.icon) }),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Windows version-resource field names.
  win32metadata: { CompanyName: 'Tau', FileDescription: 'Tau', ProductName: 'Tau', InternalName: 'Tau' },
  asar: runtimeAsarOptions,
  prune: false,
});
if (packagePaths.length !== 1 || resolve(packagePaths[0]!) !== resolve(outputRoot, plan.appDirectory)) {
  throw new Error(`Expected one app at ${resolve(outputRoot, plan.appDirectory)}, received ${packagePaths.join(', ')}`);
}
const appRoot = resolve(outputRoot, plan.appDirectory);
const resources = resolve(appRoot, 'resources');
await mkdir(resolve(resources, 'branding'), { recursive: true });
await Promise.all([
  copyTree(uiClientRoot, resolve(resources, 'ui/client'), excludesBuildDiagnostics),
  stageNativePackageFiles(resources),
  ...plan.branding.map(async (name) =>
    cp(resolve(desktopRoot, 'resources', name), resolve(resources, 'branding', name)),
  ),
  ...(shipsGit
    ? [
        copyTree(gitResourceRoot, resolve(resources, 'git', plan.target)),
        copyTree(gitSourceRoot, resolve(resources, 'git/SOURCES')),
      ]
    : []),
  ...(shipsStoreGuard ? [copyTree(storeGuardRoot, resolve(resources, 'store-guard', plan.target))] : []),
]);
await rm(stageRoot, { recursive: true, force: true });

console.log(`Unsigned Tau: ${appRoot}`);
if (writesArchive) {
  const archive = desktopArchiveCommand(plan, outputRoot, process.env['SystemRoot']);
  execFileSync(archive.command, [...archive.arguments], { stdio: 'inherit' });
  const archivePath = resolve(outputRoot, plan.archive.name);
  const { size } = await stat(archivePath);
  console.log(`Distribution archive: ${archivePath} (${(size / 1024 / 1024).toFixed(0)} MiB)`);
} else {
  console.log('No distribution archive; pass --archive to write one.');
}
