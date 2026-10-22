/** Linux qualification drivers retain actual host, package, stable-image and process evidence. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, readFile, readlink, realpath, rm } from 'node:fs/promises';
import { arch, release, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { extractFile, uncache } from '@electron/asar';
import { z } from 'zod';
import { parseDesktopInstallation } from '#main/update-identity.js';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Adjacent qualification and APT snapshot owners provide shared contracts. */
import { readDesktopAptSnapshot } from './desktop-apt-publication.mjs';
import { createQualificationReinstallGuard, QualificationUnavailable } from './qualification-platform-types.mjs';
import type {
  QualificationCandidate,
  QualificationDriverOptions,
  QualificationInstallation,
  QualificationPlatformDriver,
} from './qualification-platform-types.mjs';
/* oxlint-enable no-restricted-imports */

const host = (): void => {
  if (
    process.platform !== 'linux' ||
    process.arch !== 'x64' ||
    process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1'
  ) {
    throw new QualificationUnavailable('Linux x64 disposable-host authorization is required');
  }
};
const command = (file: string, args: string[], inheritOutput = false): string => {
  host();
  const result = spawnSync(file, args, {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', inheritOutput ? 'inherit' : 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new QualificationUnavailable(`${file} failed: ${result.stderr || result.error?.message}`);
  }
  return inheritOutput ? '' : result.stdout.trim();
};
/** Let an existing unattended upgrade finish without disabling it or removing its lock. */
export const runQualificationApt = (operation: 'install' | 'remove', packages: string[]): void => {
  command(
    'sudo',
    ['-n', 'apt-get', '-o', 'DPkg::Lock::Timeout=120', operation, '--yes', '--no-install-recommends', ...packages],
    true,
  );
};
const hashFile = async (path: string): Promise<string> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('Qualification requires a canonical regular file');
  }
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) {
    if (!(data instanceof Uint8Array)) {
      throw new Error('Expected binary file data');
    }
    hash.update(data);
  }
  return hash.digest('hex');
};
const packageSchema = z.object({
  version: z.string(),
  tauDesktop: z.object({
    channel: z.enum(['production', 'staging']).default('production'),
    sourceCommit: z.string(),
    environmentOverrides: z.literal(false).optional(),
  }),
});
/** Admission mirrors desktopManifestFields: production and disabled overrides are omitted. */
export const linuxQualificationPackageSchema = packageSchema;

