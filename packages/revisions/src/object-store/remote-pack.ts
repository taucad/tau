/**
 * A pack that stays on the server, read through its stored index and Range
 * reads of the pack (charter D8): never fetched whole, never indexed here.
 *
 * {@link RemotePack.readMany} reads a set of objects in waves. Each wave asks
 * for the entries it still lacks, merges entries that touch into one Range
 * read (contiguous only: a gap is never fetched), and parses each delta's base
 * field so the next wave fetches the bases. A chain of depth `d` costs `d + 1`
 * waves however many objects share it, and nothing outside the asked-for
 * objects and their bases is requested — which is how a cold open stays inside
 * the refs its sync policy names.
 *
 * @module
 */

import type { ComputeWorker } from '#compute-worker/compute-worker.js';
import { checkPackIndexChecksum, readPackIndex } from '#pack-reader/pack-index.js';
import type { PackIndex } from '#pack-reader/pack-index.js';
import {
  createBaseCache,
  createPackReader,
  deltaBaseOf,
  emptyReadCounters,
  maximumDeltaDepth,
} from '#pack-reader/pack-reader.js';
import type { PackReader, StoredObject } from '#pack-reader/pack-reader.js';

/** One Range read of the pack: exactly `length` bytes from `offset`. */
export type RangeFetch = (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>;

/** What a remote pack's reads cost, for gates. */
export type RemotePackCounters = {
  /** Range requests sent. */
  rangeRequests: number;
  /** Bytes those requests answered. */
  bytesFetched: number;
  /** Waves {@link RemotePack.readMany} took. */
  waves: number;
};

/** A pack on the server, read by Range through its index. */
export type RemotePack = Readonly<{
  name: string;
  index: PackIndex;
  counters: Readonly<RemotePackCounters>;
  /**
   * The objects of `oids` this pack holds, read in coalesced waves.
   *
   * @param oids - Lowercase hex object ids; those this pack lacks are left out.
   * @returns Each held object by id.
   */
  readMany: (oids: Iterable<string>) => Promise<Map<string, StoredObject>>;
}>;

/** Where a remote pack is and how to reach it. */
export type RemotePackOptions = Readonly<{
  /** The pack's name, `pack-<checksum>` with any suffix. */
  name: string;
  /** The pack's size in bytes. */
  size: number;
  /** The whole stored `.idx`. */
  index: Uint8Array<ArrayBuffer>;
  fetchRange: RangeFetch;
  compute: ComputeWorker;
  /** A ref delta's base outside this pack. */
  readBase?: (oid: string) => Promise<StoredObject | undefined>;
  /** Resolved delta bases kept, in bytes; 8 MiB by default. */
  cacheBytes?: number;
}>;

const trailerBytes = 20;

type Span = Readonly<{ start: number; bytes: Uint8Array<ArrayBuffer> }>;

/** The longest Range read sent: the files host's segment ceiling (D7), which refuses a longer one. Bytes. */
export const maximumRangeBytes = 64 * 1024 * 1024;

/**
 * Merge ranges that touch into one: contiguous only, never across a gap, and
 * never past {@link maximumRangeBytes}.
 *
 * @param ranges - `[start, end)` pairs, in any order.
 * @returns The merged ranges, ascending.
 */
export const coalesceRanges = (ranges: Iterable<readonly [number, number]>): Array<[number, number]> => {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of [...ranges].toSorted((left, right) => left[0] - right[0])) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1] && Math.max(last[1], end) - last[0] <= maximumRangeBytes) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

/**
 * Open a pack on the server through its stored index: the index is checked
 * against its own trailer and the pack's name, never rebuilt.
 *
 * @param options - The pack, its index and its Range reader.
 * @returns Its objects, read by Range.
 * @throws TypeError when the index is not whole or names another pack.
 */
