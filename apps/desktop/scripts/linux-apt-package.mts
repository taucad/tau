/** Build coinstallable immutable app generations and a small stable APT selector. */
import { execFileSync } from 'node:child_process';
import { appendFile, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseDesktopInstallation } from '#main/update-identity.js';
import { linuxInstallation } from '#shared/linux-installation.js';
import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';

/** Package manager inputs; the app directory is already assembled and release-verified by its caller. */
export type LinuxAptPackageOptions = {
  appDirectory: string;
  outputDirectory: string;
  tag: string;
  sourceCommit: string;
  maintainer: string;
  /** A verified AppImage replaces the unpacked runtime payload when present. */
  appImagePath?: string;
};

/** Return a stable launcher that resolves one immutable generation before executing any app code. */
export const linuxAptLauncher = (channel: 'production' | 'staging', appImage = false): string => {
  const { name, executable } = linuxInstallation(channel, appImage);
  return `#!/bin/sh
set -eu
runtime=$(readlink -e -- /opt/${name}/current)
case "$runtime" in /opt/${name}/releases/*) ;; *) echo 'Invalid Tau runtime selector' >&2; exit 1 ;; esac
exec "$runtime/${executable}" "$@"
`;
};

/**
 * The Tau-scoped AppArmor profile for the shell sandbox's bubblewrap. Stock Ubuntu 24.04 and Debian 13
 * keep `kernel.apparmor_restrict_unprivileged_userns=1`, which strips capabilities from an unprofiled
 * binary's user namespace, so `bwrap --unshare-net` fails to bring loopback up. This grants `userns`
 * to the one Tau-owned path and nothing else; the sysctl and every other profile stay untouched.
 */
export const linuxAptBwrapProfile = (name: string): string => {
  if (!/^tau(?:-staging)?(?:-appimage)?$/u.test(name)) {
    throw new TypeError('Invalid APT package name');
  }
  return `# Managed by the ${name} package; local changes belong in local/${name}-bwrap.
abi <abi/4.0>,
include <tunables/global>

profile ${name}-bwrap /opt/${name}/sandbox/bwrap flags=(unconfined) {
  userns,

  include if exists <local/${name}-bwrap>
}
`;
};

/** Remove only what the selector's maintainer scripts created; dpkg itself deletes packaged files. */
export const linuxAptPostremove = (options: { name: string; appImage?: boolean }): string => {
  const { name } = options;
  if (!/^tau(?:-staging)?(?:-appimage)?$/u.test(name)) {
    throw new TypeError('Invalid APT package name');
  }
  const appImageCleanup = options.appImage
    ? `if [ "$1" = remove ] && command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ] && [ -f /etc/apparmor.d/${name} ] && grep -Fqx '${name} (unconfined)' /sys/kernel/security/apparmor/profiles; then
  apparmor_parser -R /etc/apparmor.d/${name}
fi
if [ -L /opt/${name}/current ]; then
  rm /opt/${name}/current
  sync -f /opt/${name}
fi
`
    : '';
  return `#!/bin/sh
set -eu
case "$1" in remove|purge) ;; *) exit 0 ;; esac
${appImageCleanup}# dpkg has already deleted the profile file; unload exactly this profile by name.
if [ -w /sys/kernel/security/apparmor/.remove ] && grep -Fqx '${name}-bwrap (unconfined)' /sys/kernel/security/apparmor/profiles; then
  printf '%s' '${name}-bwrap' > /sys/kernel/security/apparmor/.remove
fi
rm -f -- /var/cache/apparmor/*/${name}-bwrap
rm -f -- /opt/${name}/sandbox/bwrap /opt/${name}/sandbox/.bwrap.*
if [ -d /opt/${name}/sandbox ]; then
  rmdir --ignore-fail-on-non-empty -- /opt/${name}/sandbox
fi
`;
};

