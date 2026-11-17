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
 * the refs its sync policy names. Calls do not wait for each other: each holds
 * its own spans, and all of them share the pack's one Range pool.
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
import type { CopiedObject, PackReader, StoredObject } from '#pack-reader/pack-reader.js';
import { createLimiter } from '#object-store/pooled.js';

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

/** Range reads in flight at once, per pack, whatever the calls. */
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
   * The objects of `oids` this pack holds, read in coalesced waves. Calls run
   * side by side, each with its own spans, under the pack's one Range pool.
   *
   * @param oids - Lowercase hex object ids; those this pack lacks are left out.
   * @returns Each held object by id, checked against its id; a whole entry
   *   with the deflated body it inflated from.
   */
  readMany: (oids: Iterable<string>) => Promise<Map<string, CopiedObject>>;
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

/*
 * Every one of `work` settled, then their answers in order, or the first failure: a call that fails
 * returns only once none of its reads, inflates or checks is still running.
 */
const allSettled = async <Result>(work: ReadonlyArray<Promise<Result>>): Promise<Result[]> => {
  await Promise.allSettled(work);
  /* Settled already: this answers at once, with the first failure in order. */
  return Promise.all(work);
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
  /* One pool for the pack: calls that run side by side share its Range reads, never multiply them. */
  const limit = createLimiter(rangeStreams);
  /* Resolved delta bases, by offset: shared by every call, since a pack's bytes never change. */
  const cache = createBaseCache(options.cacheBytes ?? 8 * 1024 * 1024);
  /* The trailer, once a wave has fetched it: the reader checks it per call without a request of its own. */
  let trailer: Span | undefined;
  /* A wave that is fetching the trailer: a call side by side waits for it rather than ask again. */
  let trailerLanding: Promise<void> | undefined;

  /*
   * One call's reads: the spans it fetched are its own, held for it alone and
   * dropped when it ends, so calls run side by side (a cold open walks the
   * trees while it reads the blobs) and none waits for another's waves.
   */
  const readMany = async (oids: Iterable<string>): Promise<Map<string, CopiedObject>> => {
    /* Held spans, ascending by start and never overlapping: each is whole entries, or one entry's cut. */
    const spans: Span[] = [];
    let failed = false;
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
      if (trailer !== undefined && offset === trailer.start && length === trailerBytes) {
        return trailer.bytes;
      }
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
    const fetchSpan = async (start: number, end: number): Promise<Span> =>
      limit(async () => {
        /* A call that failed starts no read it still had queued. */
        if (failed) {
          throw new Error(`A Range read of ${name} was dropped: its call had already failed.`);
        }
        counters.rangeRequests += 1;
        try {
          const bytes = await fetchRange(start, end - start);
          if (bytes.byteLength !== end - start) {
            throw new TypeError(
              `A Range read of ${name} answered ${String(bytes.byteLength)} bytes, not ${String(end - start)}.`,
            );
          }
          counters.bytesFetched += bytes.byteLength;
          return { start, bytes };
        } catch (error) {
          /* Marked before the slot is handed on, so the read queued next does not start. */
          failed = true;
          throw error;
        }
      });
    const reader: PackReader = createPackReader({
      path: name,
      size,
      index,
      readRange: async (_path, offset, length) => {
        const held = heldAt(offset, length);
        if (held !== undefined) {
          return held;
        }
        if (offset === size - trailerBytes && trailerLanding !== undefined) {
          await trailerLanding;
          const landed = heldAt(offset, length);
          if (landed !== undefined) {
            return landed;
          }
        }
        const span = await fetchSpan(offset, offset + length);
        return span.bytes;
      },
      compute,
      cache,
      counters: emptyReadCounters(),
      readBase: async (oid) => options.readBase?.(oid),
    });

    try {
      const held = [...new Set(oids)].filter((oid) => index.offsetOf(oid) !== undefined);
      let wave = new Set(held.map((oid) => index.offsetOf(oid)!));
      for (let depth = 0; wave.size > 0; depth += 1) {
        if (depth > maximumDeltaDepth) {
          throw new TypeError(`A delta chain in ${name} is longer than ${String(maximumDeltaDepth)}.`);
        }
        counters.waves += 1;
        const ranges: Array<[number, number]> = [...wave].map((offset) => [offset, index.endOf(offset, size)]);
        /* The trailer rides with the first wave of the first call, so checking it costs no request of its own. */
        const landing =
          trailer === undefined && trailerLanding === undefined ? Promise.withResolvers<void>() : undefined;
        if (landing !== undefined) {
          trailerLanding = landing.promise;
          ranges.push([size - trailerBytes, size]);
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
          const fetched = await allSettled(coalesceRanges(ranges).map(async ([start, end]) => fetchSpan(start, end)));
          spans.push(...fetched);
          spans.sort((left, right) => left.start - right.start);
          if (landing !== undefined) {
            /* Only once it landed: after a wave that failed, the next asks for it again. Copied, so it holds no span. */
            trailer ??= {
              start: size - trailerBytes,
              bytes: new Uint8Array(heldAt(size - trailerBytes, trailerBytes)!),
            };
          }
        } finally {
          if (landing !== undefined) {
            trailerLanding = undefined;
            landing.resolve();
          }
        }
        const next = new Set<number>();
        for (const offset of wave) {
          const base = deltaBaseOf(heldAt(offset, index.endOf(offset, size) - offset)!, offset);
          const baseOffset = base === undefined ? undefined : 'offset' in base ? base.offset : index.offsetOf(base.oid);
          if (
            baseOffset !== undefined &&
            heldAt(baseOffset, index.endOf(baseOffset, size) - baseOffset) === undefined
          ) {
            next.add(baseOffset);
          }
        }
        wave = next;
      }
      const read = await allSettled(
        held.map(async (oid) => {
          /* A whole entry keeps its deflated body: the object it inflated to is checked below, so a store keeps
           * those bytes as they are rather than deflate the object again. */
          const copied = await reader.readForCopy(oid);
          /* Each object is checked against its id: the index and the trailer vouch for the pack, not the transfer. */
          if (copied !== undefined && (await compute.sha1(frameObject(copied.type, copied.data))) !== oid) {
            throw new TypeError(`A Range read of ${name} answered other bytes for ${oid}.`);
          }
          /* A body cut out of a wider read is copied, so no object pins the whole Range read behind it. */
          const compressed = copied?.compressed;
          const object =
            compressed === undefined || compressed.byteLength === compressed.buffer.byteLength
              ? copied
              : { ...copied!, compressed: new Uint8Array(compressed) };
          return [oid, object] as const;
        }),
      );
      return new Map(read.filter((entry): entry is readonly [string, CopiedObject] => entry[1] !== undefined));
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      /* What one call fetched is held only for that call. */
      spans.length = 0;
    }
  };

  const entryBytes = (oid: string): number | undefined => {
    const offset = index.offsetOf(oid);
    return offset === undefined ? undefined : index.endOf(offset, size) - offset;
  };

  return Object.freeze({ name, index, counters, entryBytes, readMany });
};
