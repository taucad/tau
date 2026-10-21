/** Build and publish cumulative APT snapshots through an explicit transport; never contacts hosting itself. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Adjacent packaging script is not an application module alias.
import { buildLinuxAptRepository } from './linux-apt-repository.mjs';
/* oxlint-disable no-restricted-imports -- Adjacent packaging scripts have no application module alias. */
import type {
  LinuxAptRepositoryInventory,
  LinuxAptRepositoryOptions,
  LinuxAptPublicationObject,
} from './linux-apt-repository.mjs';
/* oxlint-enable no-restricted-imports */

const sha256 = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const digestSchema = z.string().regex(/^[a-f\d]{64}$/u);
const retainedSchema = z.strictObject({ path: z.string(), sha256: digestSchema, size: z.number().int().nonnegative() });
const signedInventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  inReleaseSha256: digestSchema,
  inventory: z.unknown(),
});
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  channel: z.enum(['production', 'staging']),
  issuedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  signingFingerprint: z.string(),
  packages: z.array(
    z.strictObject({
      tag: z.string(),
      sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
      kind: z.enum(['linux-deb-runtime', 'linux-deb-selector']),
      name: z.string(),
      poolPath: z.string(),
      sha256: digestSchema,
      size: z.number().int().positive(),
    }),
  ),
  byHash: z.array(retainedSchema),
});
const command = (name: string, args: string[]): string =>
  execFileSync(name, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
const regularBytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('APT publication source must be a canonical regular file');
  }
  return Uint8Array.from(await readFile(path));
};
const verifyStagedObject = async (path: string, expected: LinuxAptPublicationObject): Promise<void> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('Staged APT object changed before publication');
  }
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new Error('Expected binary repository bytes');
    }
    size += chunk.byteLength;
    hash.update(chunk);
  }
  if (hash.digest('hex') !== expected.sha256 || size !== expected.size) {
    throw new Error('Staged APT object changed before publication');
  }
};
const withKeyring = async <T extends Record<string, unknown>>(
  home: string,
  fingerprint: string,
  operation: (scratch: string, keyring: string) => Promise<T>,
): Promise<T> => {
  z.string()
    .regex(/^(?:[A-F\d]{40}|[A-F\d]{64})$/u)
    .parse(fingerprint);
  const scratch = await mkdtemp(join(tmpdir(), 'tau-apt-publication-'));
  try {
    const keyring = join(scratch, 'trusted.gpg');
    execFileSync('gpg', ['--homedir', home, '--batch', '--output', keyring, '--export', fingerprint], {
      timeout: 120_000,
    });
    return await operation(scratch, keyring);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
const verifySignature = (options: { scratch: string; keyring: string; fingerprint: string }, paths: string[]): void => {
  const { scratch, keyring, fingerprint } = options;
  const status = command('gpgv', ['--homedir', scratch, '--keyring', keyring, '--status-fd', '1', ...paths]);
  if (!status.split('\n').some((line) => line.startsWith(`[GNUPG:] VALIDSIG ${fingerprint} `))) {
    throw new Error('APT snapshot signature does not match the exact configured key');
  }
};
/** Derive sidecar keys from the current signed pointer; no independently mutable inventory pointer exists. */
export const desktopAptSnapshotPrefix = (inRelease: Uint8Array<ArrayBuffer>): string =>
  `snapshots/${sha256(inRelease)}`;

/** Authenticate a previous inventory before returning the complete safe retrieval list. Historical expiry permits renewal only. */
export const readDesktopAptSnapshot = async (options: {
  inRelease: Uint8Array<ArrayBuffer>;
  signedInventory: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
  gnupgHome: string;
  signingFingerprint: string;
  channel: 'production' | 'staging';
}): Promise<{ inventory: LinuxAptRepositoryInventory; objects: Array<z.infer<typeof retainedSchema>> }> => {
  if (
    options.inRelease.byteLength > 65_536 ||
    options.signedInventory.byteLength > 4 * 1024 * 1024 ||
    options.signature.byteLength > 65_536
  ) {
    throw new Error('APT snapshot metadata exceeds bounded limits');
  }
  return withKeyring(options.gnupgHome, options.signingFingerprint, async (scratch, keyring) => {
    const inRelease = join(scratch, 'InRelease');
    const inventoryPath = join(scratch, 'inventory.json');
    const signaturePath = join(scratch, 'inventory.json.gpg');
    await Promise.all([
      writeFile(inRelease, options.inRelease),
      writeFile(inventoryPath, options.signedInventory),
      writeFile(signaturePath, options.signature),
    ]);
    verifySignature({ scratch, keyring, fingerprint: options.signingFingerprint }, [inRelease]);
    verifySignature({ scratch, keyring, fingerprint: options.signingFingerprint }, [signaturePath, inventoryPath]);
    const signed = signedInventorySchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(options.signedInventory)),
    );
    const inventory = inventorySchema.parse(signed.inventory);
    if (
      signed.inReleaseSha256 !== sha256(options.inRelease) ||
      inventory.channel !== options.channel ||
      inventory.signingFingerprint !== options.signingFingerprint
    ) {
      throw new Error('Signed APT snapshot identity does not match its pointer/channel/key');
    }
    const suite = options.channel === 'production' ? 'stable' : 'staging';
    const packagePrefix = options.channel === 'production' ? 'pool/main/t/tau/' : 'pool/main/t/tau-staging/';
    const objects = [
      ...inventory.packages.map((item) => ({ path: item.poolPath, sha256: item.sha256, size: item.size })),
      ...inventory.byHash,
    ];
    const seen = new Set<string>();
    for (const object of objects) {
      const safe = object.path.startsWith(packagePrefix)
        ? /^pool\/main\/t\/tau(?:-staging)?\/\d+\.\d+\.\d+\/[A-Za-z\d._-]+\.deb$/u.test(object.path)
        : object.path === `dists/${suite}/main/binary-amd64/by-hash/SHA256/${object.sha256}`;
      if (!safe || seen.has(object.path)) {
        throw new Error('Signed APT inventory has an unsafe or duplicate retrieval path');
      }
      seen.add(object.path);
    }
    return { inventory, objects };
  });
};

