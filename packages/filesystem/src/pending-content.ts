/**
 * Pending entries: a checkout path whose bytes are a large object that has
 * not reached the device yet (charter D9, D10).
 *
 * On disk such a path holds the object's git-lfs pointer, which is what the
 * revision store records for it. The authority's reads go through to the
 * object instead: a read of a pending entry answers the object's bytes, from
 * the device or fetched on demand by its oid through the host's
 * {@link PendingObjectSource}, under one stall bound (I10). A read that cannot
 * be answered refuses with {@link PendingContentError} (code `PENDING`), so
 * no consumer below the revision layer (search, export, the agent's tools, a
 * duplicate) ever sees pointer text. A copy of a pending entry copies the
 * pointer and stays pending (copy-on-write); a write over one replaces it.
 *
 * The revision layer reads and writes checkouts raw
 * (`createRootedFileSystem(root, context, { placeholders: 'raw' })`): it owns
 * the pointers.
 *
 * @module
 */

/** One large object a pending entry names. @public */
export type PendingObject = Readonly<{ oid: string; size: number }>;

/** What the authority asks the host for when a read meets a pending entry. @public */
export type PendingObjectRequest = Readonly<{
  /** The authority path read. */
  authorityPath: string;
  /** The exact mount it was read under. */
  root: string;
  /** The path relative to that mount. */
  path: string;
  object: PendingObject;
  /** The pointer's bytes, when the path does not hold them yet (a copy's target). */
  pointer?: Uint8Array<ArrayBuffer>;
  /** Answer from the device alone: refuse rather than fetch. */
  localOnly?: boolean;
}>;

/**
 * The host's answer to a pending entry: the object's bytes, fetched on demand
 * when they are not on the device; `undefined` when the path is not a
 * placeholder after all (a pointer the project's attributes do not track is a
 * person's text, read as it is). Rejects when the object cannot be had.
 *
 * `signal` says the read no longer waits; a transfer other readers share
 * must outlive it. `progress` is called whenever bytes of the object arrive,
 * whoever started their transfer: each call restarts the read's stall bound.
 *
 * @public
 */
export type PendingObjectSource = (
  request: PendingObjectRequest,
  signal: AbortSignal,
  progress: () => void,
) => Promise<Uint8Array<ArrayBuffer> | undefined>;

/** How long one read waits on a pending entry with no progress before it refuses (I10). Milliseconds. @public */
export const pendingStallMilliseconds = 60_000;

/** A read of a pending entry whose object could not be had in time. @public */
export class PendingContentError extends Error {
  public readonly path: string;
  public readonly object: PendingObject;

  public constructor(path: string, object: PendingObject, options?: { cause?: unknown }) {
    super(`The large object of ${path} is not on this device yet.`, options);
    this.name = 'PendingContentError';
    this.path = path;
    this.object = object;
  }

  /** The code an error frame carries. */
  public get code(): 'PENDING' {
    return 'PENDING';
  }
}

const pointerPattern =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([\da-f]{64})\nsize (\d{1,19})\n$/u;
const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * The object a git-lfs pointer names, or `undefined` for any other bytes.
 *
 * @param bytes - A file's bytes.
 * @returns The pointer's object.
 * @public
 */
export const pendingObjectOf = (bytes: Uint8Array<ArrayBuffer>): PendingObject | undefined => {
  if (bytes.byteLength > 1024 || bytes[0] !== 0x76) {
    return undefined;
  }
  try {
    const match = pointerPattern.exec(decoder.decode(bytes));
    return match === null ? undefined : { oid: match[1]!, size: Number(match[2]) };
  } catch {
    return undefined;
  }
};

/**
 * Read through one pending entry: its object's bytes from the source, under
 * a no-progress stall bound that every arrival of bytes restarts; the
 * pointer's own bytes when the source says the path is no placeholder.
 *
 * @param source - The host's source; absent, every pending read refuses.
 * @param request - What was read and what it names.
 * @param read - `pointer` is the bytes on disk; `signal` the caller's own cancellation; `stallMilliseconds` the
 *   bound, {@link pendingStallMilliseconds} unless a test shortens it.
 * @returns The bytes the path stands for.
 * @throws {PendingContentError} When the object could not be had within the bound.
 * @internal
 */
export const readThroughPending = async (
  source: PendingObjectSource | undefined,
  request: PendingObjectRequest,
  read: Readonly<{ pointer: Uint8Array<ArrayBuffer>; signal?: AbortSignal; stallMilliseconds?: number | undefined }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { pointer, signal, stallMilliseconds = pendingStallMilliseconds } = read;
  if (source === undefined) {
    throw new PendingContentError(request.path, request.object);
  }
  signal?.throwIfAborted();
  const controller = new AbortController();
  /* The bound holds even over a source that ignores its signal. */
  const ended = Promise.withResolvers<never>();
  // oxlint-disable-next-line promise/prefer-await-to-then -- marks the rejection handled; the race below awaits it.
  ended.promise.catch(() => undefined);
  const stop = (reason: unknown): void => {
    controller.abort(reason);
    ended.reject(reason);
  };
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const progress = (): void => {
    clearTimeout(timer);
    if (!settled) {
      timer = setTimeout(() => {
        stop(new Error(`No bytes of ${request.path}'s large object arrived for ${String(stallMilliseconds)} ms.`));
      }, stallMilliseconds);
    }
  };
  const onAbort = (): void => {
    stop(signal?.reason);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  progress();
  try {
    const bytes = await Promise.race([source(request, controller.signal, progress), ended.promise]);
    return bytes ?? pointer;
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    throw new PendingContentError(request.path, request.object, { cause: error });
  } finally {
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
};
