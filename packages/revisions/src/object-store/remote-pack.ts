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
 * head listing's trees and blobs) and their bases before anything asks for
 * them, under a byte budget: a later call finds them held, or landing, and
 * sends no request of its own, so its waves are no longer round trips. Each
 * entry it holds is its own bytes, dropped once a call has read it and no
 * entry it holds still names it as a base.
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

/** One Range read of the pack: exactly `length` bytes from `offset`; `signal` ends a read nothing waits for. */
export type RangeFetch = (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>;

/** What a remote pack's reads cost, for gates. */
export type RemotePackCounters = {
  /** Range requests sent. */
  rangeRequests: number;
  /** Bytes those requests answered. */
  bytesFetched: number;
  /** Waves {@link RemotePack.readMany} and {@link RemotePack.readAhead} took that sent a request. */
  waves: number;
  /** Stored bytes read-aheads hold now. */
  aheadHeldBytes: number;
  /** The most stored bytes read-aheads held at once. */
  aheadPeakBytes: number;
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
   * Drop what it holds: queued reads never start, reads in flight are ended,
   * and a call still waiting on one of its entries asks for it itself.
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
   * waves. A call that wants one of them waits for it rather than ask again;
   * an entry is dropped once a call has read it and no held entry names it as
   * a base. A read that fails fails the calls waiting on its entries with its
   * own error and ends the read-ahead's other reads; a call waiting on an
   * entry a read-ahead dropped asks for it itself.
   *
   * @param oids - Lowercase hex object ids; those this pack lacks are left out.
   * @param budget - The stored bytes it may fetch, finite and not negative; spent as it asks.
   * @returns Its handle, to release once the reads it served are done.
   * @throws RangeError when the budget is not a finite count of bytes.
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

/* Insert `added` into `spans` at its place by start, by binary search. */
const insertSpan = (spans: Span[], added: Span): void => {
  spans.splice(spanBefore(spans, added.start) + 1, 0, added);
};

/* A call's or a read-ahead's own state: once failed, it starts no read it still had queued. */
type Reads = { failed: boolean; stopped: string };

/* A queued read that never started because its call or read-ahead had stopped: not the cause of anything. */
class ReadDropped extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReadDropped';
  }
}

/* How a read-ahead's entry came out: held, dropped unread (its waiter asks for it itself), or failed with the cause. */
type Outcome = 'held' | 'dropped' | Readonly<{ error: unknown }>;

/* An entry a read-ahead asked for. */
type AheadEntry = {
  readonly end: number;
  /* Asked for by id, so dropped once a call has read it; a base alone is dropped once nothing held names it. */
  readonly asked: boolean;
  /* The read-ahead that holds it. */
  readonly owner: symbol;
  readonly landed: Promise<Outcome>;
  readonly settle: (outcome: Outcome) => void;
  /* Its bytes, stitched once from the pieces it was read in. */
  bytes: Uint8Array<ArrayBuffer> | undefined;
  /* Its pieces' views while some are still in flight. */
  parts: Array<Uint8Array<ArrayBuffer> | undefined>;
  missing: number;
  /* Held entries that name it as their base. */
  refs: number;
  /* The held entry it names as its base. */
  base: number | undefined;
  read: boolean;
};

/* A piece of a read-ahead wave and the entries (with the part each fills) it holds bytes of. */
type Piece = { readonly start: number; readonly end: number; rank: number; readonly fills: Array<[number, number]> };

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
 * A read-ahead wave's pieces: its entries (ascending, none overlapping) coalesced and cut at `pieceBytes`, each piece
 * ranked by the first-asked entry it holds bytes of and naming the part of each entry it fills. One sweep: linear in
 * entries and pieces.
 */
