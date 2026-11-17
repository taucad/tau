/**
 * The desktop's `git` + `git-lfs` payload: what is pinned and where it lands (OQ3, X2).
 *
 * The pure half of `prepare-git.mts`, kept apart so the pins, the layout the
 * app resolves and the GPL-2.0 source copy are checked without a compile.
 * On macOS and Linux `git` is built from the upstream source tarball (there is
 * no official macOS binary); on Windows it is Git for Windows' MinGit, the
 * official redistributable build of the same git release. `git-lfs` is the
 * official release binary, placed in that git's own exec path so `git lfs`
 * resolves through the one executable `bundledGitEnvironment` names.
 */

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** One platform's `git-lfs` release archive. */
export type GitLfsArchive = Readonly<{ name: string; sha256: string; url: string; format: 'zip' | 'tar.gz' }>;

/*
 * Bumping git: review the Terminal's store policy (`terminalGitStorePolicy` in
 * `libs/shell-service/src/shell/shell-grant.ts`) against the Threat Set of
 * `docs/research/linux-terminal-git-parity-blueprint.md` for every name in a
 * git directory the new release starts to read as config, hooks or a remote.
 */
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

/** Git for Windows' MinGit release, the Windows payload's git: the same git release as `gitVersion`. */
export const mingitVersion = `${gitVersion}.windows.2`;
export const mingitArchive: Readonly<{
  name: string;
  sha256: string;
  url: string;
}> = {
  name: `MinGit-${gitVersion}.2-64-bit.zip`,
  /* Pinned from the release asset fetched over TLS on 2026-11-17; Git for Windows signs its PE files, not the zip. */
  sha256: 'e3ea2944cea4b3fabcd69c7c1669ef69b1b66c05ac7806d81224d0abad2dec31',
  url: `https://github.com/git-for-windows/git/releases/download/v${mingitVersion}/MinGit-${gitVersion}.2-64-bit.zip`,
};

/**
 * What the Windows payload leaves out of MinGit, by path under its root.
 *
 * Git Credential Manager (its .NET assemblies and UI toolkit, about 29 MB and
 * 50 PE files to sign) and the helper selector that only chooses it: Tau sends
 * its own credentials through the child environment and clears
 * `credential.helper`, and the macOS and Linux payloads carry no helper either.
 * The self-updater, which would download a Git for Windows installer. The
 * system `gitconfig`, which turns on `core.autocrlf` and GCM and includes the
 * machine's own `C:/Program Files/Git/etc/gitconfig`: the source-built payloads
 * have no system config, and neither does this one.
 *
 * Every path must exist in the pinned archive, so a MinGit bump that renames or
 * drops one fails `prepare-git` instead of shipping it silently.
 */
export const mingitOmittedPaths: readonly string[] = [
  'etc/gitconfig',
  'mingw64/bin/git-update-git-for-windows',
  'mingw64/bin/git-credential-helper-selector.exe',
  ...[
    'Atlassian.Bitbucket.dll',
    'Avalonia.Base.dll',
    'Avalonia.Controls.dll',
    'Avalonia.DesignerSupport.dll',
    'Avalonia.Dialogs.dll',
    'Avalonia.Markup.Xaml.dll',
    'Avalonia.Markup.dll',
    'Avalonia.Metal.dll',
    'Avalonia.MicroCom.dll',
    'Avalonia.OpenGL.dll',
    'Avalonia.Remote.Protocol.dll',
    'Avalonia.Skia.dll',
    'Avalonia.Themes.Fluent.dll',
    'Avalonia.Vulkan.dll',
    'Avalonia.Win32.dll',
    'Avalonia.dll',
    'GitHub.dll',
    'GitLab.dll',
    'HarfBuzzSharp.dll',
    'MicroCom.Runtime.dll',
    'Microsoft.AzureRepos.dll',
    'Microsoft.Bcl.AsyncInterfaces.dll',
    'Microsoft.Identity.Client.Broker.dll',
    'Microsoft.Identity.Client.Extensions.Msal.dll',
    'Microsoft.Identity.Client.NativeInterop.dll',
    'Microsoft.Identity.Client.dll',
    'Microsoft.IdentityModel.Abstractions.dll',
    'SkiaSharp.dll',
    'System.Buffers.dll',
    'System.CommandLine.dll',
    'System.ComponentModel.Annotations.dll',
    'System.Diagnostics.DiagnosticSource.dll',
    'System.IO.FileSystem.AccessControl.dll',
    'System.Memory.dll',
    'System.Numerics.Vectors.dll',
    'System.Runtime.CompilerServices.Unsafe.dll',
    'System.Security.AccessControl.dll',
    'System.Security.Cryptography.ProtectedData.dll',
    'System.Security.Principal.Windows.dll',
    'System.Text.Encodings.Web.dll',
    'System.Text.Json.dll',
    'System.Threading.Tasks.Extensions.dll',
    'System.ValueTuple.dll',
    'av_libglesv2.dll',
    'gcmcore.dll',
    'git-credential-manager.exe',
    'git-credential-manager.exe.config',
    'libHarfBuzzSharp.dll',
    'libSkiaSharp.dll',
    'msalruntime.dll',
  ].map((name) => `mingw64/bin/${name}`),
];

