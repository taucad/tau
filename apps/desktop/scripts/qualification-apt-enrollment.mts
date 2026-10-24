/** Authenticate public-only qualification snapshots and enroll an explicitly disposable ordinary-user Linux host. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { linuxDebKinds } from '#shared/linux-installation.js';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Qualification preparation shares explicit platform and repository contracts. */
import { readDesktopAptSnapshot } from './desktop-apt-publication.mjs';
import { QualificationUnavailable } from './qualification-platform-types.mjs';
import type { QualificationCandidate } from './qualification-platform-types.mjs';
import type { AptQualificationRepository } from './qualification-linux.mjs';
/* oxlint-enable no-restricted-imports */
const hashSchema = z.string().regex(/^[a-f\d]{64}$/u);
const metadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tag: z.string(),
  channel: z.enum(['staging', 'production']),
  version: z.string(),
  sourceCommit: z.string(),
  manifestSha256: hashSchema,
  archiveSha256: hashSchema,
  archiveSize: z.number().int().positive(),
  primaryFingerprint: z.string(),
  signingFingerprint: z.string(),
  issuedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  snapshotPrefix: z.string().regex(/^snapshots\/[a-f\d]{64}$/u),
});
const command = (file: string, args: string[]): string =>
  execFileSync(file, args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }).trim();
