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
 * A read of a pending entry whose object could not be had in time.
 *
 * @public
 */
export class PendingContentError extends Error {
  public readonly path: string;
  public readonly object: PendingObject;

  public constructor(path: string, object: PendingObject, options?: { cause?: unknown }) {
    super(`${path} is still downloading.`, options);
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
 * A read of a path a tree write had yet to land that the write never landed for it (D10, I7): the write failed, so
 * what the path holds is not the tree's, or nothing landed under its root for the stall bound. Never empty or old
 * bytes in its place; a reader may ask again.
 *
 * @public
 */
export class ArrivingContentError extends Error {
  public readonly path: string;
  /** `failed` when the write ended without landing it; `stalled` when it landed nothing for the bound. */
  public readonly reason: 'failed' | 'stalled';

  public constructor(path: string, reason: 'failed' | 'stalled') {
    super(
      reason === 'failed'
        ? `${path} was not written: the download of this project's files stopped before it arrived.`
        : `${path} is still arriving with this project's files.`,
    );
    this.name = 'ArrivingContentError';
    this.path = path;
    this.reason = reason;
  }

  /** The code an error frame carries: the same retryable refusal as a pending large object's. */
  public get code(): 'PENDING' {
    return 'PENDING';
  }
}

/**
 * Whether a file of this size may be a git-lfs pointer: its spec line, its sha256 line and a size line of 1 to 19
 * digits. Only a file this size waits for its root's index and the revision layer's first word (see
 * {@link untilDeclared}); every other file answers at once.
 *
 * @param size - A file's size.
 * @returns Whether a pointer can be that long.
 * @internal
 */
export const mayBePointerSize = (size: number): boolean => size >= 126 && size <= 144;

/**
 * Wait for the revision layer's first word on a held root: what a path that may be a placeholder answers only after
 * (I7). The hold itself is bounded, once per root, so this waits for nothing longer than the caller does.
 *
 * @param declared - The root's first declaration, or the end of its hold.
 * @param signal - The caller's cancellation.
 * @throws The signal's reason when the caller stops waiting.
 * @internal
 */
export const untilDeclared = async (declared: Promise<void>, signal?: AbortSignal): Promise<void> => {
  if (signal === undefined) {
    return declared;
  }
  signal.throwIfAborted();
  let stop: () => void = () => undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    stop = () => {
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- an abort rejects with the caller's own reason.
      reject(signal.reason);
    };
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    await Promise.race([declared, stopped]);
  } finally {
    signal.removeEventListener('abort', stop);
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
 * content facts; a row nothing has answered yet is `pending` at its own size. Any other row is returned as it is.
 *
 * @param row - The provider's row.
 * @param object - The object the path's mark names, if any.
 * @returns The row the path answers.
 * @internal
 */
export const asMarkedRow = <Row extends Readonly<{ type: string; size: number }>>(
  row: Row,
  object: MarkAnswer,
): Row => {
  if (object === undefined || row.type !== 'file') {
    return row;
  }
  /* A row nothing has answered yet may be a placeholder: pending, at the size it holds, and none of its facts (I7). */
  const copy: Record<string, unknown> = { ...row, size: object === 'unknown' ? row.size : object.size, pending: true };
  delete copy['contentKind'];
  delete copy['lineCount'];
  return copy as Row;
};

/**
 * A file whose marks settle before it is answered: its root, its authority path, and its size and mtime on disk (the
 * mtime lets a stored mark answer before the root's index has compared), and a reader of its bytes, asked only when
 * nothing answers a pointer-sized file, so one that is no pointer answers at once. @internal
 */
export type SettledFile = Readonly<{
  root: string;
  authorityPath: string;
  size: number;
  mtimeMs?: number | undefined;
  bytes?: (() => Promise<Uint8Array<ArrayBuffer> | undefined>) | undefined;
}>;

/**
 * What a path's marks say of a file (D9): the object it stands for, `undefined` when it is no placeholder, or
 * `'unknown'` while nothing says yet (its revision root is not declared, and no expected tree or stored mark names it).
 *
 * @internal
 */
export type MarkAnswer = PendingObject | 'unknown' | undefined;

/** The index's marks, as a read answers by them (see {@link readAsMarked}). @internal */
export type PendingMarks = Readonly<{
  pendingAt: (authorityPath: string, size?: number) => PendingObject | undefined;
  endPending: (authorityPath: string) => void;
  /** Whether a path's root is declared with no tree write live over it, so its marks alone are the root's word. */
  declaredAt: (authorityPath: string) => boolean;
  /** What a file answers, waiting only for itself while its root is held (see {@link untilDeclared}). */
  settleMarks: (file: SettledFile, signal?: AbortSignal) => Promise<MarkAnswer>;
}>;

/**
 * What a non-raw view's read of one file answers (D9): the marks are the whole
 * answer. A marked file reads through to its object; anything else is the
 * bytes it holds, an unmarked pointer among them, and no source is asked about
 * it: an outside edit is the revision layer's next capture to declare. A
 * marked file whose bytes are no pointer (rewritten from outside at the
 * pointer's size), or that the source says is no placeholder, loses its mark,
 * so the next stat answers as this read did. One whose bytes are another
 * pointer refuses as pending, and loses its mark only in a declared root with
 * no tree write live over it.
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
    /** The file's mtime on disk, asked only of bytes that are a pointer, so a stored mark can answer. */
    mtimeMs?: (() => Promise<number | undefined>) | undefined;
    signal?: AbortSignal | undefined;
    stallMilliseconds?: number | undefined;
  }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { bytes, mtimeMs, signal, stallMilliseconds, ...at } = read;
  const object = pendingObjectOf(bytes);
  const answer =
    object === undefined
      ? marks.pendingAt(at.authorityPath, bytes.byteLength)
      : await marks.settleMarks(
          { root: at.root, authorityPath: at.authorityPath, size: bytes.byteLength, mtimeMs: await mtimeMs?.() },
          signal,
        );
  if (answer === 'unknown') {
    /* Its root's placeholders are not declared yet: a pointer may be one, so it is never answered as text (I7). */
    throw new PendingContentError(at.path, object!);
  }
  const marked = answer;
  if (marked === undefined) {
    return bytes;
  }
  if (object === undefined) {
    /* Rewritten from outside since it was marked, at the pointer's size: no longer the placeholder it was declared. */
    marks.endPending(at.authorityPath);
    return bytes;
  }
  if (object.oid !== marked.oid || object.size !== marked.size) {
    /*
     * Another pointer than its mark names: the stat before this read said pending, so this read refuses as pending
     * too, never answering pointer text (I7). Only a declared root with no tree write live over it ends the mark,
     * so the next stat and read answer the text alike; otherwise the revision layer is still to say what it is.
     */
    if (marks.declaredAt(at.authorityPath)) {
      marks.endPending(at.authorityPath);
    }
    throw new PendingContentError(at.path, object);
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
