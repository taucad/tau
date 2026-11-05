/**
 * Read objects out of a pack one at a time: Tau's pack reader (charter D7).
 *
 * An object costs one lookup in the in-memory index tables and one range read
 * of the pack — `[offset, next offset)`, a non-exclusive slice — then an
 * inflate; a delta costs one more of each per hop to its base, and resolved
 * bases are kept in a cache bounded by bytes. The pack itself is never read
 * whole.
 *
 * @module
 */
/* oxlint-disable no-bitwise -- pack and index records are bit fields. */

import { isComputeWorkerFailure } from '#compute-worker/errors.js';
import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import type { PackIndex } from '#pack-reader/pack-index.js';

export { applyDelta } from '#pack-reader/delta.js';

/** The four object kinds a store holds. */
export type GitObjectKind = 'commit' | 'tree' | 'blob' | 'tag';

/** One object's kind and body (no `<type> <size>\0` frame). */
export type StoredObject = Readonly<{ type: GitObjectKind; data: Uint8Array<ArrayBuffer> }>;

/** What reads cost, counted where they happen. */
export type ObjectReadCounters = {
  /** Index-table lookups that found the object. */
  lookups: number;
  /** Range reads of a pack: one per entry read. */
  rangeReads: number;
  /** Delta bases resolved through another entry. */
  deltaHops: number;
  /** Bases answered from the cache instead. */
  cacheHits: number;
  /** Loose-object files read. */
  looseReads: number;
  /** Packs read whole, only where the files cannot read a range. */
  wholePackLoads: number;
  /** Pack trailers compared with their index: one per pack opened. */
  packChecks: number;
};

/**
 * A new set of zeroed counters.
 *
 * @returns Every counter at zero.
 */
export const emptyReadCounters = (): ObjectReadCounters => ({
  lookups: 0,
  rangeReads: 0,
  deltaHops: 0,
  cacheHits: 0,
  looseReads: 0,
  wholePackLoads: 0,
  packChecks: 0,
});

const kinds: Readonly<Record<number, GitObjectKind>> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };
const ofsDelta = 6;
const refDelta = 7;
const packHeaderBytes = 12;
const trailerBytes = 20;

/** The longest delta chain a read follows; git's own default depth is 50. */
export const maximumDeltaDepth = 10_000;

/** Resolved delta bases, bounded by bytes. */
export type BaseCache = Readonly<{
  get: (key: string) => StoredObject | undefined;
  set: (key: string, object: StoredObject) => void;
}>;

/**
 * A bounded cache of resolved delta bases, least recently used out first.
 *
 * @param maximumBytes - The bytes it may hold.
 * @returns An empty cache.
 */
export const createBaseCache = (maximumBytes: number): BaseCache => {
  const held = new Map<string, StoredObject>();
  let bytes = 0;
  return Object.freeze({
    get: (key: string): StoredObject | undefined => {
      const found = held.get(key);
      if (found !== undefined) {
        held.delete(key);
        held.set(key, found);
      }
      return found;
    },
    set: (key: string, object: StoredObject): void => {
      if (object.data.byteLength > maximumBytes || held.has(key)) {
        return;
      }
      held.set(key, object);
      bytes += object.data.byteLength;
      for (const [oldest, value] of held) {
        if (bytes <= maximumBytes) {
          break;
        }
        held.delete(oldest);
        bytes -= value.data.byteLength;
      }
    },
  });
};

