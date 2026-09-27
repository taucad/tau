/**
 * The desktop's `git` + `git-lfs` payload: what is pinned and where it lands (OQ3, X2).
 *
 * The pure half of `prepare-git.mts`, kept apart so the pins, the layout the
 * app resolves and the GPL-2.0 source copy are checked without a compile.
 * `git` is built from the upstream source tarball (there is no official macOS
 * binary) and `git-lfs` is the official release binary, placed in that git's
 * own exec path so `git lfs` resolves through the one executable
 * `bundledGitEnvironment` names.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** One platform's `git-lfs` release archive. */
export type GitLfsArchive = Readonly<{ name: string; sha256: string; url: string; format: 'zip' | 'tar.gz' }>;

export const gitVersion = '2.55.0';
/** From kernel.org's signed `sha256sums.asc`. */
export const gitSourceSha256 = '457fdb04dc8728e007d4688695e6912e6f680727920f2a40bf11eacc17505357';
export const gitSourceName = `git-${gitVersion}.tar.xz`;
export const gitSourceUrl = `https://www.kernel.org/pub/software/scm/git/${gitSourceName}`;

export const gitLfsVersion = '3.8.0';
/* The release archives carry no licence file (`RELEASE_INCLUDES` is README,
 * CHANGELOG and man), so the MIT text is read from the same tag, pinned. */
export const gitLfsLicenseUrl = `https://raw.githubusercontent.com/git-lfs/git-lfs/v${gitLfsVersion}/LICENSE.md`;
export const gitLfsLicenseSha256 = '4fae9062ab5cdd5fb15486b728534d8aded8b4ae9d84b6d66a956f5162c366b6';

const gitLfsArchive = (platform: string, format: GitLfsArchive['format'], sha256: string): GitLfsArchive => {
  const name = `git-lfs-${platform}-v${gitLfsVersion}.${format}`;
  return {
    name,
    sha256,
    url: `https://github.com/git-lfs/git-lfs/releases/download/v${gitLfsVersion}/${name}`,
    format,
  };
};

/**
 * Every target this script prepares, as the other `prepare-*.mts` scripts do.
 *
 * Hashes from git-lfs's signed `sha256sums.asc`. Windows is absent: no
 * `prepare-*` script covers it and git there is Git for Windows, not a build of
 * this tarball.
 */
export const gitTargets: Readonly<Record<string, Readonly<{ gitLfs: GitLfsArchive }>>> = {
  'darwin-arm64': {
    gitLfs: gitLfsArchive('darwin-arm64', 'zip', 'caff76a7d070d8160c89bc39b6e85d98f24135b6fed038a3b4de2590d25102d8'),
  },
  'linux-x64': {
    gitLfs: gitLfsArchive('linux-amd64', 'tar.gz', 'e455e00f15d9b95661b8d53498ffb0c3367962cf1ec73c31ab7369516cd6ab8d'),
  },
};

/**
 * The prefix `make install` writes under `DESTDIR`; a real one, so bindir and
 * sysconfdir stay relative to it and `RUNTIME_PREFIX` can relocate them.
 */
export const gitInstallPrefix = '/usr/local';

/**
 * `make` variables for a relocatable, minimal git.
 *
 * `RUNTIME_PREFIX` resolves the exec path, templates and system config relative
 * to the running binary, so the payload works wherever the app is installed.
 * Built-ins are not installed as dashed hardlinks (a copied hardlink is a full
 * copy per command), and the few dashed helpers left are relative symlinks.
 * HTTPS stays on through the system curl. MacPorts, Fink and Homebrew
 * (whose libiconv git 2.55 links on macOS 15+ when present) are never searched,
 * so the build machine's package managers cannot leak into the payload.
 */
export const gitMakeVariables = [
  `prefix=${gitInstallPrefix}`,
  'RUNTIME_PREFIX=YesPlease',
  'NO_GETTEXT=YesPlease',
  'NO_TCLTK=YesPlease',
  'NO_PERL=YesPlease',
  'NO_PYTHON=YesPlease',
  'NO_EXPAT=YesPlease',
  'NO_INSTALL_HARDLINKS=YesPlease',
  'INSTALL_SYMLINKS=YesPlease',
  'SKIP_DASHED_BUILT_INS=YesPlease',
  'NO_DARWIN_PORTS=YesPlease',
  'NO_FINK=YesPlease',
  'NO_HOMEBREW=YesPlease',
  'CURL_CONFIG=/usr/bin/curl-config',
] as const;

/** The oldest macOS the payload runs on: the Quick Look extensions' `MACOSX_DEPLOYMENT_TARGET`. */
export const gitMacosDeploymentTarget = '13.0';

/**
 * The libraries an `otool -L` listing names outside the OS.
 *
 * A payload binary may link only what every Mac has: `/usr/lib` and
 * `/System`. Anything else (`/opt/homebrew`, `/usr/local`, `@rpath`) is
 * absent on a clean machine.
 *
 * @param otoolOutput - `otool -L` output for one or more files.
 * @returns Each foreign library path, once.
 */
