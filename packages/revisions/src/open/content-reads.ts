/**
 * Reading a checkout's files through its large-object placeholders (D9).
 *
 * In the browser a checkout keeps a placeholder's pointer until the fill writes
 * the object's bytes over it. A read here resolves the pointer to its object
 * whenever the object is already on this device: in the store, or landed and
 * not yet written. A path whose object is not here answers a typed `pending`
 * outcome, never empty bytes and never the pointer's text. `materialize` is
 * the explicit form, for a consumer that needs the physical file.
 */
import { readLfsPointer } from '#lfs.js';
import type { LargeObjectLook } from '#large-object-fill.js';
import type { Checkout } from '#revision-port.js';
import type { RevisionFileSystem } from '#revision-effects.types.js';
import { generatedGitattributesPath, isTrackedLargeObjectPath } from '#workspace-config.js';

/** Why a path's object could not be read as bytes. @public */
export type PendingReason = 'filling' | 'offline' | 'not-fetched';

/**
 * A content read that could not be served as bytes is never silently empty.
 *
 * @public
 */
export type ReadOutcome =
  | Readonly<{ outcome: 'bytes'; data: Uint8Array<ArrayBuffer> }>
  | Readonly<{ outcome: 'pending'; oid: string; size: number; reason: PendingReason }>
  | Readonly<{ outcome: 'missing' }>
  | Readonly<{ outcome: 'directory' }>;

/**
 * A path whose large object is not on this device, from a read or a
 * `materialize` that cannot answer with its bytes.
 *
 * @public
 */
export class PendingError extends Error {
  public readonly path: string;
  public readonly oid: string;
  public readonly size: number;
  public readonly reason: PendingReason;

  public constructor(pending: Readonly<{ path: string; oid: string; size: number; reason: PendingReason }>) {
    super(`The large object of ${pending.path} is not here yet (${pending.reason}).`);
    this.name = 'PendingError';
    this.path = pending.path;
    this.oid = pending.oid;
    this.size = pending.size;
    this.reason = pending.reason;
  }

  /** The code a host's error frame carries. */
  public get code(): 'PENDING' {
    return 'PENDING';
  }
}

/** Options of one read. @public */
export type ContentReadOptions = Readonly<{
  /** Milliseconds to wait for an object a running fill is fetching, at most a minute. Absent or 0, a read never waits. */
  wait?: number;
  signal?: AbortSignal;
}>;

/** What the reads are built over. */
export type ContentReadsDependencies = Readonly<{
  useFileSystem: <Result>(
    place: Checkout,
    operation: (filesystem: RevisionFileSystem) => Promise<Result>,
  ) => Promise<Result>;
  /** An object from this device's store alone; `undefined` when it is not there. */
  readStoredObject: (pointer: Readonly<{ oid: string; size: number }>) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  fill: Readonly<{
    look: (checkoutId: string, oid: string) => LargeObjectLook | undefined;
    arrival: (checkoutId: string, oid: string, signal?: AbortSignal) => Promise<Uint8Array<ArrayBuffer> | undefined>;
    written: (
      checkoutId: string,
      paths: readonly string[],
      signal?: AbortSignal,
      stall?: number,
    ) => Promise<'written' | 'failed' | 'stalled' | 'idle'>;
  }>;
  /** Start a fill on a checkout that has placeholders and none running. */
  startFill: (place: Checkout) => Promise<void>;
  /** Whether this host can reach its remote; absent, it is assumed to. */
  online?: () => boolean;
}>;

const isMissing = (error: unknown): boolean => {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  return code === 'ENOENT' || code === 'ENOTDIR' || name === 'NotFoundError';
};

/* Rounds of one `materialize`; see there. */
const materializeRounds = 3;
/** How long a `materialize` waits on a fill that makes no progress before it answers pending. Milliseconds. */
const defaultStallMilliseconds = 60_000;

const isDirectory = (error: unknown): boolean => (error as { code?: unknown } | undefined)?.code === 'EISDIR';

/** The reads {@link createContentReads} builds. @public */
export type ContentReads = Readonly<{
  readContent: (place: Checkout, path: string, options?: ContentReadOptions) => Promise<ReadOutcome>;
  materialize: (
    place: Checkout,
    paths: readonly string[],
    options?: Readonly<{ signal?: AbortSignal; stallMilliseconds?: number }>,
  ) => Promise<void>;
}>;