/** Where a pack is and how to reach the objects it does not hold. */
export type PackReaderOptions = Readonly<{
  /** The pack's path, for range reads. */
  path: string;
  /** Its size in bytes. */
  size: number;
  /** Its index tables. */
  index: PackIndex;
  /** One range of the pack. */
  readRange: (path: string, offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>;
  compute: ComputeWorker;
  cache: BaseCache;
  counters: ObjectReadCounters;
  /**
   * A ref-delta's base, which may live anywhere in the store.
   *
   * @param oid - The base's id.
   * @param depth - Delta hops already taken to reach it.
   */
  readBase: (oid: string, depth: number) => Promise<StoredObject | undefined>;
}>;

/** One object read for a repack: a whole entry's deflated body comes with it, to copy verbatim. */
export type CopiedObject = StoredObject & Readonly<{ compressed?: Uint8Array<ArrayBuffer> }>;

/** One pack's objects, read entry by entry. */
export type PackReader = Readonly<{
  path: string;
  index: PackIndex;
  /**
   * One object of this pack, or `undefined` when the pack lacks it.
   *
   * @param oid - Lowercase hex object id.
   * @param depth - Delta hops already taken to reach it; 0 for a caller's read.
   */
  read: (oid: string, depth?: number) => Promise<StoredObject | undefined>;
  /**
   * One object for a repack: as {@link PackReader.read}, with a whole (non-delta)
   * entry's deflated body alongside, so the repack need not deflate it again.
   *
   * @param oid - Lowercase hex object id.
   */
  readForCopy: (oid: string) => Promise<CopiedObject | undefined>;
}>;

/* One entry's header: its kind and the size it declares (the object's, or a delta's own). */
const entryHeader = (entry: Uint8Array<ArrayBuffer>): Readonly<{ kind: number; size: number; at: number }> => {
  let at = 0;
  const next = (): number => {
    if (at >= entry.byteLength) {
      throw new TypeError('A pack entry is truncated.');
    }
    const byte = entry[at]!;
    at += 1;
    return byte;
  };
  let byte = next();
  const kind = (byte >> 4) & 0x07;
  let size = byte & 0x0f;
  let shift = 16;
  while ((byte & 0x80) !== 0) {
    byte = next();
    size += (byte & 0x7f) * shift;
    shift *= 128;
    if (shift > 2 ** 53) {
      throw new TypeError('A pack entry declares a size too large to hold.');
    }
  }
  return { kind, size, at };
};

/**
 * Open one pack for object reads. Its index must place every entry inside the
 * pack; the pack's own trailer is compared with the index's record of it on
 * the first read.
 *
 * @param options - The pack, its tables and the store around it.
 * @returns Its objects, read entry by entry.
 * @throws TypeError when the index places an entry outside the pack.
 */
export const createPackReader = (options: PackReaderOptions): PackReader => {
  const { path, size, index, readRange, compute, cache, counters, readBase } = options;
  const [smallest, largest] = index.offsetRange;
  if (index.count > 0 && (smallest < packHeaderBytes || largest >= size - trailerBytes)) {
    throw new TypeError(`The pack ${path} is shorter than its index says.`);
  }
  let checked: Promise<void> | undefined;
  const checkTrailer = async (): Promise<void> => {
    checked ??= (async (): Promise<void> => {
      counters.packChecks += 1;
      const trailer = await readRange(path, size - trailerBytes, trailerBytes);
      let hex = '';
      for (const byte of trailer) {
        hex += byte.toString(16).padStart(2, '0');
      }
      if (hex !== index.packChecksum) {
        throw new TypeError(`The pack ${path} does not end with the checksum its index records.`);
      }
    })();
    await checked;
  };

  const inflateExactly = async (
    compressed: Uint8Array<ArrayBuffer>,
    declared: number,
  ): Promise<Uint8Array<ArrayBuffer>> => {
    let inflated: Uint8Array<ArrayBuffer>;
    try {
      inflated = await compute.inflate(compressed);
    } catch (error) {
      /* A worker that died judged nothing: the pack stays, and the caller sees the crash. */
      if (isComputeWorkerFailure(error)) {
        throw error;
      }
      /* Bytes that are not a zlib stream are a corrupt entry, wherever the compute ran. */
      throw new TypeError(`A pack entry in ${path} does not inflate.`, { cause: error });
    }
    if (inflated.byteLength !== declared) {
      throw new TypeError(`A pack entry in ${path} inflates to a size other than the one it declares.`);
    }
    return inflated;
  };

  const entryAt = async (offset: number, depth: number, keepCompressed = false): Promise<CopiedObject> => {
    if (depth > maximumDeltaDepth) {
      throw new TypeError(`A delta chain in ${path} is longer than ${String(maximumDeltaDepth)}.`);
    }
    await checkTrailer();
    const end = index.endOf(offset, size);
    const entry = await readRange(path, offset, end - offset);
    counters.rangeReads += 1;
    const { kind, size: declared, at: bodyAt } = entryHeader(entry);
    let at = bodyAt;
    if (kind in kinds) {
      const compressed = entry.subarray(at);
      const data = await inflateExactly(compressed, declared);
      return keepCompressed ? { type: kinds[kind]!, data, compressed } : { type: kinds[kind]!, data };
    }
    let base: StoredObject | undefined;
    if (kind === ofsDelta) {
      if (at >= entry.byteLength) {
        throw new TypeError('A pack entry is truncated.');
      }
      let byte = entry[at]!;
      at += 1;
      let distance = byte & 0x7f;
      while ((byte & 0x80) !== 0) {
        if (at >= entry.byteLength || distance > 2 ** 46) {
          throw new TypeError('A pack entry is truncated.');
        }
        byte = entry[at]!;
        at += 1;
        distance = (distance + 1) * 128 + (byte & 0x7f);
      }
      if (distance === 0 || distance > offset) {
        throw new TypeError(`A delta in ${path} names a base that is not before it.`);
      }
      base = await baseAt(offset - distance, depth + 1);
    } else if (kind === refDelta) {
      if (at + 20 > entry.byteLength) {
        throw new TypeError('A pack entry is truncated.');
      }
      let oid = '';
      for (let index_ = at; index_ < at + 20; index_ += 1) {
        oid += entry[index_]!.toString(16).padStart(2, '0');
      }
      at += 20;
      const own = index.offsetOf(oid);
      if (own === undefined) {
        counters.deltaHops += 1;
        base = await readBase(oid, depth + 1);
      } else {
        base = await baseAt(own, depth + 1);
      }
    } else {
      throw new TypeError(`A pack entry has an unknown type ${String(kind)}.`);
    }
    if (base === undefined) {
      /*
       * Not a TypeError: the pack is whole, the store is missing a base (a
       * thin pack before its bases arrive). The store drops packs only for
       * TypeErrors, which mean the pack's own bytes are wrong.
       */
      throw new Error('A delta names a base this store does not hold.');
    }
    /* Inflate, size check and apply on the compute worker: the authority only reads the range. */
    return { type: base.type, data: await compute.resolveDelta(entry.subarray(at), declared, base.data) };
  };
  const baseAt = async (offset: number, depth: number): Promise<StoredObject> => {
    const key = `${path}:${String(offset)}`;
    const held = cache.get(key);
    if (held !== undefined) {
      counters.cacheHits += 1;
      return held;
    }
    counters.deltaHops += 1;
    const base = await entryAt(offset, depth);
    cache.set(key, base);
    return base;
  };
  const located = (oid: string): number | undefined => {
    const offset = index.offsetOf(oid);
    if (offset !== undefined) {
      counters.lookups += 1;
    }
    return offset;
  };
  return Object.freeze({
    path,
    index,
    read: async (oid: string, depth = 0): Promise<StoredObject | undefined> => {
      const offset = located(oid);
      return offset === undefined ? undefined : entryAt(offset, depth);
    },
    readForCopy: async (oid: string): Promise<CopiedObject | undefined> => {
      const offset = located(oid);
      return offset === undefined ? undefined : entryAt(offset, 0, true);
    },
  });
};
