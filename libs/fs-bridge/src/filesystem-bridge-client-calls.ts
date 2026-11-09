/**
 * Calls the bridge shapes on the caller's side of the wire: `apply`'s
 * changeset staging and receipt, and `readStream` over `readRange`.
 */
import { isLargeObjectSource } from '@taucad/filesystem';
import type { Changeset, ChangesetEntry, ChangesetReceipt } from '@taucad/filesystem';
import type {
  ApplyOptions,
  FileSystemBridgeChangeset,
  FileSystemBridgeChangesetEntry,
  LongCall,
} from '#filesystem-bridge-protocol.js';
import { maxReadRangeBytes } from '#filesystem-bridge-protocol.js';
import { recordFileSystemBridgeCrossing } from '#filesystem-bridge-crossings.js';

/**
 * Caller-side shape of a `readStream`.
 *
 * @public
 */
export type ReadStreamOptions = {
  /** First byte to read; default 0. */
  readonly offset?: number;
  /** Most bytes to read; to the end of the file when absent. */
  readonly length?: number;
  /** Bytes one pull asks for; default {@link defaultReadStreamChunkBytes}, at most `maxReadRangeBytes`. */
  readonly chunkBytes?: number;
  /** Cancels the stream: the next pull errors with the signal's reason. */
  readonly signal?: AbortSignal;
};

/** Bytes one `readStream` pull asks for when the caller names no size. @public */
export const defaultReadStreamChunkBytes = 1024 * 1024;

/** Whether a view covers its whole buffer, so handing it over sends nothing the caller did not name. */
const fillsBuffer = (data: Uint8Array<ArrayBuffer>): boolean =>
  data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;

/** One write's in-hand bytes, copied or handed over, each counted in the I2 ledger. */
const bytesForWire = (path: string, data: Uint8Array<ArrayBuffer>, owned: boolean): Uint8Array<ArrayBuffer> => {
  const handOver = owned && fillsBuffer(data);
  recordFileSystemBridgeCrossing(path, handOver ? 'transfer' : 'copy', data.byteLength);
  return handOver ? data : new Uint8Array(data);
};

const entryForWire = async (entry: ChangesetEntry, owned: boolean): Promise<FileSystemBridgeChangesetEntry> => {
  if (entry.op === 'append' && entry.data instanceof Uint8Array) {
    return { ...entry, data: bytesForWire(entry.path, entry.data, owned) };
  }
  if (entry.op !== 'write' || typeof entry.data === 'string' || entry.data instanceof Blob) {
    return entry as FileSystemBridgeChangesetEntry;
  }
  if (entry.data instanceof Uint8Array) {
    return { ...entry, data: bytesForWire(entry.path, entry.data, owned) };
  }
  /* A large-object source names a store the far side may not have; the bridge declares no such capability (W11.3). */
  if (isLargeObjectSource(entry.data)) {
    throw Object.assign(new Error(`${entry.path}: a large-object source cannot cross the filesystem bridge.`), {
      code: 'EINVAL',
    });
  }
  /* A stream does not cross every transport the bridge rides. The pipeline
   * stages a stream into a `Blob` before it locks anyway (I11), so staging it
   * here moves that step to the caller's side, not adds one. */
  return { ...entry, data: await new Response(entry.data).blob() };
};

/**
 * One `apply` call's wire arguments and long-call controls. The changeset's
 * own `signal` is the call's abort unless the options name one.
 *
 * @param args - The proxy call's arguments: the changeset and its options.
 * @returns The wire arguments and the controls the bridge carries itself.
 */
export const prepareApplyCall = async (
  args: readonly unknown[],
): Promise<{ args: [FileSystemBridgeChangeset]; longCall?: LongCall }> => {
  const changeset = args[0] as Changeset;
  const options = args[1] as ApplyOptions | undefined;
  const signal = options?.signal ?? changeset.signal;
  signal?.throwIfAborted();
  const owned = options?.transfer === 'owned';
  const entries = await Promise.all(changeset.entries.map(async (entry) => entryForWire(entry, owned)));
  const wire: FileSystemBridgeChangeset = {
    entries,
    ...(changeset.lifecycle === undefined ? {} : { lifecycle: changeset.lifecycle }),
  };
  return { args: [wire], ...(signal === undefined ? {} : { longCall: { signal } }) };
};

/**
 * A receipt off the wire, with each entry's error an `Error` again, carrying
 * the provider's `code`.
 *
 * @param receipt - The validated wire receipt.
 * @returns The receipt the caller holds.
 */
export const receiptFromWire = (receipt: ChangesetReceipt): ChangesetReceipt => ({
  ...receipt,
  entries: receipt.entries.map((entry) => {
    if (entry.error === undefined) {
      return entry;
    }
    const { name, message, code } = entry.error as { name: string; message: string; code?: string };
    return { ...entry, error: Object.assign(new Error(message), { name }, code === undefined ? {} : { code }) };
  }),
});

const chunkSize = (chunkBytes: number | undefined): number => {
  const size = chunkBytes ?? defaultReadStreamChunkBytes;
  if (!Number.isInteger(size) || size <= 0 || size > maxReadRangeBytes) {
    throw new RangeError(`chunkBytes must be an integer in [1, ${String(maxReadRangeBytes)}].`);
  }
  return size;
};

/**
 * A file as a stream of `readRange` pages, pulled one page per read so a slow
 * reader holds one page, not the file. Each page is read when it is pulled:
 * the chunks are not a snapshot, and a file rewritten while it streams yields
 * pages of both versions. The stream ends at the first short page.
 *
 * @param readRange - Reads one page of the file.
 * @param options - Where to start, how much, page size and abort.
 * @returns The file's bytes as a stream.
 */
export const rangeStream = (
  readRange: (offset: number, length: number) => Promise<Uint8Array<ArrayBuffer>>,
  options?: ReadStreamOptions,
): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const size = chunkSize(options?.chunkBytes);
  const signal = options?.signal;
  let position = options?.offset ?? 0;
  const end = options?.length === undefined ? Number.POSITIVE_INFINITY : position + options.length;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        signal?.throwIfAborted();
        const want = Math.min(size, end - position);
        if (want <= 0) {
          controller.close();
          return;
        }
        const page = await readRange(position, want);
        signal?.throwIfAborted();
        position += page.byteLength;
        if (page.byteLength > 0) {
          controller.enqueue(page);
        }
        if (page.byteLength < want || position >= end) {
          controller.close();
        }
      },
    },
    { highWaterMark: 0 },
  );
};