/** How one target's git is obtained: compiled from `gitSourceName` on the target, or MinGit's release extracted. */
export type GitTarget = Readonly<{
  gitLfs: GitLfsArchive;
  build: 'source' | 'mingit';
}>;

/**
 * Every target this script prepares, as the other `prepare-*.mts` scripts do.
 *
 * Hashes from git-lfs's signed `sha256sums.asc`.
 */
export const gitTargets: Readonly<Record<string, GitTarget>> = {
  'darwin-arm64': {
    gitLfs: gitLfsArchive('darwin-arm64', 'zip', 'caff76a7d070d8160c89bc39b6e85d98f24135b6fed038a3b4de2590d25102d8'),
    build: 'source',
  },
  'darwin-x64': {
    gitLfs: gitLfsArchive('darwin-amd64', 'zip', 'f1c17aeca0b4eaab9ea606226477dbed3b84b56fe0811a9f967d2ea2b2393c53'),
    build: 'source',
  },
  'linux-x64': {
    gitLfs: gitLfsArchive('linux-amd64', 'tar.gz', 'e455e00f15d9b95661b8d53498ffb0c3367962cf1ec73c31ab7369516cd6ab8d'),
    build: 'source',
  },
  'win32-x64': {
    gitLfs: gitLfsArchive('windows-amd64', 'zip', 'b62e7b8ceddee635f691233d77de8eaa4b213e9209e0173811d8cfa77f7882c1'),
    build: 'mingit',
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

/** What a source-built payload was built from and what it holds: the up-to-date check's record. */
export type GitSourcePayloadManifest = Readonly<{
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

/** What a MinGit payload was extracted from, what it left out and what it holds. */
export type GitMingitPayloadManifest = Readonly<{
  schemaVersion: 1;
  target: string;
  gitVersion: string;
  mingitArchiveSha256: string;
  omittedPaths: readonly string[];
  gitLfsVersion: string;
  gitLfsArchiveSha256: string | undefined;
  gitSha256: string;
  gitLfsSha256: string;
  probed?: Readonly<{ git: string; gitLfs: string }>;
}>;

export type GitPayloadManifest = GitSourcePayloadManifest | GitMingitPayloadManifest;

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
): GitPayloadManifest => {
  const probed = built.probed === undefined ? {} : { probed: built.probed };
  if (gitTargets[built.target]?.build === 'mingit') {
    return {
      schemaVersion: 1,
      target: built.target,
      gitVersion: mingitVersion,
      mingitArchiveSha256: mingitArchive.sha256,
      omittedPaths: mingitOmittedPaths,
      gitLfsVersion,
      gitLfsArchiveSha256: gitTargets[built.target]?.gitLfs.sha256,
      gitSha256: built.gitSha256,
      gitLfsSha256: built.gitLfsSha256,
      ...probed,
    };
  }
  return {
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
    ...probed,
  };
};

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
 * exec path. A source-built payload's source tarball sits beside every target,
 * once (GPL-2.0 §3(a)).
 *
 * On Windows the payload root is MinGit's own tree: `bin/git.exe` is Git for
 * Windows' launcher (MinGit's `cmd/git.exe`, the same file a full install
 * ships as `bin/git.exe`), which puts `mingw64/bin` and `usr/bin` on `PATH`
 * and runs `mingw64/bin/git.exe`, whose exec path is `mingw64/libexec/git-core`.
 * Its licence is MinGit's own `LICENSE.txt`, and it carries no source tarball.
 *
 * @param resourceRoot - `apps/desktop/resources/git`, or a packaged app's `Resources/git`.
 * @param target - `<platform>-<arch>`.
 * @param directory - The payload's directory name under `resourceRoot`: the target's own, or a staging name.
 * @returns The payload's paths.
 */
export const gitPayloadLayout = (
  resourceRoot: string,
  target: string,
  directory: string = target,
): Readonly<{
  root: string;
  git: string;
  gitLfs: string;
  manifest: string;
  notice: string;
  gitCopying: string;
  gitLfsLicense: string;
  source: string | undefined;
}> => {
  const mingit = gitTargets[target]?.build === 'mingit';
  const root = join(resourceRoot, directory);
  return {
    root,
    git: mingit ? join(root, 'bin', 'git.exe') : join(root, 'bin', 'git'),
    gitLfs: mingit
      ? join(root, 'mingw64', 'libexec', 'git-core', 'git-lfs.exe')
      : join(root, 'libexec', 'git-core', 'git-lfs'),
    manifest: join(root, 'tau-runtime-manifest.json'),
    notice: join(root, 'NOTICE'),
    gitCopying: mingit ? join(root, 'LICENSE.txt') : join(root, 'git-COPYING'),
    gitLfsLicense: join(root, 'git-lfs-LICENSE.md'),
    source: mingit ? undefined : join(resourceRoot, 'SOURCES', gitSourceName),
  };
};

/**
 * Whether one target's `git` and `git-lfs` are present as executable files, which is all a package can check
 * without running a binary built for another machine.
 *
 * @param resourceRoot - `apps/desktop/resources/git`, or a packaged app's `Resources/git`.
 * @param target - `<platform>-<arch>`.
 * @returns For each binary, whether it is a regular file this user may execute.
 */
export const gitPayloadExecutables = async (
  resourceRoot: string,
  target: string,
): Promise<Readonly<{ git: boolean; gitLfs: boolean }>> => {
  const layout = gitPayloadLayout(resourceRoot, target);
  const executable = async (path: string): Promise<boolean> => {
    try {
      await access(path, constants.X_OK);
      const entry = await stat(path);
      return entry.isFile();
    } catch {
      return false;
    }
  };
  const [git, gitLfs] = await Promise.all([executable(layout.git), executable(layout.gitLfs)]);
  return { git, gitLfs };
};

/** The NOTICE that travels with the binaries. */
export const gitPayloadNotice = `This directory carries two programs Tau runs as separate executables.

Git ${gitVersion} — GNU General Public License, version 2 (git-COPYING).
Built unmodified from ${gitSourceName} (sha256 ${gitSourceSha256}); that exact
corresponding source is distributed with this application at ../SOURCES/${gitSourceName}.

Git LFS ${gitLfsVersion} — MIT License (git-lfs-LICENSE.md), the official release binary.
`;

/** The NOTICE that travels with the Windows (MinGit) payload. */
export const mingitPayloadNotice = `This directory carries two programs Tau runs as separate executables.

Git for Windows ${mingitVersion} (MinGit) — GNU General Public License, version 2,
with the licences of the components it bundles (LICENSE.txt; their versions are
in etc/package-versions.txt). This is the official ${mingitArchive.name}
(sha256 ${mingitArchive.sha256}), unmodified, with these files left out:
${mingitOmittedPaths.map((path) => `  ${path}`).join('\n')}
Its corresponding source is Git for Windows' tag v${mingitVersion}
(https://github.com/git-for-windows/git/tree/v${mingitVersion}) and the package
sources of https://github.com/git-for-windows/MINGW-packages and
https://github.com/git-for-windows/MSYS2-packages at the versions listed in
etc/package-versions.txt.

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