export const foreignLibraries = (otoolOutput: string): string[] => [
  ...new Set(
    otoolOutput
      .split('\n')
      /* Library lines are indented; file and architecture headers are not. */
      .filter((line) => /^\s/u.test(line) && line.trim() !== '')
      .map((line) => line.trim().replace(/\s+\(compatibility version .*\)$/u, ''))
      .filter((path) => !path.startsWith('/usr/lib/') && !path.startsWith('/System/')),
  ),
];

/** What the payload was built from and what it holds: the up-to-date check's record. */
export type GitPayloadManifest = Readonly<{
  schemaVersion: 1;
  target: string;
  gitVersion: string;
  gitSourceSha256: string;
  gitLfsVersion: string;
  gitLfsArchiveSha256: string | undefined;
  makeVariables: readonly string[];
  macosDeploymentTarget: string;
  gitSha256: string;
  gitLfsSha256: string;
  probed?: Readonly<{ git: string; gitLfs: string }>;
}>;

/**
 * The manifest for one target's payload, built from the current pins.
 *
 * @param built - The target and the installed binaries' digests (plus the probe, when writing).
 * @returns The manifest.
 */
export const gitPayloadManifest = (
  built: Readonly<{
    target: string;
    gitSha256: string;
    gitLfsSha256: string;
    probed?: Readonly<{ git: string; gitLfs: string }>;
  }>,
): GitPayloadManifest => ({
  schemaVersion: 1,
  target: built.target,
  gitVersion,
  gitSourceSha256,
  gitLfsVersion,
  gitLfsArchiveSha256: gitTargets[built.target]?.gitLfs.sha256,
  makeVariables: gitMakeVariables,
  macosDeploymentTarget: gitMacosDeploymentTarget,
  gitSha256: built.gitSha256,
  gitLfsSha256: built.gitLfsSha256,
  ...(built.probed === undefined ? {} : { probed: built.probed }),
});

/**
 * Whether a manifest read back from disk describes the payload the current pins would build.
 *
 * @param manifest - The parsed manifest file.
 * @param current - The target and the installed binaries' digests now.
 * @returns `true` when nothing needs rebuilding.
 */
export const gitPayloadManifestIsCurrent = (
  manifest: unknown,
  current: Parameters<typeof gitPayloadManifest>[0],
): boolean => {
  if (typeof manifest !== 'object' || manifest === null) {
    return false;
  }
  /* The probe is a record of the build, not a pin. */
  const recorded = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== 'probed'));
  return JSON.stringify(recorded) === JSON.stringify(gitPayloadManifest(current));
};

/**
 * Where each part of one target's payload lives under `resources/git`.
 *
 * `git` is the path `bundledGitEnvironment` resolves; `gitLfs` is in that git's
 * exec path. The source tarball sits beside every target, once (GPL-2.0 §3(a)).
 *
 * @param resourceRoot - `apps/desktop/resources/git`, or a packaged app's `Resources/git`.
 * @param target - `<platform>-<arch>`.
 * @returns The payload's paths.
 */
export const gitPayloadLayout = (
  resourceRoot: string,
  target: string,
): Readonly<{
  root: string;
  git: string;
  gitLfs: string;
  manifest: string;
  notice: string;
  gitCopying: string;
  gitLfsLicense: string;
  source: string;
}> => {
  const root = join(resourceRoot, target);
  return {
    root,
    git: join(root, 'bin', 'git'),
    gitLfs: join(root, 'libexec', 'git-core', 'git-lfs'),
    manifest: join(root, 'tau-runtime-manifest.json'),
    notice: join(root, 'NOTICE'),
    gitCopying: join(root, 'git-COPYING'),
    gitLfsLicense: join(root, 'git-lfs-LICENSE.md'),
    source: join(resourceRoot, 'SOURCES', gitSourceName),
  };
};

/** The NOTICE that travels with the binaries. */
export const gitPayloadNotice = `This directory carries two programs Tau runs as separate executables.

Git ${gitVersion} — GNU General Public License, version 2 (git-COPYING).
Built unmodified from ${gitSourceName} (sha256 ${gitSourceSha256}); that exact
corresponding source is distributed with this application at ../SOURCES/${gitSourceName}.

Git LFS ${gitLfsVersion} — MIT License (git-lfs-LICENSE.md), the official release binary.
`;

/**
 * SHA-256 of one file.
 *
 * @param path - The file.
 * @returns Its lowercase hex digest.
 */
export const sha256Of = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

/**
 * Copy the exact source tarball the payload was built from beside it.
 *
 * Refuses a tarball that is not the pinned one, so the shipped source can only
 * ever be the source of the shipped binary.
 *
 * @param archive - The downloaded tarball.
 * @param destination - Where it lands (`gitPayloadLayout(...).source`).
 * @param expectedSha256 - The pin.
 */
export const copyGitSource = async (archive: string, destination: string, expectedSha256: string): Promise<void> => {
  if ((await sha256Of(archive)) !== expectedSha256) {
    throw new Error(`${archive} is not the pinned git source (sha256 ${expectedSha256})`);
  }
  if ((await sha256Of(destination).catch(() => undefined)) === expectedSha256) {
    return;
  }
  await mkdir(join(destination, '..'), { recursive: true });
  const temporary = `${destination}.${String(process.pid)}.tmp`;
  await copyFile(archive, temporary);
  await rm(destination, { force: true });
  await rename(temporary, destination);
};
