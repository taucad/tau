import { CacheCorruptionError } from '#errors.js';
import { actionDigest, contentDigest, digestContent } from '#digest.js';
import type { ActionStore, CacheMaintenance, CacheStoreStatistics, ComputeActionRecord, ContentStore } from '#store.js';

/** Hard capacity bounds for a memory cache tier. @public */
export type MemoryStoreOptions = {
  readonly maxBytes: number;
  readonly maxEntries?: number;
  /** Maximum size of one entry; defaults to the total byte budget. */
  readonly maxEntryBytes?: number;
};

type Counters = { hits: number; misses: number; evictions: number };

const validateOptions = (
  options: MemoryStoreOptions,
): { maxBytes: number; maxEntries: number; maxEntryBytes: number } => {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new TypeError('maxBytes must be a non-negative safe integer.');
  }
  const maxEntries = options.maxEntries ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
    throw new TypeError('maxEntries must be a non-negative safe integer.');
  }
  const maxEntryBytes = options.maxEntryBytes ?? options.maxBytes;
  if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 0) {
    throw new TypeError('maxEntryBytes must be a non-negative safe integer.');
  }
  return { maxBytes: options.maxBytes, maxEntries, maxEntryBytes };
};

const copyBytes = (value: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(value);

const cloneRecord = (record: ComputeActionRecord): ComputeActionRecord => ({
  schemaVersion: 1,
  actionDigest: record.actionDigest,
  codec: { id: record.codec.id, version: record.codec.version },
  output: {
    digest: record.output.digest,
    size: record.output.size,
    mediaType: record.output.mediaType,
  },
  dependencies: [...record.dependencies],
});

const recordsEqual = (left: ComputeActionRecord, right: ComputeActionRecord): boolean =>
  left.actionDigest === right.actionDigest &&
  left.codec.id === right.codec.id &&
  left.codec.version === right.codec.version &&
  left.output.digest === right.output.digest &&
  left.output.size === right.output.size &&
  left.output.mediaType === right.output.mediaType &&
  left.dependencies.length === right.dependencies.length &&
  left.dependencies.every((dependency, index) => dependency === right.dependencies[index]);

const recordSize = (record: ComputeActionRecord): number => new TextEncoder().encode(JSON.stringify(record)).byteLength;

const createMaintenance = (input: {
  readonly statistics: () => CacheStoreStatistics;
  readonly clearEntries: () => void;
}): CacheMaintenance => ({
  status: 'supported',
  inspect: async ({ signal }) => {
    signal?.throwIfAborted();
    return { status: 'supported', statistics: input.statistics() };
  },
  clear: async ({ signal }) => {
    signal?.throwIfAborted();
    input.clearEntries();
    return { status: 'cleared' };
  },
});

/**
 * Create a defensive, byte-bounded least-recently-used content tier.
 *
 * The store verifies every supplied content digest and never shares a mutable
 * byte buffer with its callers.
 * @param options - Hard byte and optional entry bounds.
 * @returns A bounded in-memory content store.
 * @public
 */
export const createMemoryContentStore = (options: MemoryStoreOptions): ContentStore => {
  const limits = validateOptions(options);
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  const counters: Counters = { hits: 0, misses: 0, evictions: 0 };
  let usedBytes = 0;

  const evictToFit = (incomingBytes: number): void => {
    while (entries.size >= limits.maxEntries || usedBytes + incomingBytes > limits.maxBytes) {
      const oldest = entries.entries().next().value as readonly [string, Uint8Array<ArrayBuffer>] | undefined;
      if (oldest === undefined) {
        return;
      }
      entries.delete(oldest[0]);
      usedBytes -= oldest[1].byteLength;
      counters.evictions += 1;
    }
  };

  const maintenance = createMaintenance({
    statistics: () => ({
      entries: entries.size,
      bytes: usedBytes,
      hits: counters.hits,
      misses: counters.misses,
      evictions: counters.evictions,
    }),
    clearEntries: () => {
      entries.clear();
      usedBytes = 0;
    },
  });

  return {
    read: async ({ digest, signal }) => {
      signal?.throwIfAborted();
      contentDigest({ value: digest });
      const stored = entries.get(digest);
      if (stored === undefined) {
        counters.misses += 1;
        return { status: 'miss' };
      }
      entries.delete(digest);
      entries.set(digest, stored);
      counters.hits += 1;
      return { status: 'hit', bytes: copyBytes(stored) };
    },
    write: async ({ digest, bytes, signal }) => {
      signal?.throwIfAborted();
      contentDigest({ value: digest });
      if ((await digestContent({ bytes })) !== digest) {
        throw new CacheCorruptionError('Content bytes do not match their declared digest.');
      }
      signal?.throwIfAborted();
      const existing = entries.get(digest);
      if (existing !== undefined) {
        entries.delete(digest);
        entries.set(digest, existing);
        return { status: 'existing' };
      }
      if (bytes.byteLength > limits.maxEntryBytes || bytes.byteLength > limits.maxBytes || limits.maxEntries === 0) {
        return { status: 'rejected', reason: 'entry-too-large' };
      }
      evictToFit(bytes.byteLength);
      const owned = copyBytes(bytes);
      entries.set(digest, owned);
      usedBytes += owned.byteLength;
      return { status: 'stored' };
    },
    maintenance,
  };
};

/**
 * Create a defensive, byte-bounded least-recently-used action record tier.
 * @param options - Hard byte and optional entry bounds.
 * @returns A bounded in-memory action store.
 * @public
 */
export const createMemoryActionStore = (options: MemoryStoreOptions): ActionStore => {
  const limits = validateOptions(options);
  const entries = new Map<string, { readonly record: ComputeActionRecord; readonly size: number }>();
  const counters: Counters = { hits: 0, misses: 0, evictions: 0 };
  let usedBytes = 0;

  const evictToFit = (incomingBytes: number): void => {
    while (entries.size >= limits.maxEntries || usedBytes + incomingBytes > limits.maxBytes) {
      const oldest = entries.entries().next().value as
        | readonly [string, { readonly record: ComputeActionRecord; readonly size: number }]
        | undefined;
      if (oldest === undefined) {
        return;
      }
      entries.delete(oldest[0]);
      usedBytes -= oldest[1].size;
      counters.evictions += 1;
    }
  };

  const maintenance = createMaintenance({
    statistics: () => ({
      entries: entries.size,
      bytes: usedBytes,
      hits: counters.hits,
      misses: counters.misses,
      evictions: counters.evictions,
    }),
    clearEntries: () => {
      entries.clear();
      usedBytes = 0;
    },
  });

  return {
    read: async ({ digest, signal }) => {
      signal?.throwIfAborted();
      actionDigest({ value: digest });
      const stored = entries.get(digest);
      if (stored === undefined) {
        counters.misses += 1;
        return { status: 'miss' };
      }
      entries.delete(digest);
      entries.set(digest, stored);
      counters.hits += 1;
      return { status: 'hit', record: cloneRecord(stored.record) };
    },
    publish: async ({ record, signal }) => {
      signal?.throwIfAborted();
      actionDigest({ value: record.actionDigest });
      contentDigest({ value: record.output.digest });
      const schemaVersion: unknown = record.schemaVersion;
      if (schemaVersion !== 1) {
        throw new TypeError('record.schemaVersion must be 1.');
      }
      if (!Number.isSafeInteger(record.output.size) || record.output.size < 0) {
        throw new TypeError('record.output.size must be a non-negative safe integer.');
      }
      if (record.codec.id.length === 0 || record.codec.version.length === 0) {
        throw new TypeError('record.codec identity must not be empty.');
      }
      if (record.output.mediaType.length === 0) {
        throw new TypeError('record.output.mediaType must not be empty.');
      }
      for (const dependency of record.dependencies) {
        actionDigest({ value: dependency });
      }
      const existing = entries.get(record.actionDigest);
      if (existing !== undefined) {
        if (!recordsEqual(existing.record, record)) {
          throw new CacheCorruptionError('Action digest has a conflicting published record.');
        }
        entries.delete(record.actionDigest);
        entries.set(record.actionDigest, existing);
        return { status: 'existing' };
      }
      const owned = cloneRecord(record);
      const size = recordSize(owned);
      if (size > limits.maxEntryBytes || size > limits.maxBytes || limits.maxEntries === 0) {
        return { status: 'rejected', reason: 'entry-too-large' };
      }
      evictToFit(size);
      entries.set(record.actionDigest, { record: owned, size });
      usedBytes += size;
      return { status: 'published' };
    },
    maintenance,
  };
};
