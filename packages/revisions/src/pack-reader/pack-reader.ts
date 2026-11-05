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

import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import type { PackIndex } from '#pack-reader/pack-index.js';

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
});

const kinds: Readonly<Record<number, GitObjectKind>> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };
const ofsDelta = 6;
const refDelta = 7;

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

/**
 * Apply one git delta to its base.
 *
 * @param delta - The inflated delta instructions.
 * @param base - The base object's body.
 * @returns The target body.
 */
export const applyDelta = (delta: Uint8Array<ArrayBuffer>, base: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  let at = 0;
  const size = (): number => {
    let value = 0;
    let shift = 1;
    let byte: number;
    do {
      byte = delta[at]!;
      at += 1;
      value += (byte & 0x7f) * shift;
      shift *= 128;
    } while ((byte & 0x80) !== 0);
    return value;
  };
  if (size() !== base.byteLength) {
    throw new TypeError('A delta does not match the size of its base.');
  }
  const target = new Uint8Array(size());
  let written = 0;
  while (at < delta.byteLength) {
    const op = delta[at]!;
    at += 1;
    if ((op & 0x80) !== 0) {
      let offset = 0;
      let length = 0;
      for (let bit = 0; bit < 4; bit += 1) {
        if ((op & (1 << bit)) !== 0) {
          offset += delta[at]! * 2 ** (8 * bit);
          at += 1;
        }
      }
      for (let bit = 0; bit < 3; bit += 1) {
        if ((op & (0x10 << bit)) !== 0) {
          length += delta[at]! * 2 ** (8 * bit);
          at += 1;
        }
      }
      if (length === 0) {
        length = 0x1_00_00;
      }
      target.set(base.subarray(offset, offset + length), written);
      written += length;
    } else if (op > 0) {
      target.set(delta.subarray(at, at + op), written);
      at += op;
      written += op;
    } else {
      throw new TypeError('A delta holds a reserved instruction.');
    }
  }
  if (written !== target.byteLength) {
    throw new TypeError('A delta did not produce the size it declared.');
  }
  return target;
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
  /** A ref-delta's base, which may live anywhere in the store. */
  readBase: (oid: string) => Promise<StoredObject | undefined>;
}>;

/** One pack's objects, read entry by entry. */
export type PackReader = Readonly<{
  path: string;
  index: PackIndex;
  /**
   * One object of this pack, or `undefined` when the pack lacks it.
   *
   * @param oid - Lowercase hex object id.
   */
  read: (oid: string) => Promise<StoredObject | undefined>;
}>;

/**
 * Open one pack for object reads.
 *
 * @param options - The pack, its tables and the store around it.
 * @returns Its objects, read entry by entry.
 */
export const createPackReader = (options: PackReaderOptions): PackReader => {
  const { path, size, index, readRange, compute, cache, counters, readBase } = options;
  const entryAt = async (offset: number): Promise<StoredObject> => {
    const end = index.endOf(offset, size);
    const entry = await readRange(path, offset, end - offset);
    counters.rangeReads += 1;
    let at = 0;
    let byte = entry[at]!;
    at += 1;
    const kind = (byte >> 4) & 0x07;
    while ((byte & 0x80) !== 0) {
      byte = entry[at]!;
      at += 1;
    }
    if (kind in kinds) {
      return { type: kinds[kind]!, data: await compute.inflate(entry.subarray(at)) };
    }
    let base: StoredObject | undefined;
    if (kind === ofsDelta) {
      byte = entry[at]!;
      at += 1;
      let distance = byte & 0x7f;
      while ((byte & 0x80) !== 0) {
        byte = entry[at]!;
        at += 1;
        distance = (distance + 1) * 128 + (byte & 0x7f);
      }
      base = await baseAt(offset - distance);
    } else if (kind === refDelta) {
      let oid = '';
      for (let index_ = at; index_ < at + 20; index_ += 1) {
        oid += entry[index_]!.toString(16).padStart(2, '0');
      }
      at += 20;
      const own = index.offsetOf(oid);
      if (own === undefined) {
        counters.deltaHops += 1;
        base = await readBase(oid);
      } else {
        base = await baseAt(own);
      }
    } else {
      throw new TypeError(`A pack entry has an unknown type ${String(kind)}.`);
    }
    if (base === undefined) {
      throw new TypeError('A delta names a base this store does not hold.');
    }
    return { type: base.type, data: applyDelta(await compute.inflate(entry.subarray(at)), base.data) };
  };
  const baseAt = async (offset: number): Promise<StoredObject> => {
    const key = `${path}:${String(offset)}`;
    const held = cache.get(key);
    if (held !== undefined) {
      counters.cacheHits += 1;
      return held;
    }
    counters.deltaHops += 1;
    const base = await entryAt(offset);
    cache.set(key, base);
    return base;
  };
  return Object.freeze({
    path,
    index,
    read: async (oid: string): Promise<StoredObject | undefined> => {
      const offset = index.offsetOf(oid);
      if (offset === undefined) {
        return undefined;
      }
      counters.lookups += 1;
      return entryAt(offset);
    },
  });
};