export const aheadPieces = (
  entries: ReadonlyArray<Readonly<{ start: number; end: number; rank: number }>>,
  pieceBytes: number,
): Piece[] => {
  const pieces: Piece[] = [];
  for (const [start, end] of coalesceRanges(entries.map((entry) => [entry.start, entry.end] as const))) {
    for (let from = start; from < end; from += pieceBytes) {
      pieces.push({ start: from, end: Math.min(end, from + pieceBytes), rank: Number.POSITIVE_INFINITY, fills: [] });
    }
  }
  let first = 0;
  for (const [at, entry] of entries.entries()) {
    while (pieces[first]!.end <= entry.start) {
      first += 1;
    }
    let part = 0;
    for (let piece = first; piece < pieces.length && pieces[piece]!.start < entry.end; piece += 1) {
      pieces[piece]!.fills.push([at, part]);
      pieces[piece]!.rank = Math.min(pieces[piece]!.rank, entry.rank);
      part += 1;
    }
  }
  return pieces;
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
  const counters: RemotePackCounters = {
    rangeRequests: 0,
    bytesFetched: 0,
    waves: 0,
    aheadHeldBytes: 0,
    aheadPeakBytes: 0,
  };
  /* One pool for the pack: calls that run side by side share its Range reads, never multiply them. */
  const limit = createLimiter(rangeStreams);
  /* Resolved delta bases, by offset: shared by every call, since a pack's bytes never change. */
  const cache = createBaseCache(options.cacheBytes ?? 8 * 1024 * 1024);
  /* The trailer, once a wave has fetched it: the reader checks it per call without a request of its own. */
  let trailer: Span | undefined;
  /* A wave that is fetching the trailer: a call side by side waits for it rather than ask again. */
  let trailerLanding: Promise<void> | undefined;
  /* What read-aheads asked for, by entry offset: held, or still landing. */
  const ahead = new Map<number, AheadEntry>();
  const aheadLimit = createLimiter(aheadStreams);
  /* Entries a call is fetching now, by offset, so a read-ahead does not ask for them again. */
  const asking = new Map<number, number>();
  const entryEnd = (offset: number): number => index.endOf(offset, size);

  const fetchSpan = async (
    [start, end]: readonly [number, number],
    reads: Reads,
    signal?: AbortSignal,
  ): Promise<Span> =>
    limit(async () => {
      /* A call that failed starts no read it still had queued. */
      if (reads.failed) {
        throw new ReadDropped(`A Range read of ${name} was dropped: ${reads.stopped}.`);
      }
      counters.rangeRequests += 1;
      try {
        const bytes = await fetchRange(start, end - start, signal);
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

  /* Drop a read-ahead's entry, and the base it named once nothing else held needs that. */
  const dropAhead = (offset: number): void => {
    const entry = ahead.get(offset);
    if (entry === undefined) {
      return;
    }
    ahead.delete(offset);
    counters.aheadHeldBytes -= entry.bytes?.byteLength ?? 0;
    entry.bytes = undefined;
    entry.parts = [];
    const base = entry.base === undefined ? undefined : ahead.get(entry.base);
    if (base !== undefined) {
      base.refs -= 1;
      if (base.refs === 0 && (base.read || !base.asked)) {
        dropAhead(entry.base!);
      }
    }
  };

  /* A call has read `offset`: an entry asked for by id is dropped unless a held entry still names it as its base. */
  const readAheadEntry = (offset: number): void => {
    const entry = ahead.get(offset);
    if (entry?.bytes !== undefined && entry.asked) {
      entry.read = true;
      if (entry.refs === 0) {
        dropAhead(offset);
      }
    }
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
    /* What this call fetched, else what a read-ahead holds: a whole entry, or a prefix of one. */
    const heldAt = (offset: number, length: number): Uint8Array<ArrayBuffer> | undefined => {
      if (trailer !== undefined && offset === trailer.start && length === trailerBytes) {
        return trailer.bytes;
      }
      const own = heldIn(spans, offset, length);
      if (own !== undefined) {
        return own;
      }
      const bytes = ahead.get(offset)?.bytes;
      return bytes === undefined || bytes.byteLength < length
        ? undefined
        : bytes.byteLength === length
          ? bytes
          : bytes.subarray(0, length);
    };
    const entryAt = (offset: number): Uint8Array<ArrayBuffer> | undefined => heldAt(offset, entryEnd(offset) - offset);
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
        const span = await fetchSpan([offset, offset + length], reads);
        return span.bytes;
      },
      compute,
      cache,
      counters: emptyReadCounters(),
      readBase: async (oid) => options.readBase?.(oid),
    });

    /* Fetch the entries at `offsets` this call holds no bytes of; the trailer rides with the first that asks. */
    const fetchEntries = async (offsets: readonly number[]): Promise<void> => {
      const ranges: Array<[number, number]> = offsets.map((offset) => [offset, entryEnd(offset)]);
      if (ranges.length === 0) {
        return;
      }
      const landing = trailer === undefined && trailerLanding === undefined ? Promise.withResolvers<void>() : undefined;
      if (landing !== undefined) {
        trailerLanding = landing.promise;
        ranges.push([size - trailerBytes, size]);
      }
      counters.waves += 1;
      for (const offset of offsets) {
        asking.set(offset, (asking.get(offset) ?? 0) + 1);
      }
      try {
        const fetched = await allSettled(
          coalesceRanges(ranges).map(async ([start, end]) => fetchSpan([start, end], reads)),
        );
        for (const span of fetched) {
          insertSpan(spans, span);
        }
        if (landing !== undefined) {
          /* Only once it landed: after a wave that failed, the next asks for it again. Copied, so it holds no span. */
          trailer ??= { start: size - trailerBytes, bytes: new Uint8Array(heldAt(size - trailerBytes, trailerBytes)!) };
        }
      } finally {
        for (const offset of offsets) {
          const count = asking.get(offset)! - 1;
          if (count === 0) {
            asking.delete(offset);
          } else {
            asking.set(offset, count);
          }
        }
        if (landing !== undefined) {
          trailerLanding = undefined;
          landing.resolve();
        }
      }
    };

    const held = [...new Set(oids)].filter((oid) => index.offsetOf(oid) !== undefined);
    try {
      let wave = new Set(held.map((oid) => index.offsetOf(oid)!));
      for (let depth = 0; wave.size > 0; depth += 1) {
        if (depth > maximumDeltaDepth) {
          throw new TypeError(`A delta chain in ${name} is longer than ${String(maximumDeltaDepth)}.`);
        }
        /* What a read-ahead holds is not asked again, and what it is still fetching is waited for. */
        const waiting: Array<Promise<Outcome>> = [];
        const unheld: number[] = [];
        for (const offset of wave) {
          const pending = entryAt(offset) === undefined ? ahead.get(offset) : undefined;
          if (pending !== undefined) {
            waiting.push(pending.landed);
          } else if (entryAt(offset) === undefined) {
            unheld.push(offset);
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
        const [, outcomes] = await allSettled<unknown>([fetchEntries(unheld), Promise.all(waiting)]);
        /* A read that failed fails this call with its own cause; an entry a read-ahead dropped is asked for here. */
        const failure = (outcomes as Outcome[]).find((outcome) => typeof outcome === 'object');
        if (failure !== undefined && typeof failure === 'object') {
          throw failure.error;
        }
        // oxlint-disable-next-line no-await-in-loop -- only what a read-ahead dropped while this call waited.
        await fetchEntries([...wave].filter((offset) => entryAt(offset) === undefined));
        const next = new Set<number>();
        for (const offset of wave) {
          const entry = entryAt(offset);
          if (entry === undefined) {
            /* Dropped by a call beside this one while this one waited: asked for in the next wave. */
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
          if (copied === undefined) {
            return [oid, undefined] as const;
          }
          /*
           * Each object is checked against its id: the index and the trailer vouch for the pack, not the transfer. A
           * whole entry was hashed as it was inflated; a delta's target is hashed here.
           */
          const hashed = copied.hashedOid ?? (await compute.sha1(frameObject(copied.type, copied.data)));
          if (hashed !== oid) {
            throw new TypeError(`A Range read of ${name} answered other bytes for ${oid}.`);
          }
          /* A body cut out of a wider read is copied, so no object pins the whole Range read behind it. */
          const { compressed } = copied;
          const object: CopiedObject =
            compressed === undefined
              ? { type: copied.type, data: copied.data }
              : {
                  type: copied.type,
                  data: copied.data,
                  compressed:
                    compressed.byteLength === compressed.buffer.byteLength ? compressed : new Uint8Array(compressed),
                };
          return [oid, object] as const;
        }),
      );
      return new Map(read.filter((entry): entry is readonly [string, CopiedObject] => entry[1] !== undefined));
    } catch (error) {
      reads.failed = true;
      throw error;
    } finally {
      /* What one call fetched is held only for that call; what it read of a read-ahead is dropped there. */
      spans.length = 0;
      for (const oid of held) {
        readAheadEntry(index.offsetOf(oid)!);
      }
    }
  };

  const readAhead = (oids: Iterable<string>, budget: ReadAheadBudget): ReadAhead => {
    if (!Number.isFinite(budget.bytes) || budget.bytes < 0) {
      throw new RangeError(`A read-ahead budget must be a finite count of bytes, not ${String(budget.bytes)}.`);
    }
    const owner = Symbol('read-ahead');
    const reads: Reads = { failed: false, stopped: 'its read-ahead had stopped' };
    const ended = new AbortController();
    /* Stop: start nothing queued and end what is in flight; their entries are dropped, not failed. */
    const stop = (): void => {
      reads.failed = true;
      ended.abort();
    };
    /* Ask for an entry only while the budget lasts: the rest is read when it is wanted, as before. */
    const affordable = (offset: number): boolean => {
      const bytes = entryEnd(offset) - offset;
      if (bytes > budget.bytes) {
        return false;
      }
      budget.bytes -= bytes;
      return true;
    };
    const unasked = (offset: number): boolean => !ahead.has(offset) && !asking.has(offset);

    /* Register a wave's entries, so a call finds them landing from now on. */
    const register = (order: readonly number[], asked: boolean): void => {
      for (const offset of order) {
        const settled = Promise.withResolvers<Outcome>();
        ahead.set(offset, {
          end: entryEnd(offset),
          asked,
          owner,
          landed: settled.promise,
          settle: settled.resolve,
          bytes: undefined,
          parts: [],
          missing: 0,
          refs: 0,
          base: undefined,
          read: false,
        });
      }
    };

    /* An entry whose pieces have all landed: stitched once, held, and its waiters told. */
    const complete = (entry: AheadEntry): void => {
      const parts = entry.parts as Array<Uint8Array<ArrayBuffer>>;
      /* Copied out of its piece, so the piece is not pinned by it nor it by the piece. */
      entry.bytes = parts.length === 1 ? new Uint8Array(parts[0]!) : concatBytes(...parts);
      entry.parts = [];
      counters.aheadHeldBytes += entry.bytes.byteLength;
      counters.aheadPeakBytes = Math.max(counters.aheadPeakBytes, counters.aheadHeldBytes);
      entry.settle('held');
    };

    /*
     * One wave, `order` the entries in the order they were asked for: cut into pieces that take the pool in that
     * order (the trailer first, when no read has it yet), each entry held the moment its pieces land. Answers whether
     * every piece landed.
     */
    const aheadWave = async (order: readonly number[]): Promise<boolean> => {
      const rankOf = new Map(order.map((offset, rank) => [offset, rank]));
      const sorted = order.toSorted((left, right) => left - right);
      const pieces = aheadPieces(
        sorted.map((offset) => ({ start: offset, end: entryEnd(offset), rank: rankOf.get(offset)! })),
        aheadPieceBytes,
      );
      for (const piece of pieces) {
        for (const [at] of piece.fills) {
          const entry = ahead.get(sorted[at]!)!;
          entry.parts.push(undefined);
          entry.missing += 1;
        }
      }
      const landingTrailer =
        trailer === undefined && trailerLanding === undefined ? Promise.withResolvers<void>() : undefined;
      if (landingTrailer !== undefined) {
        trailerLanding = landingTrailer.promise;
      }
      let whole = true;
      const fetchPiece = async (piece: Piece): Promise<void> => {
        try {
          const span = await aheadLimit(async () => fetchSpan([piece.start, piece.end], reads, ended.signal));
          for (const [at, part] of piece.fills) {
            const offset = sorted[at]!;
            const entry = ahead.get(offset);
            if (entry?.owner === owner && entry.bytes === undefined) {
              const from = Math.max(offset, piece.start) - piece.start;
              entry.parts[part] = span.bytes.subarray(from, Math.min(entry.end, piece.end) - piece.start);
              entry.missing -= 1;
              if (entry.missing === 0) {
                complete(entry);
              }
            }
          }
        } catch (error) {
          whole = false;
          /* Dropped (stopped, or ended by a failure beside it) is not a cause: its waiters ask for it themselves. */
          const outcome: Outcome = error instanceof ReadDropped || ended.signal.aborted ? 'dropped' : { error };
          if (outcome !== 'dropped') {
            stop();
          }
          for (const [at] of piece.fills) {
            const offset = sorted[at]!;
            const entry = ahead.get(offset);
            if (entry?.owner === owner && entry.bytes === undefined) {
              ahead.delete(offset);
              entry.settle(outcome);
            }
          }
        }
      };
      const fetchTrailer = async (): Promise<void> => {
        try {
          const span = await aheadLimit(async () => fetchSpan([size - trailerBytes, size], reads, ended.signal));
          trailer ??= { start: span.start, bytes: new Uint8Array(span.bytes) };
        } catch {
          /* A call that wants the trailer asks for it itself. */
        } finally {
          if (trailerLanding === landingTrailer!.promise) {
            trailerLanding = undefined;
          }
          landingTrailer!.resolve();
        }
      };
      await Promise.all([
        ...(landingTrailer === undefined ? [] : [fetchTrailer()]),
        ...pieces.toSorted((left, right) => left.rank - right.rank).map(async (piece) => fetchPiece(piece)),
      ]);
      return whole;
    };

    /* The base `offset`'s held header names, or `undefined`: a header that does not parse is the reading call's to tell. */
    const heldBaseOf = (offset: number, entry: AheadEntry | undefined): number | undefined => {
      if (entry?.bytes === undefined) {
        return undefined;
      }
      try {
        return baseOffsetOf(offset, entry.bytes.subarray(0, Math.min(32, entry.bytes.byteLength)));
      } catch {
        return undefined;
      }
    };

    /*
     * The bases of `wave` not asked for yet, while the budget lasts; a held base counts what names it. Every header is
     * parsed before any base is registered, and none throws, so no base is registered that its wave never asks for.
     */
    const basesOf = (wave: readonly number[]): number[] => {
      const named = wave.map((offset) => [offset, heldBaseOf(offset, ahead.get(offset))] as const);
      const next: number[] = [];
      for (const [offset, baseOffset] of named) {
        const entry = ahead.get(offset);
        if (baseOffset === undefined || entry === undefined) {
          continue;
        }
        if (!ahead.has(baseOffset) && unasked(baseOffset) && affordable(baseOffset)) {
          register([baseOffset], false);
          next.push(baseOffset);
        }
        const base = ahead.get(baseOffset);
        if (base !== undefined) {
          base.refs += 1;
          entry.base = baseOffset;
        }
      }
      return next;
    };

    const first: number[] = [];
    for (const oid of oids) {
      const offset = index.offsetOf(oid);
      /* Registered as it is taken, so a repeated id is not unasked any more. */
      if (offset !== undefined && unasked(offset)) {
        if (!affordable(offset)) {
          break;
        }
        first.push(offset);
        register([offset], true);
      }
    }
    const run = async (): Promise<void> => {
      let wave = first;
      for (let depth = 0; wave.length > 0 && depth <= maximumDeltaDepth; depth += 1) {
        counters.waves += 1;
        // oxlint-disable-next-line no-await-in-loop -- a wave's bases are known only once the wave has landed.
        if (!(await aheadWave(wave))) {
          return;
        }
        wave = basesOf(wave);
      }
    };
    /*
     * However the read-ahead ends — every wave landed, a read failed, the chain ran past its depth, or something threw —
     * every entry it registered and did not land is dropped and its waiters told, so they ask for it themselves and no
     * call waits on an entry nothing will fetch.
     */
    const done = (async (): Promise<void> => {
      try {
        await run();
      } catch {
        stop();
      } finally {
        for (const [offset, entry] of ahead) {
          if (entry.owner === owner && entry.bytes === undefined) {
            ahead.delete(offset);
            entry.settle('dropped');
          }
        }
      }
    })();
    return Object.freeze({
      release: async () => {
        stop();
        await done;
        for (const [offset, entry] of ahead) {
          if (entry.owner === owner) {
            dropAhead(offset);
            entry.settle('dropped');
          }
        }
      },
    });
  };

  const entryBytes = (oid: string): number | undefined => {
    const offset = index.offsetOf(oid);
    return offset === undefined ? undefined : entryEnd(offset) - offset;
  };

  return Object.freeze({ name, index, counters, entryBytes, readMany, readAhead });
};
