/** Build coinstallable immutable app generations and a small stable APT selector. */
import { execFileSync } from 'node:child_process';
import { appendFile, cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';

/** Package manager inputs; the app directory is already assembled and release-verified by its caller. */
export type LinuxAptPackageOptions = {
  appDirectory: string;
  outputDirectory: string;
  tag: string;
  sourceCommit: string;
  maintainer: string;
};

/** Return a stable launcher that resolves one immutable generation before executing any app code. */
export const linuxAptLauncher = (channel: 'production' | 'staging'): string => {
  const name = channel === 'staging' ? 'tau-staging' : 'tau';
  return `#!/bin/sh
set -eu
runtime=$(readlink -e -- /opt/${name}/current)
case "$runtime" in /opt/${name}/releases/*) ;; *) echo 'Invalid Tau runtime selector' >&2; exit 1 ;; esac
exec "$runtime/Tau" "$@"
`;
};

/** Publish the selector only after dpkg has configured its exact immutable dependency. */
export const linuxAptPostinstall = (options: { name: string; version: string; sourceCommit: string }): string => {
  const { name, version, sourceCommit } = options;
  if (!/^tau(?:-staging)?$/u.test(name) || !/^\d+\.\d+\.\d+$/u.test(version) || !/^[a-f\d]{40}$/u.test(sourceCommit)) {
    throw new TypeError('Invalid APT selector identity');
  }
  return `#!/bin/sh
set -eu
[ "$1" = configure ] || exit 0
[ "$(dpkg-query -W -f='\${db:Status-Status}' ${name}-runtime-${version})" = installed ]
[ "$(dpkg-query -W -f='\${Version}' ${name}-runtime-${version})" = '${version}' ]
[ "$(cat /opt/${name}/releases/${version}/release-identity)" = '${version} ${sourceCommit}' ]
[ -x /opt/${name}/releases/${version}/Tau ]
if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
  apparmor_parser -r /etc/apparmor.d/${name}
fi
temporary=$(mktemp -d /opt/${name}/.switch.XXXXXX)
trap 'rm -f "$temporary/current"; rmdir "$temporary"' EXIT HUP INT TERM
ln -s releases/${version} "$temporary/current"
mv -Tf -- "$temporary/current" /opt/${name}/current
sync -f /opt/${name}
`;
};

/** Build both packages without modifying a live system or pruning any retained runtime. */
export const buildLinuxAptPackages = async (options: LinuxAptPackageOptions): Promise<readonly string[]> => {
  const { channel, version } = desktopReleaseIdentity(options.tag);
  const { sourceCommit, outputDirectory, appDirectory, maintainer } = options;
  if (!/^[a-f\d]{40}$/u.test(sourceCommit) || !maintainer.trim() || /[\r\n]/u.test(maintainer)) {
    throw new TypeError('Invalid package source or maintainer');
  }
  const name = channel === 'staging' ? 'tau-staging' : 'tau';
  const runtimeName = `${name}-runtime-${version}`;
  const runtimeStage = join(outputDirectory, `${runtimeName}.stage`);
  const selectorStage = join(outputDirectory, `${name}.stage`);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(runtimeStage);
  await mkdir(selectorStage);
  const generation = join(runtimeStage, `opt/${name}/releases/${version}`);
  await mkdir(generation, { recursive: true });
  await cp(appDirectory, generation, { recursive: true });
  const executable = await stat(join(generation, 'Tau'));
  // oxlint-disable-next-line no-bitwise -- POSIX executable mode bits.
  if (!executable.isFile() || !(executable.mode & 0o111)) {
    throw new Error('APT generation requires an executable Tau application');
  }
  await writeFile(join(generation, 'release-identity'), `${version} ${sourceCommit}\n`);
  await writeFile(
    join(generation, 'resources/desktop-installation.json'),
    JSON.stringify({
      schemaVersion: 1,
      route: 'linux-apt',
      tag: options.tag,
      channel,
      version,
      sourceCommit,
      arch: 'x64',
      trust: 'release',
      cache: channel === 'staging' ? 'tau-staging-updater' : 'tau-updater',
    }) + '\n',
  );
  const writer =
    (root: string) =>
    async (path: string, content: string, mode = 0o644): Promise<void> => {
      const destination = join(root, path);
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, content, { mode });
    };
  const writeRuntime = writer(runtimeStage);
  const writeSelector = writer(selectorStage);
  const control = (packageName: string, description: string, depends: string): string =>
    `Package: ${packageName}\nVersion: ${version}\nArchitecture: amd64\nMaintainer: ${maintainer}\nSection: graphics\nPriority: optional\nDepends: ${depends}\nDescription: ${description}\n`;
  await writeRuntime(
    'DEBIAN/control',
    control(
      runtimeName,
      'Tau immutable desktop runtime',
      'libc6 (>= 2.38), libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2t64 | libasound2, libgbm1, libdrm2, libx11-6, libxcomposite1, libxdamage1, libxrandr2, libxkbcommon0, libsecret-1-0, libatk1.0-0 | libatk1.0-0t64, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libcups2 | libcups2t64, bubblewrap, xdg-utils',
    ),
  );
  await writeSelector(
    'DEBIAN/control',
    control(name, 'Tau desktop launcher and runtime selector', `${runtimeName} (= ${version}), coreutils, dpkg`),
  );
  await writeSelector('DEBIAN/postinst', linuxAptPostinstall({ name, version, sourceCommit }), 0o755);
  await writeSelector(`usr/bin/${name}`, linuxAptLauncher(channel), 0o755);
  const retentionPath = `etc/apt/apt.conf.d/99${name}-runtime-retention`;
  await writeSelector(retentionPath, `APT::NeverAutoRemove { "^${name}-runtime-[0-9]+[.][0-9]+[.][0-9]+$"; };\n`);
  const profilePath = `etc/apparmor.d/${name}`;
  await writeSelector(
    profilePath,
    `abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile ${name} /opt/${name}/releases/*/Tau flags=(unconfined) {\n  userns,\n}\n`,
  );
  await writeSelector('DEBIAN/conffiles', `/${retentionPath}\n/${profilePath}\n`);
  await writeSelector(
    `usr/share/applications/${name}.desktop`,
    `[Desktop Entry]\nType=Application\nName=${channel === 'staging' ? 'Tau Staging' : 'Tau'}\nExec=/usr/bin/${name} %U\nIcon=${name}\nTerminal=false\nCategories=Graphics;3DGraphics;Engineering;\nMimeType=x-scheme-handler/${name};\n`,
  );
  await mkdir(join(selectorStage, 'usr/share/icons/hicolor/256x256/apps'), { recursive: true });
  await cp(
    join(generation, 'resources/branding/icon.png'),
    join(selectorStage, `usr/share/icons/hicolor/256x256/apps/${name}.png`),
  );
  const runtime = join(
    outputDirectory,
    desktopArtifactName({ kind: 'linux-deb-runtime', channel, version, arch: 'x64' }),
  );
  const selector = join(
    outputDirectory,
    desktopArtifactName({ kind: 'linux-deb-selector', channel, version, arch: 'x64' }),
  );
  for (const stage of [runtimeStage, selectorStage]) {
    const size = execFileSync('du', ['-sk', '--exclude=DEBIAN', stage], { encoding: 'utf8' }).split(/\s+/u)[0];
    if (!size || !/^\d+$/u.test(size)) {
      throw new Error('Cannot measure installed package size');
    }
    // oxlint-disable-next-line no-await-in-loop -- Each package control describes its own completed payload.
    await appendFile(join(stage, 'DEBIAN/control'), `Installed-Size: ${size}\n`);
  }
  execFileSync('dpkg-deb', ['--root-owner-group', '--build', runtimeStage, runtime], { stdio: 'inherit' });
  execFileSync('dpkg-deb', ['--root-owner-group', '--build', selectorStage, selector], { stdio: 'inherit' });
  // Verify the exact dependency recorded in the final bytes, not only the staging control file.
  const dependency = execFileSync('dpkg-deb', ['-f', selector, 'Depends'], { encoding: 'utf8' }).trim();
  if (!dependency.startsWith(`${runtimeName} (= ${version}),`)) {
    throw new Error('APT selector dependency differs from its immutable runtime');
  }
  const runtimeMetadata = await stat(runtime);
  if (!runtimeMetadata.isFile() || runtimeMetadata.size === 0) {
    throw new Error('Missing immutable runtime package');
  }
  return [runtime, selector];
};
