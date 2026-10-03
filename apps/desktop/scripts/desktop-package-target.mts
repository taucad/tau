/**
 * Purpose: Describe the unsigned Linux and Windows desktop packages: target, archive and payload omissions.
 * Why: `package-desktop.mts` stays a thin effectful shell, so the per-target decisions are checked without packaging.
 * Environment: Node.js 24+; no filesystem or network access.
 * Usage: import { parseDesktopPackageArguments } from './desktop-package-target.mts'
 * Exit codes: n/a (library module).
 */

import { join, win32 } from 'node:path';

/** A `<platform>-<arch>` the unsigned desktop package is assembled for, on a host of the same target. */
export type DesktopPackageTarget = 'linux-x64' | 'win32-x64';

/** Everything that differs between the Linux and Windows packages. */
export type DesktopPackagePlan = Readonly<{
  target: DesktopPackageTarget;
  platform: 'linux' | 'win32';
  arch: 'x64';
  /** The directory Electron Packager writes under the output root. */
  appDirectory: `Tau-${DesktopPackageTarget}`;
  /** The distribution archive written beside it. */
  archive: Readonly<{ name: string; format: 'tar.gz' | 'zip' }>;
  /** Electron Packager's executable icon, under `apps/desktop/resources`; Linux has none. */
  icon: string | undefined;
  /** Branding files main loads from `resources/branding` (`icon.ico` is the Windows window icon). */
  branding: readonly string[];
  /** Files left out of `app.asar` because they are spawned or loaded by the OS, not by Electron. */
  asarUnpack: string;
  /** Whether `prepare-git.mts` can build this target's git payload. */
  gitPayloadSupported: boolean;
}>;

export const desktopPackagePlans: Readonly<Record<DesktopPackageTarget, DesktopPackagePlan>> = {
  'linux-x64': {
    target: 'linux-x64',
    platform: 'linux',
    arch: 'x64',
    appDirectory: 'Tau-linux-x64',
    archive: { name: 'Tau-linux-x64.tar.gz', format: 'tar.gz' },
    icon: undefined,
    branding: ['icon.png', 'icon-dark.png'],
    asarUnpack: '**/{*.node,bin/esbuild,@agentclientprotocol/**,@img/**}',
    gitPayloadSupported: true,
  },
  'win32-x64': {
    target: 'win32-x64',
    platform: 'win32',
    arch: 'x64',
    appDirectory: 'Tau-win32-x64',
    archive: { name: 'Tau-win32-x64.zip', format: 'zip' },
    icon: 'icon.ico',
    branding: ['icon.png', 'icon-dark.png', 'icon.ico'],
    /* The Windows esbuild binary is `esbuild.exe` at its package root, and native addons load adjacent DLLs. */
    asarUnpack: '**/{*.node,*.dll,esbuild.exe,@agentclientprotocol/**,@img/**}',
    gitPayloadSupported: false,
  },
};

const usage = 'Usage: package-desktop.mts --platform linux-x64|win32-x64 [--archive]';

const isTarget = (value: string): value is DesktopPackageTarget => Object.hasOwn(desktopPackagePlans, value);

/**
 * Select the package plan from the command line, on a host that can build it.
 * @param arguments_ - `process.argv.slice(2)`.
 * @param host - `<process.platform>-<process.arch>` of the machine running the script.
 * @returns The plan for the requested target, and whether to write its distribution archive.
 * @throws TypeError for anything but `--platform <target> [--archive]`; Error when the host differs (no cross-builds).
 */
export const parseDesktopPackageArguments = (
  arguments_: readonly string[],
  host: string,
): Readonly<{ plan: DesktopPackagePlan; archive: boolean }> => {
  const [flag, target, ...rest] = arguments_;
  if (
    flag !== '--platform' ||
    target === undefined ||
    !isTarget(target) ||
    rest.length > 1 ||
    (rest.length === 1 && rest[0] !== '--archive')
  ) {
    throw new TypeError(usage);
  }
  if (host !== target) {
    throw new Error(`The ${target} package is assembled on a ${target} host; this host is ${host}.`);
  }
  // As with the macOS ZIP, a distribution archive is written only on request, behind the licence gate.
  return { plan: desktopPackagePlans[target], archive: rest.length === 1 };
};

/**
 * What this package leaves out, one line each, for the script to print.
 * @param plan - The selected package.
 * @param present - Whether a prepared git payload exists for the target.
 * @returns Human-readable omissions; never empty, since GeoSpec native and PicoGK ship on macOS only.
 */
export const desktopPackageOmissions = (
  plan: DesktopPackagePlan,
  present: Readonly<{ git: boolean; gitResourceRoot: string }>,
): readonly string[] => [
  'GeoSpec native engine (@taucad/geospec-engine-native): its native assembly and CI delivery are darwin-arm64 only, ' +
    'so the geometry utility (AP242 measurement, native GeoSpec checks) cannot start in this package.',
  'PicoGK C# worker (resources/picogk): the desktop enables the PicoGK kernel on darwin-arm64 only, ' +
    'and its voxel natives are built on Darwin arm64 only (upstream publishes no Linux natives).',
  ...(present.git
    ? []
    : [
        plan.gitPayloadSupported
          ? `git payload: none at ${present.gitResourceRoot}; this package records with the machine's own git and git-lfs.`
          : "git payload: prepare-git builds git from kernel.org source, which is not how git ships on Windows; this package records with the machine's own git and git-lfs.",
      ]),
];

/**
 * The command that writes the distribution archive from the packaged app directory.
 * @param plan - The selected package.
 * @param outputRoot - Directory holding `plan.appDirectory`; the archive is written there.
 * @param systemRoot - `%SystemRoot%` on Windows, where the inbox `tar.exe` (bsdtar, which writes ZIP) lives.
 * @returns The executable and its arguments.
 */
export const desktopArchiveCommand = (
  plan: DesktopPackagePlan,
  outputRoot: string,
  systemRoot: string | undefined,
): Readonly<{ command: string; arguments: readonly string[] }> => {
  const archive = join(outputRoot, plan.archive.name);
  if (plan.archive.format === 'tar.gz') {
    return { command: 'tar', arguments: ['-czf', archive, '-C', outputRoot, plan.appDirectory] };
  }
  /* By absolute path: Git Bash's GNU tar, often earlier on a runner's PATH, cannot write ZIP. */
  return {
    command: win32.join(systemRoot ?? String.raw`C:\Windows`, 'System32', 'tar.exe'),
    arguments: ['-a', '-c', '-f', archive, '-C', outputRoot, plan.appDirectory],
  };
};
