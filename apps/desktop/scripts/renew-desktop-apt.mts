/** Renew authenticated APT metadata without downloading or rebuilding retained packages or indexes. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
/* oxlint-disable no-restricted-imports -- Adjacent script owners provide the authenticated snapshot and publication contracts. */
import { desktopAptSnapshotPrefix, readDesktopAptSnapshot } from './desktop-apt-publication.mjs';
import type { DesktopAptTransport } from './desktop-apt-publication.mjs';
import type { LinuxAptPublicationObject, LinuxAptRepositoryInventory } from './linux-apt-repository.mjs';
/* oxlint-enable no-restricted-imports */

const hash = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const command = (args: string[]): string =>
  execFileSync('gpg', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
const bytes = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
  const info = await lstat(path);
  if (!info.isFile() || (await realpath(path)) !== resolve(path)) {
    throw new Error('Renewal metadata must be a canonical regular file');
  }
  return Uint8Array.from(await readFile(path));
};

/** Preserve the authenticated repository closure; only validity times and signatures change. */
export const renewDesktopApt = async (options: {
  inRelease: Uint8Array<ArrayBuffer>;
  signedInventory: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
  gnupgHome: string;
  signingFingerprint: string;
  channel: 'production' | 'staging';
  issuedAt: string;
  outputDirectory: string;
}): Promise<{
  inventory: LinuxAptRepositoryInventory;
  publication: LinuxAptPublicationObject[];
  publish: (transport: DesktopAptTransport) => Promise<void>;
}> => {
  const previous = await readDesktopAptSnapshot(options);
  const issued = Date.parse(options.issuedAt);
  if (
    !Number.isFinite(issued) ||
    new Date(issued).toISOString() !== options.issuedAt ||
    issued > Date.now() + 300_000 ||
    issued + 7 * 86_400_000 <= Date.now() ||
    issued <= Date.parse(previous.inventory.issuedAt)
  ) {
    throw new Error('Invalid or non-increasing APT renewal issue time');
  }
  const validUntil = new Date(issued + 7 * 86_400_000).toISOString();
  const { outputDirectory, gnupgHome, signingFingerprint } = options;
  if (
    !isAbsolute(outputDirectory) ||
    !isAbsolute(gnupgHome) ||
    (await realpath(gnupgHome)) !== resolve(gnupgHome) ||
    (await realpath(dirname(outputDirectory))) !== dirname(resolve(outputDirectory))
  ) {
    throw new Error('Renewal paths must be absolute and canonical');
  }
  await mkdir(outputDirectory);
  const oldPointer = join(outputDirectory, 'previous.InRelease');
  await writeFile(oldPointer, options.inRelease, { flag: 'wx' });
  // Authentication above uses an exported exact-key gpgv keyring. Decrypt only extracts that verified cleartext.
  const release = command(['--batch', '--homedir', gnupgHome, '--decrypt', oldPointer]);
  const suite = options.channel === 'production' ? 'stable' : 'staging';
  const label = options.channel === 'production' ? 'TauProduction' : 'TauStaging';
  const fields = (key: string): string[] =>
    release
      .split('\n')
      .filter((line) => line.startsWith(`${key}: `))
      .map((line) => line.slice(key.length + 2));
  for (const [key, value] of [
    ['Origin', 'Tau'],
    ['Label', label],
    ['Suite', suite],
    ['Codename', suite],
    ['Date', new Date(previous.inventory.issuedAt).toUTCString()],
    ['Valid-Until', new Date(previous.inventory.validUntil).toUTCString()],
  ] as const) {
    const values = fields(key);
    if (values.length !== 1 || values[0] !== value) {
      throw new Error('Authenticated Release and inventory identity/times disagree');
    }
  }
  const renewed = release
    .replace(/^Date: .*$/mu, `Date: ${new Date(issued).toUTCString()}`)
    .replace(/^Valid-Until: .*$/mu, `Valid-Until: ${new Date(validUntil).toUTCString()}`);
  const releasePath = `dists/${suite}/Release`;
  const pointerPath = `dists/${suite}/InRelease`;
  await mkdir(dirname(join(outputDirectory, releasePath)), { recursive: true });
  await writeFile(join(outputDirectory, releasePath), renewed, { flag: 'wx' });
  const signing = [
    '--batch',
    '--no-tty',
    '--homedir',
    gnupgHome,
    '--local-user',
    `${signingFingerprint}!`,
    '--digest-algo',
    'SHA256',
  ];
  command([
    ...signing,
    '--output',
    join(outputDirectory, `${releasePath}.gpg`),
    '--detach-sign',
    join(outputDirectory, releasePath),
  ]);
  command([
    ...signing,
    '--output',
    join(outputDirectory, pointerPath),
    '--clearsign',
    join(outputDirectory, releasePath),
  ]);
  const inRelease = await bytes(join(outputDirectory, pointerPath));
  const prefix = desktopAptSnapshotPrefix(inRelease);
  const inventory: LinuxAptRepositoryInventory = { ...previous.inventory, issuedAt: options.issuedAt, validUntil };
  await mkdir(join(outputDirectory, prefix), { recursive: true });
  await writeFile(join(outputDirectory, prefix, 'InRelease'), inRelease, { flag: 'wx' });
  const inventoryPath = `${prefix}/inventory.json`;
  const signaturePath = `${inventoryPath}.gpg`;
  await writeFile(
    join(outputDirectory, inventoryPath),
    JSON.stringify({ schemaVersion: 1, inReleaseSha256: hash(inRelease), inventory }),
    { flag: 'wx' },
  );
  command([
    ...signing,
    '--output',
    join(outputDirectory, signaturePath),
    '--detach-sign',
    join(outputDirectory, inventoryPath),
  ]);
  await readDesktopAptSnapshot({
    ...options,
    inRelease,
    signedInventory: await bytes(join(outputDirectory, inventoryPath)),
    signature: await bytes(join(outputDirectory, signaturePath)),
  });
  const publication = await Promise.all(
    [`${prefix}/InRelease`, inventoryPath, signaturePath, releasePath, `${releasePath}.gpg`, pointerPath].map(
      async (path) => {
        const data = await bytes(join(outputDirectory, path));
        return { path, size: data.byteLength, sha256: hash(data), immutable: path.startsWith('snapshots/') };
      },
    ),
  );
  return {
    inventory,
    publication,
    async publish(transport) {
      // Check the complete tiny metadata set before any external mutation.
      await Promise.all(
        publication.map(async (object) => {
          const data = await bytes(join(outputDirectory, object.path));
          if (data.byteLength !== object.size || hash(data) !== object.sha256) {
            throw new Error('Renewal metadata changed before publication');
          }
        }),
      );
      for (const object of publication) {
        // oxlint-disable-next-line no-await-in-loop -- Sidecars and Release pair precede the final compare-and-swap InRelease pointer.
        await transport.put({
          ...object,
          sourcePath: join(outputDirectory, object.path),
          ...(object.path === pointerPath ? { expectedPreviousSha256: hash(options.inRelease) } : {}),
        });
      }
    },
  };
};
