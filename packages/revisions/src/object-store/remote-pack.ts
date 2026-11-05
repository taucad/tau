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
import { frameObject } from '#git-objects.js';
import { concatBytes } from '#object-hash.js';
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

/** Range reads in flight at once, per pack. */
const rangeStreams = 32;

/** A pack on the server, read by Range through its index. */
export type RemotePack = Readonly<{
  name: string;
  index: PackIndex;
  counters: Readonly<RemotePackCounters>;
  /**
   * An object's stored bytes, from the index alone: what a read of it fetches, before its base.
   *
   * @param oid - Lowercase hex object id.
   * @returns Its entry's length, or `undefined` when this pack lacks it.
   */
  entryBytes: (oid: string) => number | undefined;
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
 * never past {@link maximumRangeBytes}. A single range longer than that is
 * cut into reads of at most that length.
 *
 * @param ranges - `[start, end)` pairs, in any order.
 * @returns The merged ranges, ascending, none longer than {@link maximumRangeBytes}.
 */
export const coalesceRanges = (ranges: Iterable<readonly [number, number]>): Array<[number, number]> => {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of [...ranges].toSorted((left, right) => left[0] - right[0])) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last[1] && Math.max(last[1], end) - last[0] <= maximumRangeBytes) {
      last[1] = Math.max(last[1], end);
    } else {
      for (let at = Math.max(start, last?.[1] ?? start); at < end; at += maximumRangeBytes) {
        merged.push([at, Math.min(end, at + maximumRangeBytes)]);
      }
    }
  }
  return merged;
};

/* Run each item through `run`, at most `limit` at once, answers in order. */
const pooled = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const at = next;
      next += 1;
      // oxlint-disable-next-line no-await-in-loop -- a lane takes the next item only when its last one landed.
      results[at] = await run(items[at]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
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
  /* Held spans, ascending by start and never overlapping: each is whole entries, or one entry's cut. */
  const spans: Span[] = [];
  /* The last span starting at or before `offset`, by binary search. */
  const spanBefore = (offset: number): number => {
    let low = 0;
    let high = spans.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (spans[middle]!.start <= offset) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  };
  const heldAt = (offset: number, length: number): Uint8Array<ArrayBuffer> | undefined => {
    let at = spanBefore(offset);
    const end = offset + length;
    const parts: Array<Uint8Array<ArrayBuffer>> = [];
    let reached = offset;
    while (reached < end) {
      const span = spans[at];
      const spanEnd = span === undefined ? 0 : span.start + span.bytes.byteLength;
      if (span === undefined || span.start > reached || spanEnd <= reached) {
        return undefined;
      }
      parts.push(span.bytes.subarray(reached - span.start, Math.min(spanEnd, end) - span.start));
      reached = Math.min(spanEnd, end);
      at += 1;
    }
    /* An entry cut across reads is stitched back; one inside a read is a view of it. */
    return parts.length === 1 ? parts[0] : concatBytes(...parts);
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
      }
      // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
      const fetched = await pooled(coalesceRanges(ranges), rangeStreams, async ([start, end]) => fetchSpan(start, end));
      if (!trailerFetched) {
        /* Only once it landed: a wave that failed asks for the trailer again. */
        trailerFetched = true;
      }
      spans.push(...fetched);
      spans.sort((left, right) => left.start - right.start);
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
      const read = await Promise.all(
        held.map(async (oid) => {
          const object = await reader.read(oid);
          /* Each object is checked against its id: the index and the trailer vouch for the pack, not the transfer. */
          if (object !== undefined && (await compute.sha1(frameObject(object.type, object.data))) !== oid) {
            throw new TypeError(`A Range read of ${name} answered other bytes for ${oid}.`);
          }
          return [oid, object] as const;
        }),
      );
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

  const entryBytes = (oid: string): number | undefined => {
    const offset = index.offsetOf(oid);
    return offset === undefined ? undefined : index.endOf(offset, size) - offset;
  };

  return Object.freeze({ name, index, counters, entryBytes, readMany: serialized });
};
