/**
 * Persistent content-addressed evidence cache — platform-neutral core (R5).
 *
 * Extends the memoization ladder (L0 facet memo → L1 subject cache → L2 proof
 * context → L3 in-run matcher caches) across process and run boundaries (L4):
 * evidence over unchanged geometry replays instead of recomputing. Entries are
 * pure functions of `{ engine digest, family+version, canonical key }`; an
 * engine or schema change is a key change, never a stale read.
 *
 * This module carries NO platform imports: proof code (void floods, contact
 * patches, overlap volumes, BRep facets) calls {@link getGeoSpecEvidenceCache}
 * and computes directly when no store is installed. Node entry points install
 * the authenticated out-of-tree store (`node-evidence-store.ts`); a browser
 * host may install an OPFS-backed store behind the same contract (performance
 * grade — see the blueprint's cross-platform trust note).
 *
 * Trust boundary (A3): the cache is deterministic recompute-or-reuse, never
 * SUT-asserted — a missing, torn, or tampered entry recomputes. Placement and
 * authentication are the store's contract.
 */

/** Sync byte store + integrity provider backing the cache. */
export type GeoSpecEvidenceStore = {
  /** Read an authenticated entry; undefined on miss/tamper/error. */
  get(family: string, keyDigest: string): Uint8Array<ArrayBuffer> | undefined;
  /** Write an entry atomically; best-effort (a failed write is a future miss). */
  put(family: string, keyDigest: string, value: Uint8Array<ArrayBuffer>): void;
  /** Engine provenance digest baked into every key; undefined disables the cache. */
  engineDigest(): string | undefined;
  /** Sync content hash (hex) for world-frame participant keys (R8/A2). */
  hashBytes(bytes: Uint8Array<ArrayBuffer>): string;
  /** Sync digest of a canonical key string. */
  digestKey(canonicalKey: string): string;
  /**
   * Drain any write-behind puts to durable storage (R9). Optional: fully
   * synchronous stores omit it. Hosts call it at run/shard boundaries; a
   * crash before flush loses pending entries, which is only a future miss.
   */
  flush?(): Promise<void>;
};

/** Value serializer for one evidence family. @public */
export type GeoSpecEvidenceCodec<T> = {
  encode: (value: T) => Uint8Array<ArrayBuffer>;
  decode: (bytes: Uint8Array<ArrayBuffer>) => T;
};

export type GeoSpecEvidenceCache = {
  /**
   * Return the cached value for `{ family, version, key }` or compute, store,
   * and return it. A compute returning `undefined` is never stored (failures
   * and unsupported outcomes always re-evaluate).
   */
  getOrCompute<T>(options: {
    family: string;
    version: number;
    key: unknown;
    compute: () => T | undefined;
    codec?: GeoSpecEvidenceCodec<T>;
  }): T | undefined;
  /** Sync content hash for participant keys. */
  hashBytes(bytes: Uint8Array<ArrayBuffer>): string;
};

/** Deterministic JSON: recursively key-sorted, no undefined members. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return entry;
    }
    const record = entry as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      if (record[key] !== undefined) {
        sorted[key] = record[key];
      }
    }
    return sorted;
  });

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const jsonCodec: GeoSpecEvidenceCodec<unknown> = {
  encode: (value) => textEncoder.encode(JSON.stringify(value)),
  decode: (bytes) => JSON.parse(textDecoder.decode(bytes)) as unknown,
};

/** Compact codec for cell-index arrays (void floods): raw little-endian u32. */
export const uint32ArrayCodec: GeoSpecEvidenceCodec<number[]> = {
  encode: (value) => {
    const words = new Uint32Array(value);
    return new Uint8Array(words.buffer, 0, words.byteLength);
  },
  decode: (bytes) => {
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes);
    return [...new Uint32Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 4))];
  },
};

const createCache = (store: GeoSpecEvidenceStore): GeoSpecEvidenceCache => ({
  getOrCompute<T>(options: {
    family: string;
    version: number;
    key: unknown;
    compute: () => T | undefined;
    codec?: GeoSpecEvidenceCodec<T>;
  }): T | undefined {
    const engine = store.engineDigest();
    if (engine === undefined) {
      return options.compute();
    }
    const codec = options.codec ?? (jsonCodec as GeoSpecEvidenceCodec<T>);
    const keyDigest = store.digestKey(
      canonicalJson({ engine, family: options.family, version: options.version, key: options.key }),
    );
    const hit = store.get(options.family, keyDigest);
    if (hit !== undefined) {
      try {
        return codec.decode(hit);
      } catch {
        // Undecodable entry (schema drift the version failed to catch): recompute.
      }
    }
    const value = options.compute();
    if (value !== undefined) {
      try {
        store.put(options.family, keyDigest, codec.encode(value));
      } catch {
        // Best-effort: a failed write is just a future miss.
      }
    }
    return value;
  },
  hashBytes: (bytes) => store.hashBytes(bytes),
});

let activeCache: GeoSpecEvidenceCache | undefined;
let activeStore: GeoSpecEvidenceStore | undefined;

/** Install (or clear) the process-wide evidence cache. Hosts call this once at startup. */
export const setGeoSpecEvidenceStore = (store: GeoSpecEvidenceStore | undefined): void => {
  activeStore = store;
  activeCache = store ? createCache(store) : undefined;
};

/** The active evidence cache, or undefined when no store is installed (compute directly). */
export const getGeoSpecEvidenceCache = (): GeoSpecEvidenceCache | undefined => activeCache;

/**
 * Drain the active store's write-behind queue (R9). No-op when no store is
 * installed or the store is fully synchronous. Runners call this at module,
 * shard, and run boundaries so pending evidence becomes durable off the
 * matcher path.
 */
export const flushGeoSpecEvidenceStore = async (): Promise<void> => {
  await activeStore?.flush?.();
};