export const openRemotePack = async (options: RemotePackOptions): Promise<RemotePack> => {
  const { name, size, fetchRange, compute } = options;
  await checkPackIndexChecksum(options.index, compute.sha1);
  const index = readPackIndex(options.index, { checksumChecked: true });
  if (!name.startsWith(`pack-${index.packChecksum}`)) {
    throw new TypeError(`The index of ${name} is the index of another pack.`);
  }
  const counters: RemotePackCounters = { rangeRequests: 0, bytesFetched: 0, waves: 0 };
  const spans: Span[] = [];
  const heldAt = (offset: number, length: number): Uint8Array<ArrayBuffer> | undefined => {
    for (const span of spans) {
      if (offset >= span.start && offset + length <= span.start + span.bytes.byteLength) {
        return span.bytes.subarray(offset - span.start, offset - span.start + length);
      }
    }
    return undefined;
  };
  const fetchSpan = async (start: number, end: number): Promise<Span> => {
    counters.rangeRequests += 1;
    const bytes = await fetchRange(start, end - start);
    if (bytes.byteLength !== end - start) {
      throw new TypeError(
        `A Range read of ${name} answered ${String(bytes.byteLength)} bytes, not ${String(end - start)}.`,
      );
    }
    counters.bytesFetched += bytes.byteLength;
    return { start, bytes };
  };
  const reader: PackReader = createPackReader({
    path: name,
    size,
    index,
    readRange: async (_path, offset, length) => {
      const held = heldAt(offset, length);
      if (held !== undefined) {
        return held;
      }
      const span = await fetchSpan(offset, offset + length);
      return span.bytes;
    },
    compute,
    cache: createBaseCache(options.cacheBytes ?? 8 * 1024 * 1024),
    counters: emptyReadCounters(),
    readBase: async (oid) => options.readBase?.(oid),
  });
  /* The trailer rides with the first wave, so checking it costs no request of its own. */
  let trailerFetched = false;

  const readMany = async (oids: Iterable<string>): Promise<Map<string, StoredObject>> => {
    const held = [...new Set(oids)].filter((oid) => index.offsetOf(oid) !== undefined);
    let wave = new Set(held.map((oid) => index.offsetOf(oid)!));
    for (let depth = 0; wave.size > 0; depth += 1) {
      if (depth > maximumDeltaDepth) {
        throw new TypeError(`A delta chain in ${name} is longer than ${String(maximumDeltaDepth)}.`);
      }
      counters.waves += 1;
      const ranges: Array<[number, number]> = [...wave].map((offset) => [offset, index.endOf(offset, size)]);
      if (!trailerFetched) {
        ranges.push([size - trailerBytes, size]);
        trailerFetched = true;
      }
      // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
      const fetched = await Promise.all(coalesceRanges(ranges).map(async ([start, end]) => fetchSpan(start, end)));
      spans.push(...fetched);
      const next = new Set<number>();
      for (const offset of wave) {
        const base = deltaBaseOf(heldAt(offset, index.endOf(offset, size) - offset)!, offset);
        const baseOffset = base === undefined ? undefined : 'offset' in base ? base.offset : index.offsetOf(base.oid);
        if (baseOffset !== undefined && heldAt(baseOffset, index.endOf(baseOffset, size) - baseOffset) === undefined) {
          next.add(baseOffset);
        }
      }
      wave = next;
    }
    try {
      const read = await Promise.all(held.map(async (oid) => [oid, await reader.read(oid)] as const));
      return new Map(read.filter((entry): entry is readonly [string, StoredObject] => entry[1] !== undefined));
    } finally {
      /* What one call fetched is held only for that call. */
      spans.length = 0;
    }
  };

  /* One call at a time: a call's ranges are held for it alone and dropped when it ends. */
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = async (oids: Iterable<string>): Promise<Map<string, StoredObject>> => {
    const previous = queue;
    const run = (async (): Promise<Map<string, StoredObject>> => {
      try {
        await previous;
      } catch {
        /* The call before failed on its own; this one runs regardless. */
      }
      return readMany(oids);
    })();
    queue = run;
    return run;
  };

  return Object.freeze({ name, index, counters, readMany: serialized });
};
