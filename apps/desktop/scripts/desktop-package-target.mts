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
  /** Whether `prepare-git.mts` can build this target's git payload. */
  gitPayloadSupported: boolean;
  /** Whether the Terminal's git store guard (`libs/sandbox/store-guard`) ships for this target: Linux only. */
  storeGuard: boolean;
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
    gitPayloadSupported: true,
    storeGuard: true,
  },
  'win32-x64': {
    target: 'win32-x64',
    platform: 'win32',
    arch: 'x64',
    appDirectory: 'Tau-win32-x64',
    archive: { name: 'Tau-win32-x64.zip', format: 'zip' },
    icon: 'icon.ico',
    branding: ['icon.png', 'icon-dark.png', 'icon.ico'],
    gitPayloadSupported: false,
    storeGuard: false,
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
 * @param present - Whether a prepared git payload and store guard exist for the target.
 * @returns Human-readable omissions; never empty, since GeoSpec native ships on macOS only. No native kernel closure is an
 *   omission: no package ships one, and the app downloads each on first use where its manifest declares the host.
 */
export const desktopPackageOmissions = (
  plan: DesktopPackagePlan,
  present: Readonly<{ git: boolean; gitResourceRoot: string; storeGuard?: boolean; storeGuardRoot?: string }>,
): readonly string[] => [
  'GeoSpec native engine (geospec-engine): its npm package ships a native binding for darwin-arm64 only, ' +
    'so the geometry utility (AP242 measurement, native GeoSpec checks) cannot start in this package.',
  ...(present.git
    ? []
    : [
        plan.gitPayloadSupported
          ? `git payload: none at ${present.gitResourceRoot}; this package records with the machine's own git and git-lfs.`
          : "git payload: prepare-git builds git from kernel.org source, which is not how git ships on Windows; this package records with the machine's own git and git-lfs.",
      ]),
  ...(!plan.storeGuard || present.storeGuard === true
    ? []
    : [
        `store guard: none at ${present.storeGuardRoot ?? 'resources/store-guard'}; the Terminal opens each project's .git read-only.`,
      ]),
];

/**
 * Why this package may not be assembled, when a Linux distribution archive would ship without the store guard.
 *
 * Without `tau-store-guard` the Linux Terminal falls back to a read-only `.git` (blueprint OD2), so a release that left
 * it out would quietly take git writes away from every APT and AppImage install, which are both built from this
 * archive (blueprint LP8). A development package (no `--archive`) still assembles and names the omission.
 * @param plan - The selected package.
 * @param archive - Whether a distribution archive is written.
 * @param guard - Whether the staged guard is an executable file, and where it was looked for.
 * @returns The refusal, or `undefined` when the package may be assembled.
 */
export const desktopStoreGuardRefusal = (
  plan: DesktopPackagePlan,
  archive: boolean,
  guard: Readonly<{ executable: boolean; notice: boolean; storeGuardRoot: string }>,
): string | undefined => {
  if (!archive || !plan.storeGuard || (guard.executable && guard.notice)) {
    return undefined;
  }
  const missing = [guard.executable ? [] : ['tau-store-guard'], guard.notice ? [] : ['NOTICE']].flat().join(' and ');
  return `A ${plan.target} release package must ship the Terminal's store guard; ${missing} missing at ${guard.storeGuardRoot}. Run sandbox:build:store-guard with --resources first.`;
};

/**
 * Why this package may not be assembled, when a distribution archive would ship without the git payload.
 *
 * A shipped app records revisions with the binaries it carries: a machine with no `git-lfs` on `PATH`, which is most of
 * them, cannot back a project up otherwise (OQ3). macOS refuses a release without the payload; this is the same rule
 * for the Linux distribution archive. A development package (no `--archive`) still assembles and names the omission,
 * and a target `prepare-git` cannot build (Windows) is never refused.
 * @param plan - The selected package.
 * @param archive - Whether a distribution archive is written.
 * @param payload - Whether the prepared `git` and `git-lfs` are executable files, and where they were looked for.
 * @returns The refusal, or `undefined` when the package may be assembled.
 */
export const desktopGitPayloadRefusal = (
  plan: DesktopPackagePlan,
  archive: boolean,
  payload: Readonly<{ git: boolean; gitLfs: boolean; gitResourceRoot: string }>,
): string | undefined => {
  if (!archive || !plan.gitPayloadSupported || (payload.git && payload.gitLfs)) {
    return undefined;
  }
  const missing = [payload.git ? [] : ['git'], payload.gitLfs ? [] : ['git-lfs']].flat().join(' and ');
  return `A ${plan.target} release package must ship an executable bundled git and git-lfs; ${missing} missing at ${payload.gitResourceRoot} (OQ3). Run prepare-git first.`;
};

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
