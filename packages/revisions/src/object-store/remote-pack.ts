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
 * {@link RemotePack.readAhead} fetches the entries of ids known up front (a
 * head listing's blobs) and their bases before anything asks for them, under
 * a byte budget: a later call finds them held, or landing, and sends no
 * request of its own, so its waves are no longer round trips.
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

/** Of {@link rangeStreams}, the most a read-ahead holds: the rest stay free for the reads that wait on an answer. */
const aheadStreams = 24;

/**
 * The longest read a read-ahead sends, in bytes. What it asks for is mostly
 * one run of the pack (git writes a head's objects together), so it is cut:
 * the pieces land side by side, and a call waiting on one entry waits for its
 * own pieces alone rather than the whole run.
 */
const aheadPieceBytes = 1024 * 1024;

/** What a read-ahead still may fetch, in stored bytes: shared by every pack it reads, and spent as it asks. */
export type ReadAheadBudget = { bytes: number };

/** A read-ahead in flight or landed. */
export type ReadAhead = Readonly<{
  /**
   * Drop what it holds, once every read it started has settled: queued reads never start.
   *
   * @returns Once nothing of it runs or is held.
   */
  release: () => Promise<void>;
}>;

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
  /**
   * Fetch ahead: the stored entries of `oids`, in order while they fit the
   * budget, and then their delta bases while those fit, read now in coalesced
   * waves and held for every call until released. A call that wants one of
   * them waits for it rather than ask again. A read-ahead that fails fails
   * only the calls that wait on what it was reading.
   *
   * @param oids - Lowercase hex object ids; those this pack lacks are left out.
   * @param budget - The stored bytes it may fetch; spent as it asks.
   * @returns Its handle, to release once the reads it served are done.
   */
  readAhead: (oids: Iterable<string>, budget: ReadAheadBudget) => ReadAhead;
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

/* The last span of `spans` (ascending by start) starting at or before `offset`, by binary search. */
const spanBefore = (spans: readonly Span[], offset: number): number => {
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

/* `length` bytes from `offset` when `spans` hold every one of them: an entry cut across reads is stitched back. */
const heldIn = (spans: readonly Span[], offset: number, length: number): Uint8Array<ArrayBuffer> | undefined => {
  let at = spanBefore(spans, offset);
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
  /* One inside a read is a view of it. */
  return parts.length === 1 ? parts[0] : concatBytes(...parts);
};

/* Insert `added` into `spans`, keeping them ascending by start. */
const insertSpans = (spans: Span[], added: readonly Span[]): void => {
  spans.push(...added);
  spans.sort((left, right) => left.start - right.start);
};

/* What a wait on reads came to: `undefined` once all landed, else the first failure, held rather than thrown. */
type Landed = Promise<Readonly<{ error: unknown }> | undefined>;

/* Wait for `reads` without ever rejecting: a read-ahead's waiters take the failure up only if one waits. */
const settledFailure = async (reads: ReadonlyArray<Promise<unknown>>): Landed => {
  try {
    await Promise.all(reads);
    return undefined;
  } catch (error) {
    return { error };
  }
};

/* A call's or a read-ahead's own state: once failed, it starts no read it still had queued. */
type Reads = { failed: boolean; stopped: string };

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
  /* What read-aheads hold, ascending by start, for every call; and the entries they are still fetching, by offset. */
  const ahead: Span[] = [];
  const aheadLanding = new Map<number, Landed>();
  const aheadLimit = createLimiter(aheadStreams);

  const fetchSpan = async (start: number, end: number, reads: Reads): Promise<Span> =>
    limit(async () => {
      /* A call that failed starts no read it still had queued. */
      if (reads.failed) {
        throw new Error(`A Range read of ${name} was dropped: ${reads.stopped}.`);
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
        reads.failed = true;
        throw error;
      }
    });

  /* The base an entry's header names, as an offset in this pack, or `undefined` for a whole entry or one elsewhere. */
  const baseOffsetOf = (offset: number, entry: Uint8Array<ArrayBuffer>): number | undefined => {
    const base = deltaBaseOf(entry, offset);
    return base === undefined ? undefined : 'offset' in base ? base.offset : index.offsetOf(base.oid);
  };

  /*
   * One call's reads: the spans it fetched are its own, held for it alone and
   * dropped when it ends, so calls run side by side (a cold open walks the
   * trees while it reads the blobs) and none waits for another's waves.
   */
  const readMany = async (oids: Iterable<string>): Promise<Map<string, CopiedObject>> => {
    /* Held spans, ascending by start and never overlapping: each is whole entries, or one entry's cut. */
    const spans: Span[] = [];
    const reads: Reads = { failed: false, stopped: 'its call had already failed' };
    /* What this call fetched, else what a read-ahead holds. */
    const heldAt = (offset: number, length: number): Uint8Array<ArrayBuffer> | undefined => {
      if (trailer !== undefined && offset === trailer.start && length === trailerBytes) {
        return trailer.bytes;
      }
      return heldIn(spans, offset, length) ?? heldIn(ahead, offset, length);
    };
    const entryAt = (offset: number): Uint8Array<ArrayBuffer> | undefined =>
      heldAt(offset, index.endOf(offset, size) - offset);
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
        const span = await fetchSpan(offset, offset + length, reads);
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
        /* What a read-ahead holds is not asked again, and what it is still fetching is waited for. */
        const waiting = new Set<Landed>();
        const ranges: Array<[number, number]> = [];
        for (const offset of wave) {
          const landingAhead = entryAt(offset) === undefined ? aheadLanding.get(offset) : undefined;
          if (landingAhead !== undefined) {
            waiting.add(landingAhead);
          } else if (entryAt(offset) === undefined) {
            ranges.push([offset, index.endOf(offset, size)]);
          }
        }
        /* The trailer rides with the first wave that asks for anything, so checking it costs no request of its own. */
        const landing =
          ranges.length > 0 && trailer === undefined && trailerLanding === undefined
            ? Promise.withResolvers<void>()
            : undefined;
        if (landing !== undefined) {
          trailerLanding = landing.promise;
          ranges.push([size - trailerBytes, size]);
        }
        if (ranges.length > 0) {
          counters.waves += 1;
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
          const fetched = await allSettled<Span | void>([
            ...coalesceRanges(ranges).map(async ([start, end]) => fetchSpan(start, end, reads)),
            ...[...waiting].map(async (landed) => {
              const failure = await landed;
              if (failure !== undefined) {
                throw failure.error;
              }
            }),
          ]);
          insertSpans(
            spans,
            fetched.filter((span): span is Span => span !== undefined),
          );
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
          const entry = entryAt(offset);
          if (entry === undefined) {
            /* A read-ahead released while this call waited on it: the entry is asked for in the next wave. */
            next.add(offset);
            continue;
          }
          const baseOffset = baseOffsetOf(offset, entry);
          if (baseOffset !== undefined && entryAt(baseOffset) === undefined) {
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
      reads.failed = true;
      throw error;
    } finally {
      /* What one call fetched is held only for that call. */
      spans.length = 0;
    }
  };

  /*
   * One read-ahead wave, `order` the entries in the order they were asked for: cut into pieces that take the pool in
   * that order (the trailer first, when no read has it yet), each held the moment it lands, so a call waiting on one
   * entry waits for its own pieces alone.
   */
  const aheadWave = async (order: readonly number[], reads: Reads, own: Span[]): Promise<void> => {
    const ranges: Array<[number, number]> = order.map((offset) => [offset, index.endOf(offset, size)]);
    const landingTrailer =
      trailer === undefined && trailerLanding === undefined ? Promise.withResolvers<void>() : undefined;
    if (landingTrailer !== undefined) {
      trailerLanding = landingTrailer.promise;
    }
    /* Calls waiting on the trailer go on once it lands, or once this wave ends without it. */
    const settleTrailer = (): void => {
      if (landingTrailer !== undefined && trailerLanding === landingTrailer.promise) {
        trailerLanding = undefined;
      }
      landingTrailer?.resolve();
    };
    const pieces = coalesceRanges(ranges).flatMap(([start, end]) =>
      Array.from({ length: Math.ceil((end - start) / aheadPieceBytes) }, (_value, at) => {
        const from = start + at * aheadPieceBytes;
        const to = Math.min(end, from + aheadPieceBytes);
        /* Ranked by the first-asked entry it holds any byte of. */
        const rank = ranges.findIndex(([entry, entryEnd]) => entry < to && from < entryEnd);
        return { start: from, end: to, rank };
      }),
    );
    if (landingTrailer !== undefined) {
      pieces.push({ start: size - trailerBytes, end: size, rank: -1 });
    }
    const fetchPiece = async (piece: (typeof pieces)[number]): Promise<Span> => {
      const span = await aheadLimit(async () => fetchSpan(piece.start, piece.end, reads));
      own.push(span);
      insertSpans(ahead, [span]);
      if (piece.rank === -1) {
        trailer ??= { start: span.start, bytes: new Uint8Array(span.bytes) };
        settleTrailer();
      }
      return span;
    };
    const landing = pieces
      .toSorted((left, right) => left.rank - right.rank)
      .map((piece) => ({ ...piece, span: fetchPiece(piece) }));
    for (const [offset, end] of ranges) {
      aheadLanding.set(
        offset,
        settledFailure(
          landing.filter((piece) => piece.start < end && offset < piece.end).map(async (piece) => piece.span),
        ),
      );
    }
    try {
      await allSettled(landing.map(async (piece) => piece.span));
    } finally {
      for (const offset of order) {
        aheadLanding.delete(offset);
      }
      settleTrailer();
    }
  };

  const readAhead = (oids: Iterable<string>, budget: ReadAheadBudget): ReadAhead => {
    /* Its spans, also in `ahead` while it is held. */
    const own: Span[] = [];
    const reads: Reads = { failed: false, stopped: 'its read-ahead had failed or was released' };
    /* Ask for an entry only while the budget lasts: the rest is read when it is wanted, as before. */
    const affordable = (offset: number): boolean => {
      const bytes = index.endOf(offset, size) - offset;
      if (bytes > budget.bytes) {
        return false;
      }
      budget.bytes -= bytes;
      return true;
    };
    const unasked = (offset: number): boolean =>
      heldIn(ahead, offset, index.endOf(offset, size) - offset) === undefined && !aheadLanding.has(offset);
    const first = new Set<number>();
    for (const oid of oids) {
      const offset = index.offsetOf(oid);
      if (offset !== undefined && !first.has(offset) && unasked(offset)) {
        if (!affordable(offset)) {
          break;
        }
        first.add(offset);
      }
    }
    /* The bases of `wave` it has not asked for, while the budget lasts. */
    const basesOf = (wave: ReadonlySet<number>): Set<number> => {
      const next = new Set<number>();
      for (const offset of wave) {
        const baseOffset = baseOffsetOf(offset, heldIn(ahead, offset, index.endOf(offset, size) - offset)!);
        if (baseOffset !== undefined && !next.has(baseOffset) && unasked(baseOffset) && affordable(baseOffset)) {
          next.add(baseOffset);
        }
      }
      return next;
    };
    const run = async (): Promise<void> => {
      let wave = first;
      for (let depth = 0; wave.size > 0 && depth <= maximumDeltaDepth && !reads.failed; depth += 1) {
        counters.waves += 1;
        // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
        await aheadWave([...wave], reads, own);
        wave = basesOf(wave);
      }
    };
    /* A read-ahead's failure reaches the calls waiting on it; past them, what it did not fetch is asked again. */
    const done = (async (): Promise<void> => {
      try {
        await run();
      } catch {
        /* Told to the calls that waited on it. */
      }
    })();
    return Object.freeze({
      release: async () => {
        reads.failed = true;
        await done;
        const dropped = new Set(own);
        const kept = ahead.filter((span) => !dropped.has(span));
        ahead.length = 0;
        ahead.push(...kept);
        own.length = 0;
      },
    });
  };

  const entryBytes = (oid: string): number | undefined => {
    const offset = index.offsetOf(oid);
    return offset === undefined ? undefined : index.endOf(offset, size) - offset;
  };

  return Object.freeze({ name, index, counters, entryBytes, readMany, readAhead });
};
