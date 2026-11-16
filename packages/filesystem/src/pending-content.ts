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
 * the pointers, and it alone says which files are placeholders: it declares
 * them to the index (`declarePending`), which keeps one mark per path. Every
 * other view answers a path by that mark alone: a marked file stats as its
 * object and reads through to it; an unmarked one is the bytes it holds.
 * Nothing below the revision layer guesses from a file's shape.
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

/**
 * A read of a pending entry whose object could not be had in time; or, with no object, a path that may be one, asked
 * about before the revision layer's first word on its root came (see {@link untilDeclared}).
 *
 * @public
 */
export class PendingContentError extends Error {
  public readonly path: string;
  public readonly object: PendingObject | undefined;

  public constructor(path: string, object: PendingObject | undefined, options?: { cause?: unknown }) {
    super(
      object === undefined
        ? `Whether ${path} is a large object still on its way is not known yet.`
        : `The large object of ${path} is not on this device yet.`,
      options,
    );
    this.name = 'PendingContentError';
    this.path = path;
    this.object = object;
  }

  /** The code an error frame carries. */
  public get code(): 'PENDING' {
    return 'PENDING';
  }
}

/**
 * Whether a file of this size may be a git-lfs pointer: its spec line, its sha256 line and a size line of 1 to 19
 * digits. Asked only of a root awaiting the revision layer's first word (see {@link untilDeclared}); after it, the
 * marks alone answer.
 *
 * @param size - A file's size.
 * @returns Whether a pointer can be that long.
 * @internal
 */
export const mayBePointerSize = (size: number): boolean => size >= 126 && size <= 144;

/**
 * Wait for the revision layer's first word on a root it announced, under the read's stall bound: what a path that
 * may be a placeholder answers only after (I7). Refuses with `PENDING` when the word does not come in time.
 *
 * @param declared - The root's first declaration.
 * @param path - The path that waits.
 * @param stallMilliseconds - The bound; {@link pendingStallMilliseconds} when omitted.
 * @throws {PendingContentError} When the word does not come within the bound.
 * @internal
 */
export const untilDeclared = async (
  declared: Promise<void>,
  path: string,
  stallMilliseconds?: number,
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => {
      resolve('late');
    }, stallMilliseconds ?? pendingStallMilliseconds);
  });
  try {
    if ((await Promise.race([declared, late])) === 'late') {
      throw new PendingContentError(path, undefined);
    }
  } finally {
    clearTimeout(timer);
  }
};

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
 * A stat row as its path's mark says (D9): a pending entry is its object's size, `pending`, and none of the pointer's
 * content facts. Any other row is returned as it is.
 *
 * @param row - The provider's row.
 * @param object - The object the path's mark names, if any.
 * @returns The row the path answers.
 * @internal
 */
export const asMarkedRow = <Row extends Readonly<{ type: string; size: number }>>(
  row: Row,
  object: PendingObject | undefined,
): Row => {
  if (object === undefined || row.type !== 'file') {
    return row;
  }
  const copy: Record<string, unknown> = { ...row, size: object.size, pending: true };
  delete copy['contentKind'];
  delete copy['lineCount'];
  return copy as Row;
};

/** The index's marks, as a read answers by them (see {@link readAsMarked}). @internal */
export type PendingMarks = Readonly<{
  pendingAt: (authorityPath: string, size?: number) => PendingObject | undefined;
  endPending: (authorityPath: string) => void;
  /** The first declaration of a root awaiting one that holds this path (see {@link untilDeclared}). */
  declarationAt: (authorityPath: string) => Promise<void> | undefined;
}>;

/**
 * What a non-raw view's read of one file answers (D9): the marks are the whole
 * answer. A marked file reads through to its object; anything else is the
 * bytes it holds, an unmarked pointer among them, and no source is asked about
 * it: an outside edit is the revision layer's next capture to declare. A
 * marked file whose bytes are no pointer, or that the source says is no
 * placeholder, loses its mark, so the next stat answers as this read did.
 *
 * @param marks - The index's marks.
 * @param source - The host's source.
 * @param read - The authority path read, its mount and its path under it, the bytes on disk, the caller's
 *   cancellation and the bound.
 * @returns The bytes the path stands for.
 * @throws {PendingContentError} When a placeholder's object could not be had within the bound.
 * @internal
 */
export const readAsMarked = async (
  marks: PendingMarks,
  source: PendingObjectSource | undefined,
  read: Readonly<{
    authorityPath: string;
    root: string;
    path: string;
    bytes: Uint8Array<ArrayBuffer>;
    signal?: AbortSignal | undefined;
    stallMilliseconds?: number | undefined;
  }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { bytes, signal, stallMilliseconds, ...at } = read;
  const object = pendingObjectOf(bytes);
  const awaiting = object === undefined ? undefined : marks.declarationAt(at.authorityPath);
  if (awaiting !== undefined && marks.pendingAt(at.authorityPath, bytes.byteLength) === undefined) {
    await untilDeclared(awaiting, at.path, stallMilliseconds);
  }
  const marked = marks.pendingAt(at.authorityPath, bytes.byteLength);
  if (marked === undefined) {
    return bytes;
  }
  if (object === undefined) {
    marks.endPending(at.authorityPath);
    return bytes;
  }
  const answered = await readThroughPending(
    source,
    { ...at, object },
    { pointer: bytes, ...(signal === undefined ? {} : { signal }), stallMilliseconds },
  );
  if (answered === bytes) {
    marks.endPending(at.authorityPath);
  }
  return answered;
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
