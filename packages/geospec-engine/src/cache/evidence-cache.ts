/**
 * The platform-free evidence-cache core.
 *
 * An evidence entry is a pure function of three things: the engine digest, the
 * family and its version, and a canonical claim key. "An engine or schema
 * change is a key change, never a stale read" (Register C5) — so the digest and
 * the family version are folded into the key rather than checked afterwards.
 *
 * The core knows nothing about a filesystem. With no store installed every
 * read misses and every write is dropped, and proofs simply compute: the cache
 * can only ever save work, never decide anything. The node store
 * ({@link createNodeEvidenceStore}) is installed by the host; browsers and
 * workers install their own or none at all.
 *
 * Two rules the core enforces for its callers:
 * - a store whose {@link GeoSpecEvidenceStore.engineDigest} is `undefined`
 *   (unreadable wasm) disables the cache — fail-open to recompute;
 * - failures, unsupported results and budget-exhausted results are NEVER
 *   written. A cache hit therefore *is* a success; that is what lets a warm run
 *   skip the parse entirely.
 *
 * @module
 */

/**
 * The independently versioned evidence families.
 *
 * @public
 */
export type GeoSpecEvidenceFamily =
  | 'brep-facet'
  | 'face-facts'
  | 'mesh-record'
  | 'occurrence-mesh'
  | 'overlap-pair-bundle'
  | 'overlap-pair-volume'
  | 'relationship-verdict'
  | 'void-topology-shells'
  | 'xde-read';

/**
 * Current schema version per family. Bump a family whose payload changes
 * numerically or structurally — "never silent key reuse" (C3 rule 4).
 *
 * @public
 */
export const geoSpecEvidenceFamilyVersions: Record<GeoSpecEvidenceFamily, number> = {
  'brep-facet': 1,
  'face-facts': 1,
  'mesh-record': 1,
  'occurrence-mesh': 1,
  'overlap-pair-bundle': 3,
  'overlap-pair-volume': 2,
  'relationship-verdict': 2,
  'void-topology-shells': 2,
  'xde-read': 2,
};

/**
 * The platform binding the core reads and writes through.
 *
 * @public
 */
export type GeoSpecEvidenceStore = {
  /** Fetch a stored payload. */
  get(family: GeoSpecEvidenceFamily | string, keyDigest: string): Uint8Array<ArrayBuffer> | undefined;
  /** Store a payload. Must never throw: a failed write is a future miss. */
  put(family: GeoSpecEvidenceFamily | string, keyDigest: string, value: Uint8Array<ArrayBuffer>): void;
  /** Provenance digest of the running engine, or `undefined` to disable. */
  engineDigest(): string | undefined;
  /** Content digest of arbitrary bytes, used to build keys. */
  hashBytes(bytes: Uint8Array<ArrayBuffer>): string;
  /** Digest of a canonical key string. */
  digestKey(canonicalKey: string): string;
  /** Drain pending write-behind writes. */
  flush?(): Promise<void>;
};

let installedStore: GeoSpecEvidenceStore | undefined;
let storeConfigured = false;
let defaultStoreFactory: (() => GeoSpecEvidenceStore | undefined) | undefined;

/**
 * Install (or clear) the process-wide evidence store.
 *
 * Passing `undefined` disables persistence for the rest of the process — it is
 * an explicit configuration, not a request to fall back to the default store.
 *
 * @param store - The store, or `undefined` to disable persistence.
 * @public
 */
export const setGeoSpecEvidenceStore = (store: GeoSpecEvidenceStore | undefined): void => {
  installedStore = store;
  storeConfigured = true;
};

/**
 * Register the factory that builds the host's default store, used the first
 * time the cache is consulted without an explicit {@link setGeoSpecEvidenceStore}.
 *
 * Registering a factory never overrides an explicit configuration: a test that
 * installed its own store — or explicitly disabled persistence — keeps it.
 *
 * @param factory - Builds the default store, or returns `undefined` when the
 * host cannot persist.
 * @public
 */
export const setGeoSpecDefaultEvidenceStoreFactory = (
  factory: (() => GeoSpecEvidenceStore | undefined) | undefined,
): void => {
  defaultStoreFactory = factory;
};

/**
 * Forget both the installed store and the memoized default. Test support only.
 *
 * @public
 */
export const resetGeoSpecEvidenceStore = (): void => {
  installedStore = undefined;
  storeConfigured = false;
};