export type DesktopAptTransport = {
  /** Atomically replace mutable objects; immutable writes must reject conflicting existing bytes. Final pointer must compare its prior hash. */
  put: (
    // oxlint-disable-next-line no-restricted-types -- Explicit null means compare-and-swap against an absent remote pointer.
    object: LinuxAptPublicationObject & { sourcePath: string; expectedPreviousSha256?: string | null },
  ) => Promise<void>;
};
/** Build from exact manifest packages or renew a verified previous snapshot; caller retains qualification and hosting authority. */
export const prepareDesktopAptPublication = async (
  options: Omit<LinuxAptRepositoryOptions, 'packages' | 'previous'> & {
    manifest?: unknown;
    artifactDirectory?: string;
    previous?: {
      directory: string;
      inRelease: Uint8Array<ArrayBuffer>;
      signedInventory: Uint8Array<ArrayBuffer>;
      signature: Uint8Array<ArrayBuffer>;
    };
  },
): Promise<{
  inventory: LinuxAptRepositoryInventory;
  publication: LinuxAptPublicationObject[];
  publish: (transport: DesktopAptTransport) => Promise<void>;
}> => {
  const previous = options.previous ? await readDesktopAptSnapshot({ ...options, ...options.previous }) : undefined;
  if (!options.manifest && !previous) {
    throw new Error('APT renewal requires a previous authenticated snapshot');
  }
  const manifest = options.manifest ? parseDesktopArtifactManifest(options.manifest) : undefined;
  if (manifest && (manifest.channel !== options.channel || !options.artifactDirectory)) {
    throw new Error('APT candidate channel or artifact directory is invalid');
  }
  const packages =
    manifest?.artifacts
      .filter((item) => item.kind === 'linux-deb-runtime' || item.kind === 'linux-deb-selector')
      .map((item) => ({
        path: join(options.artifactDirectory!, item.name),
        tag: manifest.tag,
        sourceCommit: manifest.sourceCommit,
        kind: item.kind as 'linux-deb-runtime' | 'linux-deb-selector',
        sha256: item.sha256,
        size: item.size,
      })) ?? [];
  if (manifest && packages.length !== 2) {
    throw new Error('APT publication requires both exact candidate packages');
  }
  const built = await buildLinuxAptRepository({
    channel: options.channel,
    issuedAt: options.issuedAt,
    gnupgHome: options.gnupgHome,
    signingFingerprint: options.signingFingerprint,
    outputDirectory: options.outputDirectory,
    packages,
    ...(previous && options.previous
      ? { previous: { directory: options.previous.directory, inventory: previous.inventory } }
      : {}),
  });
  const suite = options.channel === 'production' ? 'stable' : 'staging';
  const pointerPath = `dists/${suite}/InRelease`;
  const pointer = await regularBytes(join(options.outputDirectory, pointerPath));
  const prefix = desktopAptSnapshotPrefix(pointer);
  const snapshotPointerPath = `${prefix}/InRelease`;
  const inventoryPath = `${prefix}/inventory.json`;
  const signaturePath = `${inventoryPath}.gpg`;
  const payload = JSON.stringify({ schemaVersion: 1, inReleaseSha256: sha256(pointer), inventory: built.inventory });
  await mkdir(dirname(join(options.outputDirectory, inventoryPath)), { recursive: true });
  await writeFile(join(options.outputDirectory, inventoryPath), payload, { flag: 'wx' });
  await writeFile(join(options.outputDirectory, snapshotPointerPath), pointer, { flag: 'wx' });
  command('gpg', [
    '--homedir',
    options.gnupgHome,
    '--batch',
    '--yes',
    '--local-user',
    `${options.signingFingerprint}!`,
    '--digest-algo',
    'SHA256',
    '--output',
    join(options.outputDirectory, signaturePath),
    '--detach-sign',
    join(options.outputDirectory, inventoryPath),
  ]);
  const signedInventory = await regularBytes(join(options.outputDirectory, inventoryPath));
  const signature = await regularBytes(join(options.outputDirectory, signaturePath));
  await readDesktopAptSnapshot({ ...options, inRelease: pointer, signedInventory, signature });
  const sidecars = [
    { path: snapshotPointerPath, sha256: sha256(pointer), size: pointer.byteLength, immutable: true },
    { path: inventoryPath, sha256: sha256(signedInventory), size: signedInventory.byteLength, immutable: true },
    { path: signaturePath, sha256: sha256(signature), size: signature.byteLength, immutable: true },
  ];
  const publication = [
    ...built.publication.filter((item) => item.immutable),
    ...sidecars,
    ...built.publication.filter((item) => !item.immutable),
  ];
  return {
    inventory: built.inventory,
    publication,
    async publish(transport) {
      for (const item of publication) {
        // oxlint-disable-next-line no-await-in-loop -- Verify and publish each dependency before advancing signed suite metadata.
        await verifyStagedObject(join(options.outputDirectory, item.path), item);
        // oxlint-disable-next-line no-await-in-loop -- InRelease is the final compare-and-swap commit after every preceding object is durable.
        await transport.put({
          ...item,
          sourcePath: join(options.outputDirectory, item.path),
          ...(item.path === pointerPath
            ? { expectedPreviousSha256: options.previous ? sha256(options.previous.inRelease) : null }
            : {}),
        });
      }
    },
  };
};