const digest = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) {
    if (!(data instanceof Uint8Array)) {
      throw new Error('Expected binary snapshot bytes');
    }
    hash.update(data);
  }
  return hash.digest('hex');
};
/** Import exactly one approved public primary and signing subkey; private material is forbidden. */
export const admitQualificationAptPublicKey = async (options: {
  publicKeyPath: string;
  gnupgHome: string;
  primaryFingerprint: string;
  signingFingerprint: string;
}): Promise<void> => {
  if (
    !/^[A-F\d]{40}$/u.test(options.primaryFingerprint) ||
    !/^[A-F\d]{40}$/u.test(options.signingFingerprint) ||
    options.primaryFingerprint === options.signingFingerprint
  ) {
    throw new Error('Distinct complete primary and signing fingerprints required');
  }
  const key = await readFile(options.publicKeyPath, 'utf8');
  if (!key.startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----') || key.includes('PRIVATE KEY')) {
    throw new Error('Public-only APT key required');
  }
  await mkdir(options.gnupgHome, { mode: 0o700 });
  command('gpg', ['--homedir', options.gnupgHome, '--batch', '--import', options.publicKeyPath]);
  const rows = command('gpg', ['--homedir', options.gnupgHome, '--with-colons', '--list-keys'])
    .split('\n')
    .map((line) => line.split(':'));
  const fingerprints = rows.filter((row) => row[0] === 'fpr').map((row) => row[9]);
  if (
    rows.filter((row) => row[0] === 'pub').length !== 1 ||
    fingerprints[0] !== options.primaryFingerprint ||
    !fingerprints.slice(1).includes(options.signingFingerprint)
  ) {
    throw new Error('APT public key relationship differs');
  }
  if (command('gpg', ['--homedir', options.gnupgHome, '--with-colons', '--list-secret-keys']).includes('sec:')) {
    throw new Error('Private keys forbidden in qualification');
  }
};
const unpack = (archive: string, destination: string): void => {
  command('python3', [
    '-c',
    `import tarfile, pathlib, shutil, sys
with tarfile.open(sys.argv[1], 'r:') as source:
 members=source.getmembers()
 if len(members)>10000: raise ValueError('Archive entry limit exceeded')
 seen=set()
 for member in members:
  path=pathlib.PurePosixPath(member.name)
  if path.is_absolute() or '..' in path.parts or not (member.isdir() or member.isfile()) or str(path) in seen: raise ValueError('Unsafe archive entry')
  seen.add(str(path))
 root=pathlib.Path(sys.argv[2])
 for member in members:
  target=root/pathlib.PurePosixPath(member.name)
  if member.isdir(): target.mkdir(parents=True,exist_ok=True)
  else:
   target.parent.mkdir(parents=True,exist_ok=True)
   with source.extractfile(member) as data, target.open('xb') as output: shutil.copyfileobj(data,output)`,
    archive,
    destination,
  ]);
};
const admitSnapshot = async (options: {
  candidate: QualificationCandidate;
  bundleDirectory: string;
  directory: string;
  gnupgHome: string;
  primaryFingerprint: string;
  signingFingerprint: string;
}): Promise<AptQualificationRepository> => {
  const manifest = parseDesktopArtifactManifest(options.candidate.manifest);
  const metadata = metadataSchema.parse(
    JSON.parse(await readFile(join(options.bundleDirectory, 'qualification-apt-snapshot.json'), 'utf8')),
  );
  const archive = join(options.bundleDirectory, 'qualification-apt-snapshot.tar');
  const info = await lstat(archive);
  if (
    !['linux-apt', 'linux-appimage'].includes(options.candidate.route) ||
    metadata.tag !== manifest.tag ||
    metadata.channel !== manifest.channel ||
    metadata.version !== manifest.version ||
    metadata.sourceCommit !== manifest.sourceCommit ||
    metadata.manifestSha256 !== createHash('sha256').update(JSON.stringify(manifest)).digest('hex') ||
    metadata.primaryFingerprint !== options.primaryFingerprint ||
    metadata.signingFingerprint !== options.signingFingerprint ||
    !info.isFile() ||
    info.size !== metadata.archiveSize ||
    (await digest(archive)) !== metadata.archiveSha256 ||
    Date.parse(metadata.validUntil) <= Date.now()
  ) {
    throw new Error('APT snapshot candidate/archive binding differs or expired');
  }
  const bytes = async (name: string): Promise<Uint8Array<ArrayBuffer>> =>
    Uint8Array.from(await readFile(join(options.bundleDirectory, name)));
  const repository = {
    channel: manifest.channel,
    gnupgHome: options.gnupgHome,
    signingFingerprint: options.signingFingerprint,
    inRelease: await bytes('qualification-apt-InRelease'),
    signedInventory: await bytes('qualification-apt-inventory.json'),
    signature: await bytes('qualification-apt-inventory.json.gpg'),
  };
  const snapshot = await readDesktopAptSnapshot(repository);
  if (
    snapshot.inventory.issuedAt !== metadata.issuedAt ||
    snapshot.inventory.validUntil !== metadata.validUntil ||
    metadata.snapshotPrefix !== `snapshots/${createHash('sha256').update(repository.inRelease).digest('hex')}`
  ) {
    throw new Error('APT signed snapshot metadata differs');
  }
  for (const artifact of manifest.artifacts.filter((item) => linuxDebKinds.some((kind) => item.kind === kind))) {
    if (
      !snapshot.inventory.packages.some(
        (item) =>
          item.tag === manifest.tag &&
          item.sourceCommit === manifest.sourceCommit &&
          item.kind === artifact.kind &&
          item.name === artifact.name &&
          item.sha256 === artifact.sha256 &&
          item.size === artifact.size,
      )
    ) {
      throw new Error('Signed APT inventory differs from candidate');
    }
  }
  await mkdir(options.directory);
  unpack(archive, options.directory);
  await Promise.all(
    snapshot.objects.map(async (object) => {
      const path = join(options.directory, object.path);
      const entry = await lstat(path);
      if (!entry.isFile() || entry.size !== object.size || (await digest(path)) !== object.sha256) {
        throw new Error('Extracted APT package/index bytes differ');
      }
    }),
  );
  const suite = manifest.channel === 'production' ? 'stable' : 'staging';
  if (!Buffer.from(repository.inRelease).equals(await readFile(join(options.directory, `dists/${suite}/InRelease`)))) {
    throw new Error('Extracted signed APT pointer differs');
  }
  return repository;
};
export type QualificationAptEnrollment = {
  repositories: AptQualificationRepository[];
  snapshotDirectories: string[];
  enroll(): Promise<void>;
  cleanup(): Promise<void>;
};
/** Prepare A/B/C without privileges, then offer explicit guarded disposable system enrollment. */
export const prepareQualificationAptEnrollment = async (options: {
  candidates: [QualificationCandidate, QualificationCandidate, QualificationCandidate];
  bundleDirectories: [string, string, string];
  primaryFingerprint: string;
  signingFingerprint: string;
  publicKeyPath: string;
  runDirectory: string;
  origin: string;
}): Promise<QualificationAptEnrollment> => {
  const origin = new URL(options.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.hostname !== '127.0.0.1' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  ) {
    throw new Error('Qualification requires an isolated loopback HTTPS origin');
  }
  const runDirectory = resolve(options.runDirectory);
  await mkdir(runDirectory);
  const gnupgHome = join(runDirectory, 'public-keys');
  await admitQualificationAptPublicKey({ ...options, gnupgHome });
  const { channel } = options.candidates[0].manifest;
  if (options.candidates.some((candidate) => candidate.manifest.channel !== channel)) {
    throw new Error('APT qualification cannot cross channels');
  }
  const snapshotDirectories = ['A', 'B', 'C'].map((stage) => join(runDirectory, stage));
  const prepared = await Promise.allSettled(
    options.candidates.map(async (candidate, index) =>
      admitSnapshot({
        ...options,
        candidate,
        bundleDirectory: options.bundleDirectories[index]!,
        directory: snapshotDirectories[index]!,
        gnupgHome,
      }),
    ),
  );
  const repositories = prepared.map((result) => {
    if (result.status === 'rejected') {
      throw result.reason instanceof Error
        ? result.reason
        : new Error('APT snapshot preparation failed', { cause: result.reason });
    }
    return result.value;
  });
  const id = createHash('sha256').update(runDirectory).digest('hex').slice(0, 16);
  const owned = new Map<string, string>();
  const sudo = (args: string[]): string => command('sudo', ['-n', ...args]);
  const guard = (): void => {
    if (
      process.platform !== 'linux' ||
      process.arch !== 'x64' ||
      process.getuid?.() === 0 ||
      process.env['TAU_QUALIFICATION_DISPOSABLE_HOST'] !== '1'
    ) {
      throw new QualificationUnavailable('Ordinary-user disposable Linux x64 host required');
    }
    if (command('cat', ['/proc/1/comm']) !== 'systemd') {
      throw new QualificationUnavailable('Actual systemd host required');
    }
    sudo(['true']);
  };
  const install = async (path: string, content: string): Promise<void> => {
    const existing = command('sudo', ['-n', 'test', '!', '-e', path]);
    void existing;
    const source = join(runDirectory, `config-${owned.size}`);
    await writeFile(source, content, { flag: 'wx' });
    sudo(['install', '-D', '-m', '0644', source, path]);
    owned.set(path, createHash('sha256').update(content).digest('hex'));
  };
  return {
    repositories,
    snapshotDirectories,
    async enroll() {
      guard();
      if (owned.size > 0) {
        throw new Error('APT qualification enrollment already started');
      }
      const existing = await readdir('/etc/apt/sources.list.d');
      if (existing.some((name) => name.startsWith('tau'))) {
        throw new QualificationUnavailable('Existing Tau repository must be absent on disposable host');
      }
      for (const timer of ['apt-daily.timer', 'apt-daily-upgrade.timer']) {
        command('systemctl', ['is-enabled', '--quiet', timer]);
        command('systemctl', ['is-active', '--quiet', timer]);
      }
      command('which', ['unattended-upgrade']);
      const key = command('gpg', ['--homedir', gnupgHome, '--armor', '--export', options.primaryFingerprint]);
      const keyPath = `/etc/apt/keyrings/tau-qualification-${id}.asc`;
      await install(keyPath, key + '\n');
      const suite = channel === 'production' ? 'stable' : 'staging';
      const label = channel === 'production' ? 'TauProduction' : 'TauStaging';
      await install(
        `/etc/apt/sources.list.d/tau-qualification-${id}.sources`,
        `Types: deb\nURIs: ${origin.href}\nSuites: ${suite}\nComponents: main\nArchitectures: amd64\nSigned-By: ${keyPath}\n`,
      );
      await install(
        `/etc/apt/apt.conf.d/99tau-qualification-${id}`,
        `APT::Periodic::Update-Package-Lists "always";\nAPT::Periodic::Unattended-Upgrade "always";\nUnattended-Upgrade::Origins-Pattern { "origin=Tau,label=${label},codename=${suite},component=main"; };\n`,
      );
      /* oxlint-disable no-await-in-loop -- Timer enrollment and cleanup have ordered system side effects. */
      for (const timer of ['apt-daily.timer', 'apt-daily-upgrade.timer']) {
        await install(
          `/etc/systemd/system/${timer}.d/90-tau-qualification-${id}.conf`,
          '[Timer]\nOnCalendar=\nOnBootSec=30s\nOnUnitActiveSec=30s\nRandomizedDelaySec=0\nPersistent=false\n',
        );
      }
      /* oxlint-enable no-await-in-loop */
      sudo(['systemctl', 'daemon-reload']);
      sudo(['systemctl', 'restart', 'apt-daily.timer', 'apt-daily-upgrade.timer']);
      sudo(['apt-get', 'update', '--error-on=any']);
    },
    async cleanup() {
      guard();
      for (const [path, expected] of owned) {
        if (sudo(['sha256sum', path]).split(' ')[0] !== expected) {
          throw new Error(`Refusing changed qualification configuration: ${path}`);
        }
      }
      for (const path of owned.keys()) {
        sudo(['rm', '--', path]);
      }
      owned.clear();
      sudo(['systemctl', 'daemon-reload']);
      sudo(['systemctl', 'restart', 'apt-daily.timer', 'apt-daily-upgrade.timer']);
    },
  };
};