const installedIdentity = async (
  candidate: QualificationCandidate,
  root: string,
  mode: 'release' | 'fixture',
): Promise<QualificationInstallation> => {
  const manifest = parseDesktopArtifactManifest(candidate.manifest);
  const asar = join(root, 'resources/app.asar');
  uncache(asar);
  const metadata = packageSchema.parse(JSON.parse(extractFile(asar, 'package.json').toString()));
  const marker = parseDesktopInstallation(
    JSON.parse(await readFile(join(root, 'resources/desktop-installation.json'), 'utf8')),
    { platform: 'linux', arch: 'x64', channel: manifest.channel, version: manifest.version },
  );
  if (
    metadata.version !== manifest.version ||
    metadata.tauDesktop.channel !== manifest.channel ||
    metadata.tauDesktop.sourceCommit !== manifest.sourceCommit ||
    marker.sourceCommit !== manifest.sourceCommit ||
    marker.tag !== manifest.tag ||
    marker.route !== candidate.route ||
    marker.trust !== (mode === 'release' ? 'release' : 'test')
  ) {
    throw new Error('Installed Linux source/route/trust differs');
  }
  const executablePath = join(root, 'Tau');
  return {
    route: candidate.route,
    channel: manifest.channel,
    tag: manifest.tag,
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    executablePath,
    executableSha256: await hashFile(executablePath),
    asarSha256: await hashFile(asar),
    installationPath: root,
    measurements: { trust: mode },
  };
};
const verifyArtifact = async (candidate: QualificationCandidate, kind: string): Promise<string> => {
  const manifest = parseDesktopArtifactManifest(candidate.manifest);
  const artifact = manifest.artifacts.find((item) => item.kind === kind);
  if (!artifact) {
    throw new Error('Required qualification artifact missing');
  }
  const path = join(candidate.artifactDirectory, artifact.name);
  const info = await lstat(path);
  if ((await hashFile(path)) !== artifact.sha256 || info.size !== artifact.size) {
    throw new Error('Qualification artifact bytes differ');
  }
  return path;
};
/** Derive expected installed content from the exact authenticated runtime Debian artifact. */
export const aptQualificationPayloadHashes = async (
  candidate: QualificationCandidate,
): Promise<{ executableSha256: string; asarSha256: string }> => {
  const manifest = parseDesktopArtifactManifest(candidate.manifest);
  if (candidate.route !== 'linux-apt') {
    throw new Error('Wrong APT payload route');
  }
  const artifact = await verifyArtifact(candidate, 'linux-deb-runtime');
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'tau-qualification-deb-')));
  try {
    command('dpkg-deb', ['--extract', artifact, scratch]);
    const name = manifest.channel === 'staging' ? 'tau-staging' : 'tau';
    const root = join(scratch, 'opt', name, 'releases', manifest.version);
    return {
      executableSha256: await hashFile(join(root, 'Tau')),
      asarSha256: await hashFile(join(root, 'resources/app.asar')),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
const readMeasurement = async (path: string): Promise<string> => {
  try {
    const value = await readFile(path, 'utf8');
    return value.trim();
  } catch (error) {
    return `unavailable:${error instanceof Error ? error.message : String(error)}`;
  }
};
const readCommandLine = async (pid: number): Promise<string> => {
  const value = await readFile(`/proc/${pid}/cmdline`, 'utf8');
  return value.replaceAll('\0', ' ');
};
const measureSecurity: QualificationPlatformDriver['measureSecurity'] = async (processes) => {
  host();
  const ids = [processes.mainPid, ...processes.rendererPids, ...processes.nativeChildPids];
  if (
    processes.rendererPids.length === 0 ||
    processes.nativeChildPids.length === 0 ||
    ids.some((pid) => !Number.isSafeInteger(pid) || pid < 1) ||
    new Set(ids).size !== ids.length
  ) {
    throw new QualificationUnavailable('Live distinct main, renderer and native child PIDs are required');
  }
  const observations = await Promise.all(
    ids.map(async (pid) => {
      const executable = await readlink(`/proc/${pid}/exe`);
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(`/proc/${pid}/exe`)) {
        if (!(bytes instanceof Uint8Array)) {
          throw new Error('Expected process executable bytes');
        }
        hash.update(bytes);
      }
      return {
        pid,
        executable,
        commandLine: await readCommandLine(pid),
        measurements: {
          executableSha256: hash.digest('hex'),
          ...(pid === processes.mainPid
            ? { mountedAsarSha256: await hashFile(join(dirname(executable), 'resources/app.asar')) }
            : {}),
          status: await readFile(`/proc/${pid}/status`, 'utf8'),
          appArmor: await readMeasurement(`/proc/${pid}/attr/current`),
          userNamespace: await readlink(`/proc/${pid}/ns/user`),
          pidNamespace: await readlink(`/proc/${pid}/ns/pid`),
          uidMap: await readMeasurement(`/proc/${pid}/uid_map`),
        },
      };
    }),
  );
  return {
    platform: 'linux',
    architecture: arch(),
    osVersion: `${release()} ${await readMeasurement('/etc/os-release')}`,
    measurements: {
      appArmorEnabled: await readMeasurement('/sys/module/apparmor/parameters/enabled'),
      unprivilegedUserns: await readMeasurement('/proc/sys/kernel/unprivileged_userns_clone'),
      appArmorUsernsRestriction: await readMeasurement('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),
      maxUserNamespaces: await readMeasurement('/proc/sys/user/max_user_namespaces'),
      runnerUid: String(process.getuid?.()),
      pid1: await readMeasurement('/proc/1/comm'),
      runnerUserNamespace: await readlink('/proc/self/ns/user'),
    },
    processes: observations,
  };
};
const preserve = async (files: ReadonlyArray<{ path: string; sha256: string }>): Promise<void> => {
  await Promise.all(
    files.map(async (file) => {
      if ((await hashFile(file.path)) !== file.sha256) {
        throw new Error('Preserved project/profile bytes changed');
      }
    }),
  );
};

/** Copy only baseline A; observe later versions at the same outer path after the shipping updater replaces it. */
export const createLinuxAppImageQualificationDriver = (
  options: QualificationDriverOptions,
): QualificationPlatformDriver => {
  host();
  if (!isAbsolute(options.installationPath)) {
    throw new Error('AppImage qualification requires absolute stable outer path');
  }
  const lifecycle = createQualificationReinstallGuard();
  let installed = false;
  const observe: QualificationPlatformDriver['observe'] = async (candidate) => {
    host();
    if (candidate.route !== 'linux-appimage') {
      throw new Error('Wrong AppImage qualification route');
    }
    const artifact = parseDesktopArtifactManifest(candidate.manifest).artifacts.find(
      (item) => item.kind === 'linux-appimage',
    );
    if (!artifact || (await hashFile(options.installationPath)) !== artifact.sha256) {
      throw new Error('Stable outer AppImage bytes differ');
    }
    const scratch = await mkdtemp(join(dirname(options.installationPath), '.qualification-extract-'));
    try {
      const extracted = spawnSync(options.installationPath, ['--appimage-extract'], {
        cwd: scratch,
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      if (extracted.status !== 0) {
        throw new QualificationUnavailable(`AppImage extraction failed: ${extracted.stderr}`);
      }
      const identity = await installedIdentity(candidate, join(scratch, 'squashfs-root'), options.mode);
      lifecycle.observed(candidate);
      return {
        ...identity,
        executablePath: options.installationPath,
        installationPath: options.installationPath,
        artifactSha256: artifact.sha256,
        measurements: {
          ...identity.measurements,
          extractedExecutableSha256: identity.executableSha256,
          outerImageSha256: artifact.sha256,
          expectedExecutableSha256: identity.executableSha256,
          expectedAsarSha256: identity.asarSha256,
          stableOuterPath: options.installationPath,
        },
        executableSha256: artifact.sha256,
      };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  };
  return {
    async install(candidate) {
      if (installed) {
        throw new Error('Initial AppImage copy only; later replacement must use shipping updater');
      }
      if (candidate.route !== 'linux-appimage') {
        throw new Error('Wrong AppImage route');
      }
      const path = await verifyArtifact(candidate, 'linux-appimage');
      await copyFile(path, options.installationPath, constants.COPYFILE_EXCL);
      await chmod(options.installationPath, 0o755);
      installed = true;
      lifecycle.installed();
      return observe(candidate);
    },
    async reinstall(candidate, files) {
      host();
      lifecycle.admit(candidate, files);
      await preserve(files);
      const path = await verifyArtifact(candidate, 'linux-appimage');
      await copyFile(path, options.installationPath, constants.COPYFILE_EXCL);
      await chmod(options.installationPath, 0o755);
      const observation = await observe(candidate);
      await preserve(files);
      return observation;
    },
    observe,
    measureSecurity,
    async remove(files) {
      lifecycle.assertRemoval();
      host();
      await preserve(files);
      await rm(options.installationPath);
      await preserve(files);
      lifecycle.removed(files);
    },
  };
};

export type AptQualificationRepository = Parameters<typeof readDesktopAptSnapshot>[0];
export type ActiveAptRuntime = {
  pid: number;
  startTime: string;
  executable: string;
  resourcePath: string;
  resourceSha256: string;
};
export type LinuxAptQualificationDriver = QualificationPlatformDriver & {
  captureActiveRuntime(pid: number, resourceRelativePath: string): Promise<ActiveAptRuntime>;
  waitForScheduledUpgrade(request: {
    candidate: QualificationCandidate;
    repository: AptQualificationRepository;
    baseline: ActiveAptRuntime;
    publishSnapshot: () => Promise<void>;
    /** Milliseconds. */ upgradeTimeout: number;
  }): Promise<{
    installation: QualificationInstallation;
    scheduler: Record<string, string>;
    retained: ActiveAptRuntime;
  }>;
};
/** Refuse an unfinished scheduler invocation even when the selected generation already changed. */
export const waitForScheduledAptCompletion = async (
  readState: () => Promise<{ selected: boolean; inactive: boolean }>,
  /** Milliseconds. */ completionTimeout: number,
  pollInterval = 1000,
): Promise<void> => {
  const deadline = Date.now() + completionTimeout;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Observe scheduler state serially until completion or timeout.
    const state = await readState();
    if (state.selected && state.inactive) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- Bounded scheduler polling without busy waiting.
    await delay(pollInterval);
  }
  throw new QualificationUnavailable('Scheduled APT upgrade did not reach selected and inactive before deadline');
};
const validateUpgradeTimeout = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 3_600_000) {
    throw new Error('Invalid scheduled-upgrade observation timeout');
  }
};
const processStartTime = async (pid: number): Promise<string> => {
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw new Error('Invalid active process');
  }
  const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]!;
};
const unattendedLogSnapshot = (): { ino: number; size: number } | undefined => {
  const value: unknown = JSON.parse(
    command('sudo', [
      '-n',
      'python3',
      '-c',
      `
import json, os, stat
path = '/var/log/unattended-upgrades/unattended-upgrades-dpkg.log'
try:
    info = os.lstat(path)
except FileNotFoundError:
    print('null')
else:
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError('Unattended log is not a regular file')
    print(json.dumps({'ino': info.st_ino, 'size': info.st_size}))
`,
    ]),
  );
  return (
    z.object({ ino: z.number().int().nonnegative(), size: z.number().int().nonnegative() }).nullable().parse(value) ??
    undefined
  );
};
const readUnattendedPackageLog = (
  before: { ino: number; size: number } | undefined,
  candidate: QualificationCandidate,
): string => {
  // The known log directory can be root-only. Limit elevated access to this one path and bounded new bytes.
  const packageLog = command('sudo', [
    '-n',
    'python3',
    '-c',
    `
import json, os, stat, sys
path = '/var/log/unattended-upgrades/unattended-upgrades-dpkg.log'
before = json.loads(sys.argv[1])
fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
try:
    info = os.fstat(fd)
    offset = before['size'] if before and before['ino'] == info.st_ino else 0
    size = info.st_size - offset
    if not stat.S_ISREG(info.st_mode) or size <= 0 or size > 8 * 1024 * 1024:
        raise RuntimeError('Bounded new unattended package log unavailable')
    os.lseek(fd, offset, os.SEEK_SET)
    with os.fdopen(fd, 'rb', closefd=False) as stream:
        data = stream.read(size)
    if len(data) != size:
        raise RuntimeError('Unattended log changed during read')
    sys.stdout.buffer.write(data)
finally:
    os.close(fd)
`,
    JSON.stringify(before ?? null),
  ]);
  const packageName = candidate.manifest.channel === 'staging' ? 'tau-staging' : 'tau';
  if (
    !packageLog.includes(`Setting up ${packageName} (${candidate.manifest.version})`) ||
    !packageLog.includes(
      `Setting up ${packageName}-runtime-${candidate.manifest.version} (${candidate.manifest.version})`,
    )
  ) {
    throw new QualificationUnavailable(
      'Unattended package log does not attribute both candidate packages to this observed update',
    );
  }
  return packageLog;
};
/** Bind initial dpkg installation to an authenticated repository snapshot; subsequent upgrades must come from systemd/APT. */
export const createLinuxAptQualificationDriver = (
  options: QualificationDriverOptions & { repository: AptQualificationRepository },
): LinuxAptQualificationDriver => {
  host();
  if (process.getuid?.() === 0) {
    throw new QualificationUnavailable('APT qualification application runner must be an ordinary user');
  }
  command('sudo', ['-n', 'true']);
  const lifecycle = createQualificationReinstallGuard();
  let installed = false;
  let current: QualificationCandidate | undefined;
  let currentRepository = options.repository;
  const authenticate = async (
    candidate: QualificationCandidate,
    repository: AptQualificationRepository,
  ): Promise<void> => {
    const manifest = parseDesktopArtifactManifest(candidate.manifest);
    if (candidate.route !== 'linux-apt' || repository.channel !== manifest.channel) {
      throw new Error('APT repository channel/route differs');
    }
    const snapshot = await readDesktopAptSnapshot(repository);
    if (Date.parse(snapshot.inventory.validUntil) <= Date.now()) {
      throw new Error('APT qualification snapshot expired');
    }
    for (const kind of ['linux-deb-runtime', 'linux-deb-selector']) {
      const artifact = manifest.artifacts.find((item) => item.kind === kind);
      if (
        !artifact ||
        !snapshot.inventory.packages.some(
          (item) =>
            item.tag === manifest.tag &&
            item.sourceCommit === manifest.sourceCommit &&
            item.kind === kind &&
            item.name === artifact.name &&
            item.sha256 === artifact.sha256 &&
            item.size === artifact.size,
        )
      ) {
        throw new Error('APT snapshot does not authenticate exact candidate packages');
      }
    }
  };
  const observe: QualificationPlatformDriver['observe'] = async (candidate) => {
    host();
    const manifest = parseDesktopArtifactManifest(candidate.manifest);
    if (candidate.route !== 'linux-apt') {
      throw new Error('Wrong APT route');
    }
    const name = manifest.channel === 'staging' ? 'tau-staging' : 'tau';
    if (options.installationPath !== `/opt/${name}`) {
      throw new Error('APT installation root differs from channel');
    }
    const root = await realpath(join(options.installationPath, 'current'));
    if (root !== join(options.installationPath, 'releases', manifest.version)) {
      throw new Error('Selected APT generation differs');
    }
    const packages = command('dpkg-query', [
      '-W',
      // oxlint-disable-next-line no-template-curly-in-string -- dpkg-query interprets these fields, not JavaScript.
      '-f=${binary:Package}\t${Version}\t${db:Status-Status}\n',
      name,
      `${name}-runtime-${manifest.version}`,
    ]);
    const rows = packages.split('\n');
    if (
      rows.length !== 2 ||
      rows.some((row) => {
        const fields = row.split('\t');
        return fields[1] !== manifest.version || fields[2] !== 'installed';
      })
    ) {
      throw new Error('APT package database identity differs');
    }
    const identity = await installedIdentity(candidate, root, options.mode);
    const expected = await aptQualificationPayloadHashes(candidate);
    if (identity.executableSha256 !== expected.executableSha256 || identity.asarSha256 !== expected.asarSha256) {
      throw new Error('Installed APT payload differs from authenticated runtime package');
    }
    current = candidate;
    lifecycle.observed(candidate);
    return {
      ...identity,
      measurements: {
        ...identity.measurements,
        packageDatabase: packages,
        selectedGeneration: root,
        expectedExecutableSha256: expected.executableSha256,
        expectedAsarSha256: expected.asarSha256,
        candidateArtifactSha256: manifest.artifacts.find((item) => item.kind === 'linux-deb-runtime')!.sha256,
      },
    };
  };
  const captureActiveRuntime = async (pid: number, resourceRelativePath: string): Promise<ActiveAptRuntime> => {
    if (!current) {
      throw new Error('Observe installed APT generation first');
    }
    const executable = await readlink(`/proc/${pid}/exe`);
    const expected = join(options.installationPath, 'releases', current.manifest.version, 'Tau');
    if (
      executable !== expected ||
      isAbsolute(resourceRelativePath) ||
      relative(dirname(expected), resolve(dirname(expected), resourceRelativePath)).startsWith('..')
    ) {
      throw new Error('Active process/resource is outside original generation');
    }
    const resourcePath = resolve(dirname(expected), resourceRelativePath);
    return {
      pid,
      startTime: await processStartTime(pid),
      executable,
      resourcePath,
      resourceSha256: await hashFile(resourcePath),
    };
  };
  return {
    async install(candidate) {
      if (installed) {
        throw new Error('APT baseline only; subsequent qualification must use actual scheduler');
      }
      const channelName = candidate.manifest.channel === 'staging' ? 'tau-staging' : 'tau';
      const existingRoot = await lstat(`/opt/${channelName}`).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      });
      const existingPackages = spawnSync('dpkg-query', ['-W', channelName, `${channelName}-runtime-*`], {
        encoding: 'utf8',
        timeout: 30_000,
      });
      if (
        ((existingRoot ?? existingPackages.stdout.trim()) || existingPackages.error) ??
        ![0, 1].includes(existingPackages.status ?? -1)
      ) {
        throw new QualificationUnavailable(
          'Clean APT qualification requires absent selector, runtimes and channel installation root',
        );
      }
      await authenticate(candidate, options.repository);
      const paths = await Promise.all(
        ['linux-deb-runtime', 'linux-deb-selector'].map(async (kind) => verifyArtifact(candidate, kind)),
      );
      runQualificationApt('install', paths);
      installed = true;
      lifecycle.installed();
      return observe(candidate);
    },
    observe,
    measureSecurity,
    captureActiveRuntime,
    async reinstall(candidate, files) {
      lifecycle.admit(candidate, files);
      await preserve(files);
      await authenticate(candidate, currentRepository);
      const paths = await Promise.all(
        ['linux-deb-runtime', 'linux-deb-selector'].map(async (kind) => verifyArtifact(candidate, kind)),
      );
      runQualificationApt('install', paths);
      const observation = await observe(candidate);
      await preserve(files);
      return observation;
    },
    async waitForScheduledUpgrade(request) {
      const { candidate, repository, baseline, upgradeTimeout } = request;
      validateUpgradeTimeout(upgradeTimeout);
      if (!installed || !current) {
        throw new Error('Initial APT installation required');
      }
      await authenticate(candidate, repository);
      if ((await readMeasurement('/proc/1/comm')) !== 'systemd') {
        throw new QualificationUnavailable('Real systemd host required for scheduled APT qualification');
      }
      for (const timer of ['apt-daily.timer', 'apt-daily-upgrade.timer']) {
        command('systemctl', ['is-enabled', '--quiet', timer]);
        command('systemctl', ['is-active', '--quiet', timer]);
      }
      const policy = command('apt-config', ['dump']);
      const label = candidate.manifest.channel === 'staging' ? 'TauStaging' : 'TauProduction';
      if (
        !policy.includes(`origin=Tau,label=${label},`) ||
        !/APT::Periodic::Unattended-Upgrade "(?:1|always)";/u.test(policy) ||
        !/APT::Periodic::Update-Package-Lists "(?:1|always)";/u.test(policy)
      ) {
        throw new QualificationUnavailable('Scoped Tau origin and daily unattended scheduling required');
      }
      const beforeInvocation = command('systemctl', [
        'show',
        'apt-daily-upgrade.service',
        '--property=InvocationID',
        '--value',
      ]);
      const logBefore = unattendedLogSnapshot();
      const since = new Date().toISOString();
      await request.publishSnapshot();
      await waitForScheduledAptCompletion(async () => {
        const selected = await realpath(join(options.installationPath, 'current'));
        const state = command('systemctl', ['show', 'apt-daily-upgrade.service', '--property=ActiveState', '--value']);
        return {
          selected: selected === join(options.installationPath, 'releases', candidate.manifest.version),
          inactive: state === 'inactive',
        };
      }, upgradeTimeout);
      const installation = await observe(candidate);
      currentRepository = repository;
      const invocation = command('systemctl', [
        'show',
        'apt-daily-upgrade.service',
        '--property=InvocationID',
        '--value',
      ]);
      const result = command('systemctl', ['show', 'apt-daily-upgrade.service', '--property=Result', '--value']);
      const journal = command('sudo', [
        '-n',
        'journalctl',
        '--unit=apt-daily-upgrade.service',
        '--since',
        since,
        '--no-pager',
        '--output=json',
      ]);
      const packageLog = readUnattendedPackageLog(logBefore, candidate);
      if (!invocation || invocation === beforeInvocation || result !== 'success' || !journal.includes(invocation)) {
        throw new QualificationUnavailable('No new successful real unattended scheduler invocation observed');
      }
      if (
        (await processStartTime(baseline.pid)) !== baseline.startTime ||
        (await readlink(`/proc/${baseline.pid}/exe`)) !== baseline.executable ||
        (await hashFile(baseline.resourcePath)) !== baseline.resourceSha256
      ) {
        throw new Error('Running A process or retained resource changed during scheduled update');
      }
      return {
        installation,
        scheduler: { beforeInvocation, invocation, result, journal, policy, since, packageLog },
        retained: baseline,
      };
    },
    async remove(files) {
      lifecycle.assertRemoval();
      if (!current) {
        throw new Error('No APT installation observed');
      }
      await preserve(files);
      runQualificationApt('remove', [current.manifest.channel === 'staging' ? 'tau-staging' : 'tau']);
      const selector = current.manifest.channel === 'staging' ? 'tau-staging' : 'tau';
      const remaining = command('dpkg-query', [
        '-W',
        // oxlint-disable-next-line no-template-curly-in-string -- dpkg-query owns this format.
        '-f=${binary:Package} ${db:Status-Status}\n',
      ]);
      if (remaining.split('\n').some((line) => line === `${selector} installed`)) {
        throw new Error('APT selector remains installed after removal');
      }
      await Promise.all(
        [`/usr/bin/${selector}`, `/usr/share/applications/${selector}.desktop`].map(async (path) => {
          const info = await lstat(path).catch((error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
              return undefined;
            }
            throw error;
          });
          if (info) {
            throw new Error('APT selector launcher or desktop entry remains after removal');
          }
        }),
      );
      await preserve(files);
      lifecycle.removed(files);
    },
  };
};