/* The reads one root serves; see the module comment. */
export const createContentReads = (dependencies: ContentReadsDependencies): ContentReads => {
  const { useFileSystem, readStoredObject, fill, startFill } = dependencies;

  const readRaw = async (place: Checkout, path: string): Promise<ReadOutcome> => {
    try {
      return { outcome: 'bytes', data: await useFileSystem(place, async (filesystem) => filesystem.readFile(path)) };
    } catch (error) {
      if (isMissing(error)) {
        return { outcome: 'missing' };
      }
      if (isDirectory(error)) {
        return { outcome: 'directory' };
      }
      throw error;
    }
  };

  /* A pointer is a placeholder only where the attributes track large objects, as adoption decides: elsewhere it is a person's text. */
  const pointerAt = async (
    place: Checkout,
    path: string,
    read: ReadOutcome,
  ): Promise<ReturnType<typeof readLfsPointer>> => {
    const pointer = read.outcome === 'bytes' ? readLfsPointer(read.data) : undefined;
    if (pointer === undefined || path === generatedGitattributesPath) {
      return undefined;
    }
    const attributes = await readRaw(place, generatedGitattributesPath);
    const text = attributes.outcome === 'bytes' ? new TextDecoder().decode(attributes.data) : undefined;
    return isTrackedLargeObjectPath(path, text) ? pointer : undefined;
  };

  const reasonOf = (look: LargeObjectLook | undefined): PendingReason => {
    if (dependencies.online?.() === false) {
      return 'offline';
    }
    return look?.state === 'filling' ? 'filling' : 'not-fetched';
  };

  const waitFor = async (
    place: Checkout,
    oid: string,
    options: ContentReadOptions,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    /* Bounded like a stalled `materialize`: no read waits on a transfer longer than that. */
    const wait = Math.min(options.wait ?? 0, defaultStallMilliseconds);
    if (wait <= 0) {
      return undefined;
    }
    const arrivalTimeout = AbortSignal.timeout(wait);
    const signal = options.signal === undefined ? arrivalTimeout : AbortSignal.any([options.signal, arrivalTimeout]);
    try {
      return await fill.arrival(place.id, oid, signal);
    } catch (error) {
      if (arrivalTimeout.aborted && options.signal?.aborted !== true) {
        return undefined;
      }
      throw error;
    }
  };

  /**
   * One path's content, its placeholder resolved to its object when the object is here.
   *
   * @param place - The checkout.
   * @param path - A checkout-relative path.
   * @param options - How long to wait for an object a running fill is fetching.
   * @returns The bytes, or why there are none.
   */
  const readContent = async (place: Checkout, path: string, options: ContentReadOptions = {}): Promise<ReadOutcome> => {
    const raw = await readRaw(place, path);
    const pointer = await pointerAt(place, path, raw);
    if (pointer === undefined) {
      return raw;
    }
    const pending = { outcome: 'pending', oid: pointer.oid, size: pointer.size } as const;
    const look = fill.look(place.id, pointer.oid);
    const data = look?.bytes ?? (await readStoredObject(pointer));
    if (data !== undefined) {
      return { outcome: 'bytes', data };
    }
    if (look?.state === 'filling') {
      const arrived = await waitFor(place, pointer.oid, options);
      if (arrived !== undefined) {
        return { outcome: 'bytes', data: arrived };
      }
    }
    return { ...pending, reason: reasonOf(fill.look(place.id, pointer.oid)) };
  };

  /* The paths among `paths` that still hold a placeholder, with what it names. */
  const placeholders = async (
    place: Checkout,
    paths: readonly string[],
  ): Promise<ReadonlyArray<Readonly<{ path: string; oid: string; size: number }>>> => {
    const reads = await Promise.all(
      paths.map(async (path) => [path, await pointerAt(place, path, await readRaw(place, path))] as const),
    );
    return reads.flatMap(([path, pointer]) =>
      pointer === undefined ? [] : [{ path, oid: pointer.oid, size: pointer.size }],
    );
  };

  /**
   * Make these paths physical files: each placeholder is fetched first and
   * written over its pointer (D9). A path that holds no placeholder is left
   * as it is.
   *
   * @param place - The checkout.
   * @param paths - Checkout-relative paths.
   * @param options - Stops waiting, the call then rejecting with the abort's reason; and how long a fill may make
   *   no progress before the call gives up with {@link PendingError}.
   * @returns Once every path holds its bytes.
   * @throws {PendingError} For the first path whose object could not be fetched.
   */
  const materialize = async (
    place: Checkout,
    paths: readonly string[],
    options: Readonly<{ signal?: AbortSignal; stallMilliseconds?: number }> = {},
  ): Promise<void> => {
    let left = await placeholders(place, paths);
    /* A few rounds, not a loop: an idle checkout is started, and a writer that put a new pointer down meanwhile gets one more. */
    for (let round = 0; round < materializeRounds && left.length > 0; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one wait per round.
      const answer = await fill.written(
        place.id,
        left.map(({ path }) => path),
        options.signal,
        options.stallMilliseconds ?? defaultStallMilliseconds,
      );
      if (answer === 'failed' || answer === 'stalled') {
        break;
      }
      if (answer === 'idle') {
        // oxlint-disable-next-line no-await-in-loop -- the fill must exist before it is waited on.
        await startFill(place);
      }
      // oxlint-disable-next-line no-await-in-loop -- what the fill wrote is checked against the checkout itself.
      left = await placeholders(
        place,
        left.map(({ path }) => path),
      );
    }
    const [first] = left;
    if (first !== undefined) {
      throw new PendingError({ ...first, reason: reasonOf(fill.look(place.id, first.oid)) });
    }
  };

  return { readContent, materialize };
};
