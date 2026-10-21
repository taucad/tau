/**
 * Prepare private qualification APT artifacts using only a certified online signing subkey; never publishes.
 * Usage: desktop:qualification-apt-snapshot --args=--prepare.
 * Requires DESKTOP_ASSETS_DIR, GNUPGHOME, TAU_APT_PRIMARY_FINGERPRINT and TAU_APT_SIGNING_FINGERPRINT.
 * Exit 1 rejects missing inputs, secret primary material, package identity or native signing failures.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Qualification snapshot delegates repository signing to its existing owner. */
import { desktopAptSnapshotPrefix, prepareDesktopAptPublication } from './desktop-apt-publication.mjs';
/* oxlint-enable no-restricted-imports */
const fingerprintSchema = z.string().regex(/^[A-F\d]{40}$/u);
const command = (args: string[]): string => execFileSync('gpg', args, { encoding: 'utf8', timeout: 120_000 });
const hashFile = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error('Expected binary data');
    }
    hash.update(bytes);
  }
  return hash.digest('hex');
};
const usableSigningRecord = (record: string[]): boolean =>
  Boolean(record[11]?.includes('s')) && record[14] === '+' && !['r', 'e', 'd'].includes(record[1] ?? '');
/** Refuse a primary private key, unrelated subkey, or ambiguous signing identity. */
export const verifyQualificationAptSigner = (home: string, primary: string, signing: string): void => {
  fingerprintSchema.parse(primary);
  fingerprintSchema.parse(signing);
  if (primary === signing) {
    throw new Error('APT qualification requires a distinct signing subkey');
  }
  const rows = command(['--homedir', home, '--batch', '--with-colons', '--list-secret-keys'])
    .split('\n')
    .map((line) => line.split(':'));
  let primarySeen = false;
  let signingSeen = false;
  let record: string[] | undefined;
  for (const row of rows) {
    if (row[0] === 'sec' || row[0] === 'ssb') {
      record = row;
    }
    if (row[0] !== 'fpr' || !record) {
      continue;
    }
    if (record[0] === 'sec') {
      if (primarySeen || row[9] !== primary || record[14] !== '#') {
        throw new Error('Only a stub for the approved offline primary key is permitted');
      }
      primarySeen = true;
    } else if (row[9] === signing) {
      if (!primarySeen || !usableSigningRecord(record)) {
        throw new Error('Approved online signing subkey is unavailable or invalid');
      }
      signingSeen = true;
    } else if (record[14] !== '#') {
      throw new Error('Unapproved usable secret subkey in qualification signer home');
    }
    record = undefined;
  }
  if (!primarySeen || !signingSeen) {
    throw new Error('Approved primary/signing subkey relationship missing');
  }
};
/** Package a signed repository and public verification material in a flat authenticated CI artifact bundle. */
export const prepareQualificationAptSnapshot = async (options: {
  manifest: unknown;
  artifactDirectory: string;
  gnupgHome: string;
  primaryFingerprint: string;
  signingFingerprint: string;
  issuedAt: string;
  outputDirectory: string;
}): Promise<void> => {
  const manifest = parseDesktopArtifactManifest(options.manifest);
  verifyQualificationAptSigner(options.gnupgHome, options.primaryFingerprint, options.signingFingerprint);
  const scratch = await mkdtemp(join(tmpdir(), 'tau-qualification-apt-'));
  try {
    const repository = join(scratch, 'repository');
    const prepared = await prepareDesktopAptPublication({
      ...options,
      channel: manifest.channel,
      outputDirectory: repository,
    });
    await mkdir(options.outputDirectory, { recursive: true });
    const suite = manifest.channel === 'production' ? 'stable' : 'staging';
    const inRelease = Uint8Array.from(await readFile(join(repository, `dists/${suite}/InRelease`)));
    const prefix = desktopAptSnapshotPrefix(inRelease);
    const archive = join(scratch, 'qualification-apt-snapshot.tar');
    execFileSync('tar', ['-cf', archive, '-C', repository, '.'], { timeout: 180_000 });
    const archiveInfo = await lstat(archive);
    const metadata = {
      schemaVersion: 1,
      tag: manifest.tag,
      channel: manifest.channel,
      version: manifest.version,
      sourceCommit: manifest.sourceCommit,
      manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
      archiveSha256: await hashFile(archive),
      archiveSize: archiveInfo.size,
      primaryFingerprint: options.primaryFingerprint,
      signingFingerprint: options.signingFingerprint,
      issuedAt: prepared.inventory.issuedAt,
      validUntil: prepared.inventory.validUntil,
      snapshotPrefix: prefix,
    };
    const publicKey = command([
      '--homedir',
      options.gnupgHome,
      '--batch',
      '--armor',
      '--export',
      options.primaryFingerprint,
    ]);
    if (!publicKey.includes('BEGIN PGP PUBLIC KEY BLOCK')) {
      throw new Error('Public key export unavailable');
    }
    await writeFile(join(options.outputDirectory, 'qualification-apt-public.asc'), publicKey, { flag: 'wx' });
    await writeFile(join(options.outputDirectory, 'qualification-apt-snapshot.json'), JSON.stringify(metadata), {
      flag: 'wx',
    });
    await copyFile(archive, join(options.outputDirectory, 'qualification-apt-snapshot.tar'), constants.COPYFILE_EXCL);
    await copyFile(
      join(repository, prefix, 'inventory.json'),
      join(options.outputDirectory, 'qualification-apt-inventory.json'),
      constants.COPYFILE_EXCL,
    );
    await copyFile(
      join(repository, prefix, 'inventory.json.gpg'),
      join(options.outputDirectory, 'qualification-apt-inventory.json.gpg'),
      constants.COPYFILE_EXCL,
    );
    await writeFile(join(options.outputDirectory, 'qualification-apt-InRelease'), inRelease, { flag: 'wx' });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
const main = async (): Promise<void> => {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Set ${name} before preparing a signed qualification snapshot`);
    }
    return value;
  };
  const root = resolve(required('DESKTOP_ASSETS_DIR'));
  await prepareQualificationAptSnapshot({
    manifest: JSON.parse(await readFile(join(root, 'desktop-artifacts.json'), 'utf8')) as unknown,
    artifactDirectory: root,
    outputDirectory: root,
    gnupgHome: required('GNUPGHOME'),
    primaryFingerprint: required('TAU_APT_PRIMARY_FINGERPRINT'),
    signingFingerprint: required('TAU_APT_SIGNING_FINGERPRINT'),
    issuedAt: new Date().toISOString(),
  });
};
if (
  process.argv.includes('--prepare') &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
