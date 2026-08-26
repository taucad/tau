/**
 * The authenticated on-disk evidence store (node hosts).
 *
 * Every entry is framed `hmac(32) | algo(1) | payload` and authenticated with
 * HMAC-SHA256 over `family | keyDigest | payload` under a per-install secret
 * kept at mode `0600`. Verification is constant-time. The threat model is
 * modest but exact: **tamper can force work, never a wrong verdict** — a frame
 * that fails verification is treated as a miss and the claim recomputes.
 *
 * Writes are write-behind. `put` publishes into an in-memory overlay
 * immediately (so the rest of the run reads its own writes) and schedules the
 * disk write; a superseding `put` wins, and a failed write simply drops the
 * entry — a future miss, never an error surfacing in a verdict. `flush()`
 * loops until the queue is drained, and is called at run and shard boundaries.
 *
 * @module
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { resolveGeoSpecCacheRoot } from '#cache/cache-root.js';
import { setGeoSpecDefaultEvidenceStoreFactory, setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';
import type { GeoSpecEvidenceStore } from '#cache/evidence-cache.js';

/** Payloads above this size are worth compressing. */
const compressionThresholdBytes = 4096;

/** Frame prefix: 32-byte HMAC then a one-byte algorithm tag. */
const hmacByteLength = 32;
const frameHeaderByteLength = hmacByteLength + 1;

const algorithmRaw = 0;
const algorithmZstd = 1;

/** Candidate locations of the shipped wasm, from the source tree and `dist/`. */
const wasmCandidates = [
  '../../native/opencascade/dist/geospec_opencascade_single.wasm',
  '../native/opencascade/dist/geospec_opencascade_single.wasm',
];

// Node returns `Buffer` views over pooled memory; the contract wants owned bytes.
const owned = (value: ArrayLike<number>): Uint8Array<ArrayBuffer> => Uint8Array.from(value);

const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/**
 * SHA-256 of the shipped wasm artifact — the provenance digest baked into
 * every cache key, so a kernel rebuild rotates the whole cache by construction.
 *
 * @param candidates - Artifact locations to try, relative to this module.
 * @returns The hex digest, or `undefined` when the artifact cannot be read (the
 * cache then disables itself and everything recomputes).
 * @public
 */
export const readEngineDigest = (candidates: readonly string[] = wasmCandidates): string | undefined => {
  for (const candidate of candidates) {
    try {
      return createHash('sha256')
        .update(readFileSync(new URL(candidate, import.meta.url)))
        .digest('hex');
    } catch {
      continue;
    }
  }
  return undefined;
};

let memoizedEngineDigest: string | undefined;
let engineDigestRead = false;

const memoizedReadEngineDigest = (): string | undefined => {
  if (!engineDigestRead) {
    engineDigestRead = true;
    memoizedEngineDigest = readEngineDigest();
  }
  return memoizedEngineDigest;
};

/**
 * Forget the memoized engine digest. Test support only.
 *
 * @public
 */
export const resetEngineDigest = (): void => {
  engineDigestRead = false;
  memoizedEngineDigest = undefined;
};

const readOrCreateSecret = (root: string): Uint8Array<ArrayBuffer> => {
  const path = join(root, 'install-secret');
  try {
    return owned(readFileSync(path));
  } catch {
    // Create atomically at 0600: a concurrent creator may win the rename, in
    // which case its secret is the one the re-read adopts.
    const secret = randomBytes(32);
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    mkdirSync(root, { recursive: true });
    writeFileSync(temporary, secret, { mode: 0o600 });
    renameSync(temporary, path);
    return owned(readFileSync(path));
  }
};

type Signature = {
  secret: Uint8Array<ArrayBuffer>;
  family: string;
  keyDigest: string;
  payload: Uint8Array<ArrayBuffer>;
};

const sign = ({ secret, family, keyDigest, payload }: Signature): Uint8Array<ArrayBuffer> =>
  owned(createHmac('sha256', secret).update(`${family}|${keyDigest}|`).update(payload).digest());

/**
 * Options for {@link createNodeEvidenceStore}.
 *
 * @public
 */
export type CreateNodeEvidenceStoreOptions = {
  /** Cache root. Defaults to {@link resolveGeoSpecCacheRoot}. */
  root?: string;
  /** Engine provenance digest. Defaults to the shipped wasm's SHA-256. */
  engineDigest?: () => string | undefined;
};

/**
 * A node evidence store, with its write-behind queue exposed for flushing.
 *
 * @public
 */
export type NodeEvidenceStore = GeoSpecEvidenceStore & {
  readonly root: string;
  flush(): Promise<void>;
};

/**
 * Build the authenticated on-disk store.
 *
 * @param options - Root and digest overrides.
 * @returns The store.
 * @public
 */
