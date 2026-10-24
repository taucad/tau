/**
 * Purpose: Build and verify a signed, cumulative Tau APT snapshot without publishing it.
 * Inputs: explicit channel/date, external GNUPGHOME and exact signing fingerprint, verified package manifest bytes.
 * Usage: imported by the desktop publication owner; test via desktop:test-linux-apt-repository.
 * Output: a new directory and ordered publication inventory; errors reject without changing any repository.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { linuxDebKinds, linuxInstallation } from '#shared/linux-installation.js';
import { desktopArtifactName, desktopReleaseIdentity } from '#shared/desktop-release.js';

const hashSchema = z.string().regex(/^[a-f\d]{64}$/u);
const packageSchema = z.strictObject({
  tag: z.string(),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  kind: z.enum(linuxDebKinds),
  name: z.string(),
  poolPath: z.string(),
  sha256: hashSchema,
  size: z.number().int().positive(),
});
const objectSchema = z.strictObject({ path: z.string(), sha256: hashSchema, size: z.number().int().nonnegative() });
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  channel: z.enum(['production', 'staging']),
  issuedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  signingFingerprint: z.string().regex(/^(?:[A-F\d]{40}|[A-F\d]{64})$/u),
  packages: z.array(packageSchema),
  byHash: z.array(objectSchema),
});
export type LinuxAptRepositoryInventory = z.infer<typeof inventorySchema>;
export type LinuxAptRepositoryPackage = Omit<z.infer<typeof packageSchema>, 'name' | 'poolPath'> & { path: string };
export type LinuxAptRepositoryOptions = {
  channel: 'production' | 'staging';
  issuedAt: string;
  gnupgHome: string;
  signingFingerprint: string;
  outputDirectory: string;
  packages: readonly LinuxAptRepositoryPackage[];
  previous?: { directory: string; inventory: unknown };
};
export type LinuxAptPublicationObject = z.infer<typeof objectSchema> & { immutable: boolean };

const digest = async (path: string): Promise<{ sha256: string; size: number }> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('Repository inputs must be regular files without symlink traversal');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected package bytes');
    }
    hash.update(chunk);
  }
  return { sha256: hash.digest('hex'), size: info.size };
};
const command = (name: string, args: string[]): string =>
  execFileSync(name, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120_000 });
const verifyObject = async (path: string, expected: { sha256: string; size: number }): Promise<void> => {
  const actual = await digest(path);
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) {
    throw new Error('Repository package/index bytes differ from the manifest');
  }
};
const packageLocation = (
  value: Pick<z.infer<typeof packageSchema>, 'tag' | 'kind'>,
  channel: 'production' | 'staging',
) => {
  const identity = desktopReleaseIdentity(value.tag);
  if (identity.channel !== channel) {
    throw new Error('APT package belongs to another channel');
  }
  const name = desktopArtifactName({ ...identity, kind: value.kind, arch: 'x64' });
  return {
    identity,
    name,
    poolPath: `pool/main/t/tau${channel === 'staging' ? '-staging' : ''}/${identity.version}/${name}`,
  };
};

/** Build immutable pool/index objects first; advance signed suite metadata only after every earlier object is public. */
export const buildLinuxAptRepository = async (
  options: LinuxAptRepositoryOptions,
): Promise<{ inventory: LinuxAptRepositoryInventory; publication: LinuxAptPublicationObject[] }> => {
  const { channel, outputDirectory, gnupgHome, signingFingerprint } = options;
  z.enum(['production', 'staging']).parse(channel);
  z.string()
    .regex(/^(?:[A-F\d]{40}|[A-F\d]{64})$/u)
    .parse(signingFingerprint);
  const issuedAt = z.iso.datetime().parse(options.issuedAt);
  const issuedMilliseconds = Date.parse(issuedAt);
  if (!Number.isFinite(issuedMilliseconds) || !isAbsolute(outputDirectory) || !isAbsolute(gnupgHome)) {
    throw new TypeError('Repository paths/date must be explicit and absolute');
  }
  if ((await realpath(gnupgHome)) !== resolve(gnupgHome)) {
    throw new Error('GNUPGHOME must not traverse symlinks');
  }
  const validUntil = new Date(issuedMilliseconds + 7 * 24 * 60 * 60 * 1000).toISOString();
  const suite = channel === 'staging' ? 'staging' : 'stable';
  const label = channel === 'staging' ? 'TauStaging' : 'TauProduction';
  const root = await realpath(dirname(outputDirectory));
  if (join(root, outputDirectory.slice(dirname(outputDirectory).length + 1)) !== resolve(outputDirectory)) {
    throw new Error('Output parent must not traverse symlinks');
  }
  await mkdir(outputDirectory);
  const scratch = await mkdtemp(join(tmpdir(), 'tau-apt-sign-'));
  try {
    const packages = new Map<string, z.infer<typeof packageSchema>>();
    const byHash = new Map<string, z.infer<typeof objectSchema>>();
    const publication: LinuxAptPublicationObject[] = [];
    const put = async (
      path: string,
      bytes: Uint8Array<ArrayBuffer> | string,
      immutable: boolean,
    ): Promise<z.infer<typeof objectSchema>> => {
      const destination = join(outputDirectory, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: 'wx' });
      const object = { path, ...(await digest(destination)) };
      publication.push({ ...object, immutable });
      return object;
    };
    const copy = async (source: string, path: string, expected: { sha256: string; size: number }): Promise<void> => {
      await verifyObject(source, expected);
      const destination = join(outputDirectory, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      await verifyObject(destination, expected);
    };
    if (options.previous) {
      const previous = inventorySchema.parse(options.previous.inventory);
      if (previous.channel !== channel || Date.parse(previous.issuedAt) >= issuedMilliseconds) {
        throw new Error('Repository renewal must advance its existing channel date');
      }
      const previousRoot = await realpath(options.previous.directory);
      if (!isAbsolute(options.previous.directory) || previousRoot !== resolve(options.previous.directory)) {
        throw new Error('Previous repository must not traverse symlinks');
      }
      for (const item of previous.packages) {
        const location = packageLocation(item, channel);
        if (item.name !== location.name || item.poolPath !== location.poolPath || packages.has(item.poolPath)) {
          throw new Error('Invalid retained package path or identity');
        }
        // oxlint-disable-next-line no-await-in-loop -- Validate each retained immutable object before making it a publication input.
        await copy(join(previousRoot, item.poolPath), item.poolPath, item);
        packages.set(item.poolPath, item);
      }
      for (const item of previous.byHash) {
        if (item.path !== `dists/${suite}/main/binary-amd64/by-hash/SHA256/${item.sha256}` || byHash.has(item.path)) {
          throw new Error('Invalid retained by-hash path');
        }
        // oxlint-disable-next-line no-await-in-loop -- Retain every prior immutable index for cached Release clients.
        await copy(join(previousRoot, item.path), item.path, item);
        byHash.set(item.path, item);
      }
    }
    for (const input of options.packages) {
      if (!isAbsolute(input.path)) {
        throw new TypeError('Package input paths must be absolute');
      }
      const location = packageLocation(input, channel);
      const { path: inputPath, ...identity } = input;
      const item = packageSchema.parse({ ...identity, name: location.name, poolPath: location.poolPath });
      const existing = packages.get(item.poolPath);
      if (existing) {
        if (
          existing.sha256 !== item.sha256 ||
          existing.size !== item.size ||
          existing.sourceCommit !== item.sourceCommit ||
          existing.tag !== item.tag
        ) {
          throw new Error('Immutable package collision');
        }
        // oxlint-disable-next-line no-await-in-loop -- Repeated manifest inputs must still prove their current bytes.
        await verifyObject(inputPath, item);
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- Packages are copied serially to keep bounded memory and verify exact source bytes.
      await copy(inputPath, item.poolPath, item);
      packages.set(item.poolPath, item);
    }
    if (packages.size === 0) {
      throw new Error('APT repository requires both package roles');
    }
    const paragraphs: string[] = [];
    const versions = new Map<string, Set<string>>();
    const generationSources = new Map<string, string>();
    for (const item of packages.values()) {
      const { version } = packageLocation(item, channel).identity;
      const generationSource = `${item.tag}:${item.sourceCommit}`;
      if (generationSources.has(version) && generationSources.get(version) !== generationSource) {
        throw new Error('Generation package sources disagree');
      }
      generationSources.set(version, generationSource);
      const appImage = item.kind.startsWith('linux-appimage-');
      const generation = `${version}:${appImage ? 'appimage' : 'directory'}`;
      const roles = versions.get(generation) ?? new Set<string>();
      roles.add(item.kind);
      versions.set(generation, roles);
      const { name, runtimeKind, selectorKind } = linuxInstallation(channel, appImage);
      const path = join(outputDirectory, item.poolPath);
      const field = (key: string): string => command('dpkg-deb', ['--field', path, key]).trim();
      const packageName = item.kind === runtimeKind ? `${name}-runtime-${version}` : name;
      if (
        field('Package') !== packageName ||
        field('Version') !== version ||
        field('Architecture') !== 'amd64' ||
        (item.kind === selectorKind &&
          !field('Depends')
            .split(',')
            .map((value) => value.trim())
            .includes(`${name}-runtime-${version} (= ${version})`))
      ) {
        throw new Error('Debian package metadata disagrees with its manifest');
      }
      const control = command('dpkg-deb', ['--field', path]).trimEnd();
      if (/^(?:Filename|Size|SHA256):/mu.test(control) || /\n\s*\n/u.test(control)) {
        throw new Error('Unexpected reserved package control fields');
      }
      paragraphs.push(`${control}\nFilename: ${item.poolPath}\nSize: ${item.size}\nSHA256: ${item.sha256}\n`);
    }
    if ([...versions.values()].some((roles) => roles.size !== 2)) {
      throw new Error('Every APT generation requires selector and runtime packages');
    }
    const text = paragraphs.sort().join('\n') + '\n';
    const prefix = `dists/${suite}/main/binary-amd64`;
    const indexes = [];
    for (const [name, bytes] of [
      ['Packages', Buffer.from(text)],
      ['Packages.gz', gzipSync(text, { level: 9 })],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- The two indexes are small and share one publication transaction.
      const index = await put(`${prefix}/${name}`, Uint8Array.from(bytes), false);
      indexes.push(index);
      const hashPath = `${prefix}/by-hash/SHA256/${index.sha256}`;
      if (!byHash.has(hashPath)) {
        // oxlint-disable-next-line no-await-in-loop -- Persist hash-addressed bytes before signed metadata references them.
        const object = await put(hashPath, Uint8Array.from(bytes), true);
        byHash.set(hashPath, object);
      }
    }
    const releasePath = `dists/${suite}/Release`;
    const release = `Origin: Tau\nLabel: ${label}\nSuite: ${suite}\nCodename: ${suite}\nDate: ${new Date(issuedAt).toUTCString()}\nValid-Until: ${new Date(validUntil).toUTCString()}\nArchitectures: amd64\nComponents: main\nAcquire-By-Hash: yes\nSHA256:\n${indexes.map((item) => ` ${item.sha256} ${item.size} ${item.path.slice(`dists/${suite}/`.length)}`).join('\n')}\n`;
    await put(releasePath, release, false);
    const signingArgs = [
      '--batch',
      '--no-tty',
      '--homedir',
      gnupgHome,
      '--local-user',
      `${signingFingerprint}!`,
      '--digest-algo',
      'SHA256',
    ];
    command('gpg', [
      ...signingArgs,
      '--output',
      join(outputDirectory, `${releasePath}.gpg`),
      '--detach-sign',
      join(outputDirectory, releasePath),
    ]);
    command('gpg', [
      ...signingArgs,
      '--output',
      join(outputDirectory, `dists/${suite}/InRelease`),
      '--clearsign',
      join(outputDirectory, releasePath),
    ]);
    const keyring = join(scratch, 'trusted.gpg');
    execFileSync('gpg', ['--batch', '--homedir', gnupgHome, '--output', keyring, '--export', signingFingerprint], {
      timeout: 120_000,
    });
    for (const args of [
      [join(outputDirectory, `${releasePath}.gpg`), join(outputDirectory, releasePath)],
      [join(outputDirectory, `dists/${suite}/InRelease`)],
    ]) {
      const verdict = command('gpgv', ['--homedir', scratch, '--keyring', keyring, '--status-fd', '1', ...args]);
      if (!verdict.split('\n').some((line) => line.startsWith(`[GNUPG:] VALIDSIG ${signingFingerprint} `))) {
        throw new Error('Produced repository signature does not match the configured signing key');
      }
    }
    for (const path of [`${releasePath}.gpg`, `dists/${suite}/InRelease`]) {
      // oxlint-disable-next-line no-await-in-loop -- Hash verified signed objects last.
      publication.push({ path, ...(await digest(join(outputDirectory, path))), immutable: false });
    }
    const inventory = inventorySchema.parse({
      schemaVersion: 1,
      channel,
      issuedAt,
      validUntil,
      signingFingerprint,
      packages: [...packages.values()],
      byHash: [...byHash.values()],
    });
    const immutable = [
      ...inventory.packages.map((item) => ({
        path: item.poolPath,
        sha256: item.sha256,
        size: item.size,
        immutable: true,
      })),
      ...inventory.byHash.map((item) => ({ ...item, immutable: true })),
    ];
    return { inventory, publication: [...immutable, ...publication.filter((item) => !item.immutable)] };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
