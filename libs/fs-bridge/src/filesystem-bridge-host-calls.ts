/**
 * Calls the bridge answers on the host's side of the wire when the handler set
 * does not bring its own: `hashFiles`, `readMany` and `readRange`.
 *
 * Each is derived from the connection's own `readFile` (and `readFileStream`
 * for ranges), so the view's mask applies, and each answers where the bytes
 * live: one round trip, bodies only where the caller asked for bodies.
 */
import type { BridgeServerLongCall, StringKeyedObject } from '@taucad/rpc/bridge';
import { sha256Bytes } from '@taucad/utils/hash';
import type { LongCall, ReadManyWireRows } from '#filesystem-bridge-protocol.js';
import { ownedForTransfer } from '#filesystem-bridge-crossings.js';

/** Reads one `readMany` keeps in flight: enough to overlap I/O, few enough to bound open handles. */
const readManyConcurrency = 8;

/** Milliseconds between progress reports, so a call over thousands of small files sends tens of frames, not thousands. */
const progressInterval = 100;

type ReadBytes = (path: string) => Promise<Uint8Array<ArrayBuffer>>;
type ReadStream = (
  path: string,
  options: { readonly position: number; readonly length: number },
) => ReadableStream<Uint8Array<ArrayBuffer>>;

const isAbsence = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

/**
 * Run `work` once per item with bounded concurrency, stopping at the caller's
 * abort and reporting progress at most every {@link progressInterval}.
 */
const forEachReported = async <Item>(
  items: readonly Item[],
  options: LongCall | undefined,
  work: (item: Item, index: number) => Promise<number>,
): Promise<void> => {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  let next = 0;
  let done = 0;
  let bytes = 0;
  let reportedAt = Number.NEGATIVE_INFINITY;
  const report = (final: boolean): void => {
    const now = performance.now();
    if (onProgress === undefined || (!final && now - reportedAt < progressInterval)) {
      return;
    }
    reportedAt = now;
    onProgress({ done, total: items.length, bytes });
  };
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      if (signal?.aborted) {
        throw abortError();
      }
      const index = next++;
      /* Await first, then add: `bytes += await …` reads `bytes` before the
       * await, so lanes finishing side by side would overwrite each other. */
      // oxlint-disable-next-line no-await-in-loop -- one lane reads one file after another; lanes run side by side.
      const read = await work(items[index]!, index);
      bytes += read;
      done += 1;
      report(false);
    }
  };
  await Promise.all(Array.from({ length: Math.min(readManyConcurrency, items.length) }, lane));
  report(true);
};

const concatenate = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>, size: number): Uint8Array<ArrayBuffer> => {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return joined;
};

const hostHashFiles =
  (read: ReadBytes) =>
  async (paths: readonly string[], options?: LongCall): Promise<Record<string, string>> => {
    const digests: Array<[string, string]> = Array.from({ length: paths.length });
    await forEachReported(paths, options, async (path, index) => {
      try {
        const data = await read(path);
        digests[index] = [path, await sha256Bytes(data)];
        return data.byteLength;
      } catch (error) {
        if (isAbsence(error)) {
          digests[index] = [path, 'missing'];
          return 0;
        }
        throw error;
      }
    });
    return Object.fromEntries(digests);
  };

const hostReadMany =
  (read: ReadBytes) =>
  async (paths: readonly string[], options?: LongCall): Promise<ReadManyWireRows> => {
    const unique = [...new Set(paths)];
    const rows: ReadManyWireRows = Array.from({ length: unique.length });
    await forEachReported(unique, options, async (path, index) => {
      try {
        const data = ownedForTransfer(path, await read(path));
        rows[index] = [path, data];
        return data.byteLength;
      } catch (error) {
        if (isAbsence(error)) {
          rows[index] = [path, 'missing'];
          return 0;
        }
        throw error;
      }
    });
    return rows;
  };

const hostReadRange =
  (read: ReadBytes, stream: ReadStream | undefined) =>
  async (path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> => {
    let data: Uint8Array<ArrayBuffer>;
    if (length === 0) {
      data = new Uint8Array(0);
    } else if (stream === undefined) {
      /* No seekable stream: read whole and keep only the range, in a buffer of its own. */
      const whole = await read(path);
      data = whole.slice(Math.min(offset, whole.byteLength), Math.min(offset + length, whole.byteLength));
    } else {
      const reader = stream(path, { position: offset, length }).getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      let size = 0;
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        chunks.push(chunk.value);
        size += chunk.value.byteLength;
      }
      data = concatenate(chunks, size);
    }
    return ownedForTransfer(path, data);
  };

/**
 * Serve `hashFiles`, `readMany` and `readRange` beside a handler set that reads
 * files, each only where the handlers do not bring their own. A set without
 * `readFile` is returned unchanged. Members stay bound to the original handler
 * set, so a class's private state survives.
 *
 * @param handlers - The handlers one connection is served.
 * @returns The same handlers, answering the derived calls.
 */
export const withHostContentCalls = <Handlers extends StringKeyedObject>(handlers: Handlers): Handlers => {
  const own = handlers as Partial<Record<string, unknown>>;
  if (typeof own['readFile'] !== 'function') {
    return handlers;
  }
  const read = (own['readFile'] as (path: string) => Promise<Uint8Array<ArrayBuffer>>).bind(handlers);
  const stream =
    typeof own['readFileStream'] === 'function' ? (own['readFileStream'] as ReadStream).bind(handlers) : undefined;
  const derived: Record<string, unknown> = {
    ...(typeof own['hashFiles'] === 'function' ? {} : { hashFiles: hostHashFiles(read) }),
    ...(typeof own['readMany'] === 'function' ? {} : { readMany: hostReadMany(read) }),
    ...(typeof own['readRange'] === 'function' ? {} : { readRange: hostReadRange(read, stream) }),
  };
  if (Object.keys(derived).length === 0) {
    return handlers;
  }
  return new Proxy(handlers, {
    get(target, property) {
      if (typeof property === 'string' && Object.hasOwn(derived, property)) {
        return derived[property];
      }
      const value: unknown = Reflect.get(target, property, target);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      /* A frozen member must be returned as itself (proxy invariant). */
      return typeof value === 'function' && !(descriptor?.configurable === false && descriptor.writable === false)
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
};

/**
 * The bridge methods whose handler takes the long-call controls, and where.
 * Only calls the bridge itself derives (or whose contract names them) take
 * them: a domain handler's trailing slot may already mean something else, such
 * as the mutation context a port binds.
 */
const longCallHandlerSlot: Readonly<Record<string, number>> = { hashFiles: 1, readMany: 1 };

/**
 * Hand a long call's abort signal and progress sink to the handlers that take
 * them, as their options argument.
 *
 * @param method - The bridge method being served.
 * @param args - Its validated wire arguments.
 * @param longCall - The call's server-side controls.
 * @returns The arguments the handler is called with.
 */
export const bindFileSystemLongCall = (method: string, args: unknown[], longCall: BridgeServerLongCall): unknown[] => {
  const slot = longCallHandlerSlot[method];
  if (slot === undefined) {
    return args;
  }
  const bound = args.slice(0, slot);
  while (bound.length < slot) {
    bound.push(undefined);
  }
  bound.push(longCall);
  return bound;
};