/** Publish the selector only after dpkg has configured its exact immutable dependency. */
export const linuxAptPostinstall = (options: {
  name: string;
  version: string;
  sourceCommit: string;
  appImage?: boolean;
}): string => {
  const { name, version, sourceCommit } = options;
  const executable = options.appImage ? 'Tau.AppImage' : 'Tau';
  if (
    !/^tau(?:-staging)?(?:-appimage)?$/u.test(name) ||
    !/^\d+\.\d+\.\d+$/u.test(version) ||
    !/^[a-f\d]{40}$/u.test(sourceCommit)
  ) {
    throw new TypeError('Invalid APT selector identity');
  }
  return `#!/bin/sh
set -eu
# Copy the distribution's bubblewrap to the one path ${name}-bwrap attaches to. A file trigger on
# /usr/bin/bwrap repeats this whenever the distribution updates bubblewrap.
publish_bwrap() {
  [ -x /usr/bin/bwrap ]
  mkdir -p /opt/${name}/sandbox
  chmod 0755 /opt/${name}/sandbox
  staged=$(mktemp /opt/${name}/sandbox/.bwrap.XXXXXX)
  if ! { cp -- /usr/bin/bwrap "$staged" && chmod 0755 "$staged" && cmp -s -- /usr/bin/bwrap "$staged" && sync -f "$staged"; }; then
    rm -f -- "$staged"
    exit 1
  fi
  mv -f -- "$staged" /opt/${name}/sandbox/bwrap
  sync -f /opt/${name}/sandbox
}
apparmor_enabled() {
  command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ] && [ "$(cat /sys/module/apparmor/parameters/enabled 2>/dev/null || true)" = Y ]
}
if [ "$1" = triggered ]; then
  publish_bwrap
  exit 0
fi
[ "$1" = configure ] || exit 0
[ "$(dpkg-query -W -f='\${db:Status-Status}' ${name}-runtime-${version})" = installed ]
[ "$(dpkg-query -W -f='\${Version}' ${name}-runtime-${version})" = '${version}' ]
[ "$(cat /opt/${name}/releases/${version}/release-identity)" = '${version} ${sourceCommit}' ]
[ -x /opt/${name}/releases/${version}/${executable} ]
if command -v apparmor_parser >/dev/null 2>&1 && [ -d /sys/kernel/security/apparmor ]; then
  apparmor_parser -r /etc/apparmor.d/${name}
fi
# Load the attachment before the binary appears at its path, so it never runs there unprofiled.
if apparmor_enabled; then
  apparmor_parser -r -W /etc/apparmor.d/${name}-bwrap
fi
publish_bwrap
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
  const appImage = options.appImagePath !== undefined;
  const { name, scheme, executable: executableName, runtimeKind, selectorKind } = linuxInstallation(channel, appImage);
  const runtimeName = `${name}-runtime-${version}`;
  const runtimeStage = join(outputDirectory, `${runtimeName}.stage`);
  const selectorStage = join(outputDirectory, `${name}.stage`);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(runtimeStage);
  await mkdir(selectorStage);
  const generation = join(runtimeStage, `opt/${name}/releases/${version}`);
  await mkdir(generation, { recursive: true });
  if (options.appImagePath) {
    await cp(options.appImagePath, join(generation, executableName));
    await mkdir(join(generation, 'resources'));
    await cp(
      join(appDirectory, 'resources/desktop-installation.json'),
      join(generation, 'resources/desktop-installation.json'),
    );
  } else {
    await cp(appDirectory, generation, { recursive: true });
  }
  const executable = await stat(join(generation, executableName));
  // oxlint-disable-next-line no-bitwise -- POSIX executable mode bits.
  if (!executable.isFile() || !(executable.mode & 0o111)) {
    throw new Error('APT generation requires an executable Tau application');
  }
  await writeFile(join(generation, 'release-identity'), `${version} ${sourceCommit}\n`);
  if (appImage) {
    const marker = parseDesktopInstallation(
      JSON.parse(await readFile(join(generation, 'resources/desktop-installation.json'), 'utf8')),
      { version, channel, arch: 'x64', platform: 'linux' },
    );
    if (
      marker.route !== 'linux-appimage' ||
      marker.version !== version ||
      marker.sourceCommit !== sourceCommit ||
      marker.channel !== channel ||
      marker.tag !== options.tag
    ) {
      throw new Error('Managed AppImage identity differs from package identity');
    }
  } else {
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
  }
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
      // `fuse3` carries the setuid `fusermount3` the Linux projection transport mounts through. The projection is
      // unactivated and nothing mounts one today; declaring it now means activation needs no packaging change.
      'libc6 (>= 2.38), libgtk-3-0 | libgtk-3-0t64, libnss3, libasound2t64 | libasound2, libgbm1, libdrm2, libx11-6, libxcomposite1, libxdamage1, libxrandr2, libxkbcommon0, libsecret-1-0, libatk1.0-0 | libatk1.0-0t64, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libcups2 | libcups2t64, bubblewrap, ripgrep, socat, fuse3, xdg-utils' +
        (appImage ? ', libfuse2t64 | libfuse2' : ''),
    ),
  );
  await writeSelector(
    'DEBIAN/control',
    control(
      name,
      'Tau desktop launcher and runtime selector',
      `${runtimeName} (= ${version}), coreutils, dpkg, bubblewrap`,
    ),
  );
  await writeSelector('DEBIAN/postinst', linuxAptPostinstall({ name, version, sourceCommit, appImage }), 0o755);
  await writeSelector('DEBIAN/postrm', linuxAptPostremove({ name, appImage }), 0o755);
  await writeSelector('DEBIAN/triggers', 'interest-noawait /usr/bin/bwrap\n');
  await writeSelector(`usr/bin/${name}`, linuxAptLauncher(channel, appImage), 0o755);

  const retentionPath = `etc/apt/apt.conf.d/99${name}-runtime-retention`;
  await writeSelector(retentionPath, `APT::NeverAutoRemove { "^${name}-runtime-[0-9]+[.][0-9]+[.][0-9]+$"; };\n`);
  const profilePath = `etc/apparmor.d/${name}`;
  await writeSelector(
    profilePath,
    `abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile ${name} /opt/${name}/releases/*/${executableName} flags=(unconfined) {\n  userns,\n}\n`,
  );
  // Not a conffile: dpkg deletes it on remove and restores it on reinstall, so no stale grant survives.
  await writeSelector(`etc/apparmor.d/${name}-bwrap`, linuxAptBwrapProfile(name));
  await writeSelector('DEBIAN/conffiles', `/${retentionPath}\n/${profilePath}\n`);
  await writeSelector(
    `usr/share/applications/${name}.desktop`,
    `[Desktop Entry]\nType=Application\nName=${channel === 'staging' ? 'Tau Staging' : 'Tau'}\nExec=/usr/bin/${name} %U\nIcon=${name}\nTerminal=false\nCategories=Graphics;3DGraphics;Engineering;\nMimeType=x-scheme-handler/${scheme};\n`,
  );
  await mkdir(join(selectorStage, 'usr/share/icons/hicolor/256x256/apps'), { recursive: true });
  await cp(
    join(appDirectory, 'resources/branding/icon.png'),
    join(selectorStage, `usr/share/icons/hicolor/256x256/apps/${name}.png`),
  );
  const runtime = join(outputDirectory, desktopArtifactName({ kind: runtimeKind, channel, version, arch: 'x64' }));
  const selector = join(outputDirectory, desktopArtifactName({ kind: selectorKind, channel, version, arch: 'x64' }));
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
