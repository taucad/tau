import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import type { CopyReader, DestinationVersion } from '#api/git/mirror/destination.js';
import { parseSnapshotKey, repositoryPrefix } from '#api/git/mirror/keys.js';

/**
 * Reading the second copy back (W13 DR1, DR2): the snapshot discovery and the
 * per-version verification that restore and the verify drill share.
 *
 * Everything here trusts nothing about B2 but what it can prove. Discovery is
 * by **version** listing, never by name, so a hidden name is still found (W13
 * Finding 3). A snapshot is trusted only when its SHA-256 is the one the copier
 * recorded in `project_git.copied_manifest_sha256`. Among several versions of
 * one key, the version used is one that verifies against what names it, so a
 * newer version planted by a stolen copy key is skipped, not restored.
 */

/** The largest snapshot read: a manifest's push log spills at 16 KiB and its refs are bounded (D20). */
export const snapshotByteLimit = 16 * 1024 * 1024;

/** One version of one snapshot key. */
export type SnapshotVersion = DestinationVersion & {
  readonly generation: number;
  readonly incarnation: string;
};

/** A snapshot version read whole: its bytes' SHA-256 and their decoding. */
export type ReadSnapshot = {
  readonly version: SnapshotVersion;
  readonly sha256Hex: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly manifest: Manifest;
};

/** Every listed version under `prefix`, by key, newest first; hide markers counted apart. */
export type CopyIndex = {
  readonly versions: ReadonlyMap<string, readonly DestinationVersion[]>;
  readonly hidden: number;
};

const newestFirst = (left: DestinationVersion, right: DestinationVersion): number =>
  (right.modifiedAt?.getTime() ?? 0) - (left.modifiedAt?.getTime() ?? 0);

/** Lists every version under `prefix`. */
export const listCopy = async (copy: CopyReader, prefix: string, signal?: AbortSignal): Promise<CopyIndex> => {
  const versions = new Map<string, DestinationVersion[]>();
  let hidden = 0;
  for await (const version of copy.listVersions(prefix, signal)) {
    if (version.isHideMarker) {
      hidden += 1;
      continue;
    }
    const list = versions.get(version.key) ?? [];
    list.push(version);
    versions.set(version.key, list);
  }
  for (const list of versions.values()) {
    list.sort(newestFirst);
  }
  return { versions, hidden };
};

/** Every snapshot version a repository's listing holds, newest generation first, then newest version. */
export const snapshotVersions = (locator: RepositoryLocator, index: CopyIndex): SnapshotVersion[] => {
  const prefix = repositoryPrefix(locator);
  const found: SnapshotVersion[] = [];
  for (const [key, versions] of index.versions) {
    const parsed = key.startsWith(prefix) ? parseSnapshotKey(key.slice(prefix.length)) : undefined;
    if (parsed === undefined) {
      continue;
    }
    for (const version of versions) {
      found.push({ ...version, ...parsed });
    }
  }
  return found.sort((left, right) => right.generation - left.generation || newestFirst(left, right));
};

/** Reads one stream whole, refusing more than `limit` bytes. */
const readBounded = async (stream: Readable, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      const view = Buffer.from(chunk as Uint8Array<ArrayBuffer>);
      bytes += view.byteLength;
      if (bytes > limit) {
        throw new RangeError(`a snapshot above ${String(limit)} bytes is not a manifest`);
      }
      chunks.push(view);
    }
  } finally {
    stream.destroy();
  }
  return new Uint8Array(Buffer.concat(chunks));
};

/**
 * Reads one snapshot version and decodes it. The decoded generation and
 * incarnation must be the ones the key names: a snapshot stored under another
 * repository's or generation's name is refused.
 */
export const readSnapshot = async (
  copy: CopyReader,
  version: SnapshotVersion,
  signal?: AbortSignal,
): Promise<ReadSnapshot> => {
  const bytes = await readBounded(await copy.get(version.key, version.versionId, signal), snapshotByteLimit);
  const manifest = decodeManifest(bytes);
  if (manifest.generation !== version.generation || manifest.incarnation !== version.incarnation) {
    throw new Error(
      `snapshot '${version.key}' holds generation ${String(manifest.generation)} of incarnation ${manifest.incarnation}, not the one its key names`,
    );
  }
  return { version, bytes, manifest, sha256Hex: createHash('sha256').update(bytes).digest('hex') };
};