/**
 * The active evidence store.
 *
 * @returns The installed store, the lazily built default, or `undefined`.
 * @public
 */
export const getGeoSpecEvidenceStore = (): GeoSpecEvidenceStore | undefined => {
  if (!storeConfigured) {
    storeConfigured = true;
    installedStore = defaultStoreFactory?.();
  }
  return installedStore;
};

/**
 * Serialize a value with recursively sorted object keys.
 *
 * Cache keys are built from option objects whose property order is an
 * implementation detail; sorting makes the key a pure function of the values.
 *
 * @param value - Any JSON-serializable value.
 * @returns Canonical JSON.
 * @public
 */
export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
};

/**
 * A resolved cache address: the store plus the digest identifying one entry.
 *
 * @public
 */
export type EvidenceAddress = {
  store: GeoSpecEvidenceStore;
  family: GeoSpecEvidenceFamily;
  keyDigest: string;
};

/**
 * Resolve the cache address of one claim.
 *
 * @param family - Evidence family.
 * @param key - Claim identity; every argument that could change the payload
 * must appear in it.
 * @returns The address, or `undefined` when the cache is unavailable.
 * @public
 */
export const resolveEvidenceAddress = (family: GeoSpecEvidenceFamily, key: unknown): EvidenceAddress | undefined => {
  const store = getGeoSpecEvidenceStore();
  if (!store) {
    return undefined;
  }
  const engineDigest = store.engineDigest();
  if (engineDigest === undefined) {
    // Unreadable wasm: the provenance digest is unknown, so no key can be
    // trusted. Fail open to recompute rather than risk a cross-build read.
    return undefined;
  }
  const version = geoSpecEvidenceFamilyVersions[family];
  return {
    store,
    family,
    keyDigest: store.digestKey(`${engineDigest}|${family}@v${version}|${canonicalJson(key)}`),
  };
};

/**
 * Read a payload from the cache.
 *
 * @param family - Evidence family.
 * @param key - Claim identity.
 * @returns The stored payload, or `undefined` on a miss.
 * @public
 */
export const readEvidenceBytes = (family: GeoSpecEvidenceFamily, key: unknown): Uint8Array<ArrayBuffer> | undefined => {
  const address = resolveEvidenceAddress(family, key);
  return address?.store.get(address.family, address.keyDigest);
};

/**
 * Write a payload to the cache.
 *
 * Only ever call this with a *successful* result: failures, unsupported
 * answers and budget-exhausted answers are never evidence (C5).
 *
 * @param family - Evidence family.
 * @param key - Claim identity.
 * @param payload - The successful payload.
 * @public
 */
export const writeEvidenceBytes = (
  family: GeoSpecEvidenceFamily,
  key: unknown,
  payload: Uint8Array<ArrayBuffer>,
): void => {
  const address = resolveEvidenceAddress(family, key);
  address?.store.put(address.family, address.keyDigest, payload);
};

const jsonEncoder = new TextEncoder();
const jsonDecoder = new TextDecoder();

/**
 * Read a JSON-encoded payload.
 *
 * @param family - Evidence family.
 * @param key - Claim identity.
 * @returns The parsed payload, or `undefined` on a miss or unreadable bytes.
 * @public
 */
export const readEvidenceJson = <Value>(family: GeoSpecEvidenceFamily, key: unknown): Value | undefined => {
  const bytes = readEvidenceBytes(family, key);
  if (!bytes) {
    return undefined;
  }
  try {
    return JSON.parse(jsonDecoder.decode(bytes)) as Value;
  } catch {
    // A corrupt entry is a miss, never a crash.
    return undefined;
  }
};

/**
 * Write a JSON-encoded payload.
 *
 * @param family - Evidence family.
 * @param key - Claim identity.
 * @param value - The successful payload.
 * @public
 */
export const writeEvidenceJson = (family: GeoSpecEvidenceFamily, key: unknown, value: unknown): void => {
  writeEvidenceBytes(family, key, jsonEncoder.encode(JSON.stringify(value)));
};

/**
 * Drain the installed store's pending writes.
 *
 * Called at run and shard boundaries. A crash before the flush costs a future
 * miss, never a wrong verdict.
 *
 * @public
 */
export const flushEvidenceStore = async (): Promise<void> => {
  await getGeoSpecEvidenceStore()?.flush?.();
};