export const createNodeEvidenceStore = (options: CreateNodeEvidenceStoreOptions = {}): NodeEvidenceStore => {
  const root = options.root ?? resolveGeoSpecCacheRoot()!;
  const digest = options.engineDigest ?? memoizedReadEngineDigest;

  let secret: Uint8Array<ArrayBuffer> | undefined;
  const requireSecret = (): Uint8Array<ArrayBuffer> | undefined => {
    if (!secret) {
      try {
        secret = readOrCreateSecret(root);
      } catch {
        // An unwritable cache root is a cache that does not exist.
        return undefined;
      }
    }
    return secret;
  };

  const entryPath = (family: string, keyDigest: string): string =>
    join(root, family, keyDigest.slice(0, 2), `${keyDigest}.bin`);

  /** Values written this run, visible before their disk write lands. */
  const overlay = new Map<string, Uint8Array<ArrayBuffer>>();
  /** The newest framed bytes queued per entry. */
  const queued = new Map<string, { path: string; frame: Uint8Array<ArrayBuffer> }>();
  const inFlight = new Set<Promise<void>>();

  const writeFrame = async (path: string, frame: Uint8Array<ArrayBuffer>): Promise<void> => {
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(temporary, frame);
      // Rename is atomic within a filesystem: a reader never sees a half file.
      await rename(temporary, path);
    } catch {
      // A failed write is a future miss. Clean up and stay silent.
      try {
        await rm(temporary, { force: true });
      } catch {
        // The temp file never existed, or its directory does not either.
      }
    }
  };

  const writeBehind = async (overlayKey: string): Promise<void> => {
    // Drain until no newer put arrived while the last write was in flight: the
    // last writer wins on disk exactly as it does in the overlay. Sequential by
    // design — two writers racing on one path would defeat the temp+rename.
    for (let pending = queued.get(overlayKey); pending; pending = queued.get(overlayKey)) {
      // oxlint-disable-next-line no-await-in-loop -- Sequential is the point: one writer per entry, newest frame last.
      await writeFrame(pending.path, pending.frame);
      // Supersession check: a newer put has already replaced the queue entry
      // and will be drained by the next turn of this loop, so only the writer
      // that still owns the entry may retire the overlay value.
      if (queued.get(overlayKey) === pending) {
        queued.delete(overlayKey);
        overlay.delete(overlayKey);
      }
    }
  };

  const settle = (task: () => Promise<void>): void => {
    const slot: { write?: Promise<void> } = {};
    slot.write = (async () => {
      try {
        await task();
      } finally {
        inFlight.delete(slot.write!);
      }
    })();
    inFlight.add(slot.write);
  };

  return {
    root,
    engineDigest: digest,
    hashBytes: (bytes) => sha256Hex(bytes),
    digestKey: (canonicalKey) => createHash('sha256').update(canonicalKey).digest('hex'),

    get(family, keyDigest) {
      const overlayKey = `${family}:${keyDigest}`;
      const pending = overlay.get(overlayKey);
      if (pending) {
        return pending;
      }
      const key = requireSecret();
      if (!key) {
        return undefined;
      }
      let frame: Uint8Array<ArrayBuffer>;
      try {
        frame = owned(readFileSync(entryPath(family, keyDigest)));
      } catch {
        return undefined;
      }
      if (frame.byteLength < frameHeaderByteLength) {
        return undefined;
      }
      const payload = owned(frame.subarray(frameHeaderByteLength));
      if (!timingSafeEqual(frame.subarray(0, hmacByteLength), sign({ secret: key, family, keyDigest, payload }))) {
        // Tampered or foreign entry: recompute. Never trust, never crash.
        return undefined;
      }
      try {
        return frame[hmacByteLength] === algorithmZstd ? owned(zstdDecompressSync(payload)) : payload;
      } catch {
        return undefined;
      }
    },

    put(family, keyDigest, value) {
      const key = requireSecret();
      if (!key) {
        return;
      }
      const overlayKey = `${family}:${keyDigest}`;
      overlay.set(overlayKey, value);

      const compress = value.byteLength > compressionThresholdBytes;
      const payload = compress ? owned(zstdCompressSync(value)) : value;
      const frame = new Uint8Array(frameHeaderByteLength + payload.byteLength);
      frame.set(sign({ secret: key, family, keyDigest, payload }), 0);
      frame[hmacByteLength] = compress ? algorithmZstd : algorithmRaw;
      frame.set(payload, frameHeaderByteLength);

      const draining = queued.has(overlayKey);
      queued.set(overlayKey, { path: entryPath(family, keyDigest), frame });
      if (!draining) {
        // Otherwise a writer is already draining this entry and will pick up
        // the newer frame on its next turn.
        settle(async () => writeBehind(overlayKey));
      }
    },

    async flush() {
      // Loop rather than await once: a put issued while a write was in flight
      // must also be drained before the boundary is considered clean.
      while (inFlight.size > 0) {
        // oxlint-disable-next-line no-await-in-loop -- The loop exists precisely to await successive generations of writes.
        await Promise.all(inFlight);
      }
    },
  };
};

let defaultFactoryInstalled = false;

/**
 * Make the on-disk store this process's default, so any engine entry point
 * consulted without an explicit `setGeoSpecEvidenceStore` persists.
 *
 * Idempotent, and deliberately not a module side effect: the package is marked
 * side-effect-free, and a bundler must be allowed to drop the node store from a
 * browser build.
 *
 * @public
 */
export const ensureNodeEvidenceStoreInstalled = (): void => {
  if (defaultFactoryInstalled) {
    return;
  }
  defaultFactoryInstalled = true;
  setGeoSpecDefaultEvidenceStoreFactory(() => createNodeEvidenceStore());
};

/** Install the evidence store selected by one Node runner factory. */
export const installNodeEvidenceStore = (options: {
  cache?: boolean;
  cacheDirectory?: string;
  projectPath: string;
}): string | undefined => {
  const root = resolveGeoSpecCacheRoot(options);
  setGeoSpecEvidenceStore(root === undefined ? undefined : createNodeEvidenceStore({ root }));
  return root;
};