/** The first snapshot among `versions` whose SHA-256 is `sha256Hex`, read in the order given. */
// oxlint-disable-next-line max-params -- the reader, the candidates, the digest sought and cancellation
export const findSnapshot = async (
  copy: CopyReader,
  versions: readonly SnapshotVersion[],
  sha256Hex: string,
  signal?: AbortSignal,
): Promise<ReadSnapshot | undefined> => {
  for (const version of versions) {
    // oxlint-disable-next-line no-await-in-loop -- small objects, read until one matches
    const read = await readSnapshot(copy, version, signal).catch(() => undefined);
    if (read?.sha256Hex === sha256Hex) {
      return read;
    }
  }
  return undefined;
};

/** What one streamed read of a stored object proves about it. */
export type ObjectDigest = {
  readonly bytes: number;
  readonly sha256Hex: string;
  /** SHA-1 of everything before the last 20 bytes: a pack's (and an index's) own checksum. */
  readonly leadingSha1: string;
  /** The last 20 bytes, hex. */
  readonly trailer: string;
  /** The 20 bytes before the trailer, hex: in a pack index, the checksum of its pack. */
  readonly beforeTrailer: string;
};

const trailerBytes = 20;

/**
 * Digests one stream in a single pass, holding at most one chunk and 40 bytes.
 * `onChunk` sees every chunk in order, so a caller can feed a verifier from the
 * same read.
 */
export const digestStream = async (
  stream: Readable,
  onChunk?: (chunk: Uint8Array<ArrayBuffer>) => Promise<void> | void,
): Promise<ObjectDigest> => {
  const sha256 = createHash('sha256');
  const sha1 = createHash('sha1');
  let held = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  let bytes = 0;
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('unexpected readable chunk');
    }
    const view = Buffer.from(chunk.buffer as ArrayBuffer, chunk.byteOffset, chunk.byteLength);
    sha256.update(view);
    bytes += view.byteLength;
    // oxlint-disable-next-line no-await-in-loop -- the verifier's backpressure bounds memory
    await onChunk?.(view);
    const pending = Buffer.concat([held, view]);
    const release = Math.max(0, pending.byteLength - 2 * trailerBytes);
    const released = pending.subarray(0, release);
    sha1.update(released);
    if (released.byteLength >= trailerBytes) {
      previous = Buffer.from(released.subarray(-trailerBytes));
    } else if (released.byteLength > 0) {
      previous = Buffer.from(Buffer.concat([previous, released]).subarray(-trailerBytes));
    }
    held = Buffer.from(pending.subarray(release));
  }
  // `held` is the last 40 bytes (or the whole object when shorter).
  const leading = held.subarray(0, Math.max(0, held.byteLength - trailerBytes));
  sha1.update(leading);
  const tail = Buffer.concat([previous, leading]).subarray(-trailerBytes);
  return {
    bytes,
    sha256Hex: sha256.digest('hex'),
    leadingSha1: sha1.digest('hex'),
    trailer: held.byteLength >= trailerBytes ? held.subarray(-trailerBytes).toString('hex') : '',
    beforeTrailer: tail.byteLength === trailerBytes && bytes >= 2 * trailerBytes ? tail.toString('hex') : '',
  };
};

/** `pack-<40 hex>` out of a `packs/…` key: the SHA-1 git derived the name from. */
export const packHash = (key: string): string | undefined => /(?:^|\/)packs\/pack-([\da-f]{40})-/u.exec(key)?.[1];

/** A pack whose bytes are the length the manifest records and hash to the name git gave them. */
export const packVerifies = (digest: ObjectDigest, sha1: string, bytes: number): boolean =>
  digest.bytes === bytes && digest.leadingSha1 === sha1 && digest.trailer === sha1;

/** A version 2 pack index that checksums itself and names the pack `sha1`. */
export const indexVerifies = (digest: ObjectDigest, sha1: string): boolean =>
  digest.leadingSha1 === digest.trailer && digest.beforeTrailer === sha1;

/** An LFS object that is its oid. */
export const lfsVerifies = (digest: ObjectDigest, oid: string, bytes?: number): boolean =>
  digest.sha256Hex === oid && (bytes === undefined || digest.bytes === bytes);
