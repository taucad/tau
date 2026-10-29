import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { MirrorDestination } from '#api/git/mirror/destination.js';
import { MirrorFailure, failAt } from '#api/git/mirror/failure.js';

/**
 * One object from the primary to the copy, verified before and after the write
 * (W13 Finding 2, step 4).
 *
 * Before: a pack must hash to the SHA-1 git named it with (its trailing 20 bytes
 * and the digest of everything before them), and an LFS object to its own
 * SHA-256 `oid`. Every object's SHA-256 is taken on the way, and the copy is
 * written under it, so the destination refuses bytes that changed between the
 * read and the write. After: a `HEAD` of the new version must report the same
 * length, and the same SHA-256 when the store keeps it.
 *
 * Objects up to {@link bufferedObjectBytes} are read once and held; larger ones
 * are read twice and held never, so memory does not follow a 1 GiB pack (DA4).
 */
export const bufferedObjectBytes = 8 * 1024 * 1024;

/** What the bytes must prove about themselves. */
export type Verification =
  | { readonly kind: 'pack'; readonly sha1: string }
  | { readonly kind: 'lfs'; readonly sha256Hex: string }
  | { readonly kind: 'none' };

/** A pack key's `pack-<sha1>-…` name; `undefined` when the key carries no hash. */
export const packNameHash = (key: string): string | undefined => /^packs\/pack-([\da-f]{40})-/u.exec(key)?.[1];

const trailerBytes = 20;

type Scanned = {
  readonly bytes: number;
  readonly sha256: string;
  readonly sha256Hex: string;
  readonly packDigest: string;
  readonly packTrailer: string;
  readonly held?: Uint8Array<ArrayBuffer>;
};

/** One streamed read: length, SHA-256, and git's pack checksum; keeps the bytes while they fit `limit`. */
const scan = async (stream: Readable, limit: number): Promise<Scanned> => {
  const sha256 = createHash('sha256');
  const sha1 = createHash('sha1');
  let chunks: Array<Uint8Array<ArrayBuffer>> | undefined = [];
  let tail = Buffer.alloc(0);
  let bytes = 0;
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('unexpected readable chunk');
    }
    const view = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    sha256.update(view);
    bytes += view.byteLength;
    if (chunks !== undefined) {
      if (bytes <= limit) {
        chunks.push(new Uint8Array(view));
      } else {
        chunks = undefined;
      }
    }
    const pending = Buffer.concat([tail, view]);
    const release = Math.max(0, pending.byteLength - trailerBytes);
    sha1.update(pending.subarray(0, release));
    tail = Buffer.from(pending.subarray(release));
  }
  const digest = sha256.digest();
  return {
    bytes,
    sha256: digest.toString('base64'),
    sha256Hex: digest.toString('hex'),
    packDigest: sha1.digest('hex'),
    packTrailer: tail.byteLength === trailerBytes ? tail.toString('hex') : '',
    ...(chunks === undefined ? {} : { held: new Uint8Array(Buffer.concat(chunks)) }),
  };
};

// oxlint-disable-next-line max-params -- one object's key, its scan, and what to check it against
const verify = (key: string, scanned: Scanned, verification: Verification, expectedBytes?: number): void => {
  if (expectedBytes !== undefined && scanned.bytes !== expectedBytes) {
    throw new MirrorFailure(
      'verify',
      'checksum',
      `'${key}' is ${String(scanned.bytes)} bytes in the primary, not the ${String(expectedBytes)} recorded`,
    );
  }
  if (
    verification.kind === 'pack' &&
    (scanned.packDigest !== verification.sha1 || scanned.packTrailer !== verification.sha1)
  ) {
    throw new MirrorFailure('verify', 'checksum', `pack '${key}' does not hash to the name it is stored under`);
  }
  if (verification.kind === 'lfs' && scanned.sha256Hex !== verification.sha256Hex) {
    throw new MirrorFailure('verify', 'checksum', `LFS object '${key}' does not hash to its oid`);
  }
};

export type TransferArguments = {
  readonly destination: MirrorDestination;
  /** The destination bucket key. */
  readonly key: string;
  /** Opens a fresh read of the source object from its first byte. */
  readonly open: () => Promise<Readable>;
  readonly verification: Verification;
  /** The length the primary's records give, checked before anything is written. */
  readonly expectedBytes?: number;
  readonly retainUntil: Date;
  /** Above it an object is streamed in two reads rather than held; tests lower it. */
  readonly bufferLimit?: number;
  readonly signal?: AbortSignal;
};

export type Transferred = {
  readonly versionId: string;
  readonly bytes: number;
  readonly sha256Hex: string;
};

/** Copies one object and proves the copy; every failure is a {@link MirrorFailure} with its stage. */
export const transferObject = async (args: TransferArguments): Promise<Transferred> => {
  const limit = args.bufferLimit ?? bufferedObjectBytes;
  let scanned: Scanned;
  try {
    scanned = await scan(await args.open(), limit);
  } catch (error) {
    throw failAt('source_read', error);
  }
  verify(args.key, scanned, args.verification, args.expectedBytes);

  const body = scanned.held ?? (async (): Promise<Readable> => args.open());
  let versionId: string;
  try {
    ({ versionId } = await args.destination.put(
      args.key,
      body,
      {
        contentLength: scanned.bytes,
        sha256: scanned.sha256,
        retainUntil: args.retainUntil,
      },
      args.signal,
    ));
  } catch (error) {
    throw failAt('dest_write', error);
  }

  let head;
  try {
    head = await args.destination.head(args.key, versionId, args.signal);
  } catch (error) {
    throw failAt('verify', error);
  }
  if (
    head === undefined ||
    head.bytes !== scanned.bytes ||
    (head.sha256 !== undefined && head.sha256 !== scanned.sha256)
  ) {
    throw new MirrorFailure('verify', 'checksum', `the copy of '${args.key}' does not match what was read`);
  }
  return { versionId, bytes: scanned.bytes, sha256Hex: scanned.sha256Hex };
};
