/**
 * The compute worker's contract: the CPU work of the Git object store and of
 * the importer and search, and nothing that touches storage (charter D1, D7).
 *
 * Inflate, deflate, delta resolution, hashing and pack indexing take bytes in
 * and hand bytes back; an import's entry decode reads the `Blob` it is handed
 * and hands the bytes back CRC-checked, and the read-back of what the import
 * wrote is measured here, its one hash (W7; grep joins with W9). The
 * authority does every write. A host gives the store a dedicated worker through
 * {@link createSupervisedComputeWorker} (`supervisor.ts`), which that worker
 * serves with {@link serveComputeWorker}; {@link createInlineCompute} runs the
 * same work in the caller's realm where no worker can be spawned. Each
 * request is structured-cloned to the worker, so the caller's buffers are
 * never detached, and each answer's buffers are transferred back.
 *
 * Failures cross the seam typed: a {@link CorruptBytesError}, marked where the
 * work judged the bytes, arrives as one (a store drops a pack only for this);
 * anything else the work threw — an allocation that failed, a bug — arrives
 * as a plain `Error` that judges nothing, and a worker that died fails every
 * call it held with a {@link ComputeWorkerCrashedError}. No pack is dropped
 * for either.
 *
 * The worker acknowledges each call as it starts it and answers a ping, so the
 * supervisor can tell a worker that is busy from one that is gone.
 *
 * @module
 */

import { indexPack } from 'isomorphic-git';
import { installBufferGlobal } from '#buffer-global.js';
import { decodeImportEntry, measureImportBytes } from '@taucad/filesystem/importer';
import type { ImportDecodeRequest, ImportDecodedEntry, ImportMeasuredFacts } from '@taucad/filesystem/importer';
import { bytesToHex, digest } from '#object-hash.js';
import { CorruptBytesError } from '#compute-worker/errors.js';
import type { ComputeMethod } from '#compute-worker/errors.js';
import { applyDelta } from '#pack-reader/delta.js';

/**
 * The CPU work the object store, the importer and search hand off. Every call is pure: bytes in, bytes out.
 *
 * @public
 */
export type ComputeWorker = Readonly<{
  /** Inflate one object's zlib stream. */
  inflate: (compressed: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * One whole pack entry's zlib body inflated to exactly the size it declares
   * and hashed as the object it frames (`<type> <size>\0<body>`): the object
   * crosses back once, with the id its bytes hash to, for the caller to
   * compare with the id it asked for. Inflating stops at the declared size.
   *
   * Optional: a compute without it is asked to `inflate` and then `sha1`.
   *
   * @throws CorruptBytesError when the body is not zlib or inflates to another size.
   */
  inflateObject?: (
    type: 'commit' | 'tree' | 'blob' | 'tag',
    compressed: Uint8Array<ArrayBuffer>,
    declared: number,
  ) => Promise<Readonly<{ data: Uint8Array<ArrayBuffer>; oid: string }>>;
  /** Deflate one object's framed or entry bytes into a zlib stream. */
  deflate: (raw: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
  /** SHA-1 of the bytes, lowercase hex: WebCrypto where the origin has it. */
  sha1: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
  /**
   * SHA-256 of the bytes, lowercase hex: WebCrypto where the origin has it (an LFS object's id).
   * `consumed`, the bytes are transferred to the worker rather than cloned, and are unusable after.
   */
  sha256: (bytes: Uint8Array<ArrayBuffer>, consumed?: boolean) => Promise<string>;
  /**
   * SHA-256 of the bytes, and the bytes themselves: transferred to the worker
   * and back rather than cloned, so a caller that delivers what it hashed holds
   * one copy (I2). The bytes passed in are unusable after; use the ones returned.
   */
  sha256Kept: (bytes: Uint8Array<ArrayBuffer>) => Promise<Readonly<{ sha256: string; data: Uint8Array<ArrayBuffer> }>>;
  /**
   * The version-2 `.idx` of one whole pack (≤ the store's 64 MiB ceiling).
   * `isomorphic-git`'s indexer over an in-memory file: no store is read.
   */
  indexPack: (pack: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * One delta entry resolved: its zlib body inflated, checked against the size
   * the entry declares, and applied to its base's body.
   *
   * @throws TypeError when the body does not inflate, has another size, or does not apply.
   */
  resolveDelta: (
    compressed: Uint8Array<ArrayBuffer>,
    declared: number,
    base: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  /**
   * One import entry read from the `Blob` it was handed (by reference, never
   * copied), inflated and CRC-checked against its zip entry (charter D12).
   * Nothing is hashed: the bytes come back transferred.
   *
   * @throws ImportRefusedError (revived by name) when the bytes do not decode to the declared size and CRC.
   */
  decodeImportEntry: (request: ImportDecodeRequest) => Promise<ImportDecodedEntry>;
  /**
   * The facts of one file an import wrote, from its read-back: blob id and
   * SHA-256 by one-shot WebCrypto digests, and its content kind (EQ6, I2).
   * The bytes are transferred to the worker, not cloned, and are unusable
   * after; bytes of another length than `expectedSize` are refused, never measured.
   */
  measureImportBytes: (bytes: Uint8Array<ArrayBuffer>, expectedSize: number) => Promise<ImportMeasuredFacts>;
}>;

const drain = async (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let size = 0;
  const reader = stream.getReader();
  // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value);
    size += read.value.byteLength;
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return joined;
};

/*
 * The bytes written to the transform's own writer and its output drained:
 * no `Blob.stream()` or `Response`, which not every host the store runs in
 * has (jsdom has neither a `Blob.stream` nor streams on a `Response`).
 */
const through = async (
  transform: CompressionStream | DecompressionStream,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const writer = transform.writable.getWriter();
  const written = (async (): Promise<void> => {
    await writer.write(bytes);
    await writer.close();
  })();
  const [output] = await Promise.all([drain(transform.readable), written]);
  return output;
};

const subtle = (): SubtleCrypto | undefined => (globalThis as { crypto?: Crypto }).crypto?.subtle;

const hashHex = async (algorithm: 'sha1' | 'sha256', bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const crypto = subtle();
  /* An insecure origin has no `crypto.subtle`; the JS hasher answers there. */
  return crypto === undefined
    ? bytesToHex(digest(algorithm, bytes))
    : bytesToHex(new Uint8Array(await crypto.digest(algorithm === 'sha1' ? 'SHA-1' : 'SHA-256', bytes)));
};

/* One pack, one index: the only two files `indexPack` reads or writes. */
const memoryFiles = (pack: Uint8Array<ArrayBuffer>) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([['pack.pack', pack]]);
  const missing = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const at = (path: string): string =>
    path
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
      .join('/');
  const held = (path: string): Uint8Array<ArrayBuffer> => {
    const content = files.get(at(path));
    if (content === undefined) {
      throw missing(path);
    }
    return content;
  };
  return {
    files,
    fs: {
      promises: {
        readFile: async (path: string) => held(path),
        writeFile: async (path: string, data: Uint8Array<ArrayBuffer>) => {
          files.set(at(path), data);
        },
        unlink: async (path: string) => {
          files.delete(at(path));
        },
        readdir: async () => [...files.keys()],
        mkdir: async () => undefined,
        rmdir: async () => undefined,
        stat: async (path: string) => ({
          type: 'file',
          size: held(path).byteLength,
          mtimeMs: 0,
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
        }),
        lstat: async (path: string) => {
          throw missing(path);
        },
        readlink: async (path: string) => {
          throw missing(path);
        },
        symlink: async (_target: string, path: string) => {
          throw missing(path);
        },
      },
    },
  };
};

const frameEncoder = new TextEncoder();

/** The most a deflate stream inflates to per byte: a 258-byte match in as little as two bits. */
const deflateMaximumRatio = 1032;

/*
 * One zlib stream inflated behind `head`, to exactly `declared` bytes. Nothing
 * is allocated on the declared size alone: the chunks the stream produces are
 * held until it ends, a stream that runs past `declared` is stopped there, and
 * the frame is allocated only once the stream has produced exactly that much,
 * so a size the body never reaches costs no more than the body. Every refusal
 * is a CorruptBytesError, and the stream's write side is settled before it is
 * thrown, so nothing rejects unobserved.
 */
const inflateFramed = async (
  compressed: Uint8Array<ArrayBuffer>,
  head: Uint8Array<ArrayBuffer>,
  declared: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const transform = new DecompressionStream('deflate');
  const writer = transform.writable.getWriter();
  /* Settles with the write side's failure, never rejects: it is awaited on every path below. */
  const writing = (async (): Promise<Error | undefined> => {
    try {
      await writer.write(compressed);
      await writer.close();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error : new TypeError(String(error));
    }
  })();
  const reader = transform.readable.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let inflated = 0;
  try {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      if (read.value.byteLength > declared - inflated) {
        throw new CorruptBytesError('The entry inflates past the size it declares.');
      }
      chunks.push(read.value);
      inflated += read.value.byteLength;
    }
    const failed = await writing;
    if (failed !== undefined) {
      throw failed;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await writing;
    /* A decompression stream fails a stream that is not zlib with a TypeError; anything else is not about the bytes. */
    throw error instanceof TypeError
      ? new CorruptBytesError('The bytes are not a zlib stream.', { cause: error })
      : error;
  }
  if (inflated !== declared) {
    throw new CorruptBytesError('The entry inflates to a size other than the one it declares.');
  }
  const framed = new Uint8Array(head.byteLength + declared);
  framed.set(head);
  let at = head.byteLength;
  for (const chunk of chunks) {
    framed.set(chunk, at);
    at += chunk.byteLength;
  }
  return framed;
};

/* A size no body this long can inflate to is refused before the body is inflated at all. */
const refuseImpossibleSize = (compressed: Uint8Array<ArrayBuffer>, declared: number): void => {
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > compressed.byteLength * deflateMaximumRatio) {
    throw new CorruptBytesError('The entry declares a size its body cannot inflate to.');
  }
};

/**
 * A compute with `inflateObject`, each of its methods bound to it: its own
 * when it has one, else the same work from its own `inflate` and `sha1`, with the same refusals (an
 * impossible declared size, a body that is not zlib, one that inflates to
 * another size). For a supervisor's fallback built before the method was.
 *
 * @param compute - Any compute.
 * @returns A compute whose `inflateObject` is there.
 */
export const withInflateObject = (
  compute: ComputeWorker,
): ComputeWorker & Required<Pick<ComputeWorker, 'inflateObject'>> => {
  /* Each method bound to the compute it came from: a class instance keeps its prototype's methods and its `this`. */
  const bound = Object.fromEntries(
    computeMethods.flatMap((method) => {
      const work = compute[method] as ((...input: readonly unknown[]) => Promise<unknown>) | undefined;
      return typeof work === 'function' ? [[method, work.bind(compute)]] : [];
    }),
  ) as unknown as ComputeWorker;
  return Object.freeze({
    ...bound,
    inflateObject:
      bound.inflateObject ??
      (async (type, compressed, declared) => {
        refuseImpossibleSize(compressed, declared);
        const data = await bound.inflate(compressed);
        if (data.byteLength !== declared) {
          throw new CorruptBytesError('The entry inflates to a size other than the one it declares.');
        }
        const head = frameEncoder.encode(`${type} ${String(declared)}\0`);
        const framed = new Uint8Array(head.byteLength + declared);
        framed.set(head);
        framed.set(data, head.byteLength);
        return { data, oid: await bound.sha1(framed) };
      }),
  });
};

/**
 * The compute contract run in the caller's own realm.
 *
 * @returns A compute worker that needs no worker.
 * @public
 */
export const createInlineCompute = (): ComputeWorker => {
  const inflate = async (compressed: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
    try {
      return await through(new DecompressionStream('deflate'), compressed);
    } catch (error) {
      /* A decompression stream fails a stream that is not zlib with a TypeError; anything else is not about the bytes. */
      throw error instanceof TypeError
        ? new CorruptBytesError('The bytes are not a zlib stream.', { cause: error })
        : error;
    }
  };
  return Object.freeze({
    inflate,
    inflateObject: async (type, compressed, declared) => {
      refuseImpossibleSize(compressed, declared);
      /* Inflated behind its frame: hashed without a further copy, and handed back as a view past the frame. */
      const head = frameEncoder.encode(`${type} ${String(declared)}\0`);
      const framed = await inflateFramed(compressed, head, declared);
      return { data: framed.subarray(head.byteLength), oid: await hashHex('sha1', framed) };
    },
    deflate: async (raw) => through(new CompressionStream('deflate'), raw),
    sha1: async (bytes) => hashHex('sha1', bytes),
    sha256: async (bytes) => hashHex('sha256', bytes),
    sha256Kept: async (bytes) => ({ sha256: await hashHex('sha256', bytes), data: bytes }),
    indexPack: async (pack) => {
      /* This realm may be a fresh worker with no `Buffer`; without one the indexer reads a `null` pack. */
      installBufferGlobal();
      const { fs, files } = memoryFiles(pack);
      try {
        await indexPack({ fs, dir: '', gitdir: '', filepath: 'pack.pack' });
      } catch (error) {
        /* The indexer refuses a pack it cannot read; running out of room is not a verdict on the pack. */
        if (error instanceof RangeError) {
          throw error;
        }
        /* The indexer's own reason goes in the sentence: a refusal seen only on one device is read off its toast. */
        /* The library's internal errors wrap the reason in a bug-report sentence; `data.message` is the reason itself. */
        const own = (error as { data?: { message?: unknown } } | undefined)?.data?.message;
        const reason = typeof own === 'string' ? own : error instanceof Error ? error.message : String(error);
        throw new CorruptBytesError(`The pack does not index: ${reason}`, { cause: error });
      }
      const written = files.get('pack.idx');
      if (written === undefined) {
        throw new Error('The pack indexer wrote no index.');
      }
      return new Uint8Array(written);
    },
    decodeImportEntry: async (request) => decodeImportEntry(request),
    measureImportBytes: async (bytes, expectedSize) => measureImportBytes(bytes, expectedSize, hashHex),
    resolveDelta: async (compressed, declared, base) => {
      const delta = await inflate(compressed);
      if (delta.byteLength !== declared) {
        throw new CorruptBytesError('A delta entry inflates to a size other than the one it declares.');
      }
      try {
        return applyDelta(delta, base);
      } catch (error) {
        throw error instanceof TypeError ? new CorruptBytesError(error.message, { cause: error }) : error;
      }
    },
  });
};

/** The names of the contract, in one place for both halves of the seam. */
export const computeMethods: ReadonlyArray<keyof ComputeWorker & ComputeMethod> = [
  'inflate',
  'inflateObject',
  'deflate',
  'sha1',
  'sha256',
  'sha256Kept',
  'indexPack',
  'resolveDelta',
  'decodeImportEntry',
  'measureImportBytes',
];

/**
 * Whether a call hands its first argument's buffer over to the worker
 * (transferred, so the caller's copy is detached once it is sent), not a clone.
 *
 * @param method - The call.
 * @param args - Its arguments.
 * @returns Whether the bytes are transferred.
 * @public
 */
export const transfersArguments = (method: ComputeMethod, args: readonly unknown[]): boolean =>
  (method === 'sha256' && args[1] === true) || method === 'sha256Kept' || method === 'measureImportBytes';

/** What an error was caused by, as far as it survives a structured clone: its class name and sentence. */
type SeamCause = Readonly<{ name: string; message: string }>;

const seamCauseOf = (error: unknown): SeamCause | undefined => {
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof Error ? { name: cause.name, message: cause.message } : undefined;
};

/** One request over the seam. */
export type ComputeRequest = Readonly<{ id: number; method: ComputeMethod; args: readonly unknown[] }>;

/** One answer: a result, or the error the work threw, by class name; or the call's start; or a ping's answer. */
export type ComputeAnswer = Readonly<{
  id: number;
  result?: unknown;
  /** A refusal's `reason` travels with it, so the import's limits verdict survives the boundary. */
  error?: Readonly<{ name: string; message: string; reason?: string; cause?: SeamCause }>;
  started?: true;
  pong?: true;
}>;

/**
 * The one side of a message channel the compute seam needs.
 *
 * @public
 */
export type ComputePort = Readonly<{
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  start?: () => void;
}>;

/* Every buffer an answer holds, to transfer rather than copy: the result, or the `data` of each entry of a list. */
const transferablesOf = (value: unknown): Transferable[] => {
  if (value instanceof Uint8Array) {
    return [value.buffer];
  }
  if ((value as { data?: unknown } | undefined)?.data instanceof Uint8Array) {
    return [(value as { data: Uint8Array<ArrayBuffer> }).data.buffer];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry: unknown) =>
      entry !== null && typeof entry === 'object' && (entry as { data?: unknown }).data instanceof Uint8Array
        ? [(entry as { data: Uint8Array<ArrayBuffer> }).data.buffer]
        : [],
    );
  }
  return [];
};

/**
 * Serve the compute contract on one port: the worker's half of the seam.
 *
 * @param port - The port the store's authority holds the other end of (a worker's own global scope).
 * @param compute - The work itself; inline by default.
 * @public
 */
export const serveComputeWorker = (port: ComputePort, compute: ComputeWorker = createInlineCompute()): void => {
  port.addEventListener('message', (event) => {
    const { id, method, args, ping } = event.data as ComputeRequest & { ping?: true };
    if (ping === true) {
      port.postMessage({ id, pong: true } satisfies ComputeAnswer, []);
      return;
    }
    // async-iife: bootstrap -- every outcome is posted back, so nothing rejects unobserved.
    void (async (): Promise<void> => {
      port.postMessage({ id, started: true } satisfies ComputeAnswer, []);
      try {
        const work = compute[method] as (...input: readonly unknown[]) => Promise<unknown>;
        const result = await work(...args);
        port.postMessage({ id, result } satisfies ComputeAnswer, [...new Set(transferablesOf(result))]);
      } catch (error) {
        const { name, message } = error instanceof Error ? error : new Error(String(error));
        const reason = (error as { reason?: unknown } | undefined)?.reason;
        const cause = seamCauseOf(error);
        port.postMessage(
          {
            id,
            error: {
              name,
              message,
              ...(typeof reason === 'string' ? { reason } : {}),
              ...(cause === undefined ? {} : { cause }),
            },
          } satisfies ComputeAnswer,
          [],
        );
      }
    })();
  });
  port.start?.();
};

/* The error a worker threw: a verdict on the bytes as one, anything else as an error that judges nothing. */
const reviveError = (error: NonNullable<ComputeAnswer['error']>): Error => {
  /* The cause comes back as an error of its own, so a report reads it as it would have read the original. */
  const options =
    error.cause === undefined
      ? undefined
      : { cause: Object.assign(new Error(error.cause.message), { name: error.cause.name }) };
  return error.name === 'CorruptBytesError'
    ? new CorruptBytesError(error.message, options)
    : Object.assign(new Error(error.message, options), {
        workerErrorName: error.name,
        ...(error.reason === undefined ? {} : { reason: error.reason }),
      });
};

/** The caller's half of one connection: the contract, and what fails every call it holds. */
export type ComputeConnection = Readonly<{
  compute: ComputeWorker;
  /** Calls sent and not yet answered. */
  pending: () => number;
  /** When the worker was last heard from (a start, an answer, a pong), or a call was sent to an idle one. */
  heard: () => number;
  /** Whether the worker has sent anything at all: one that has not may never have loaded. */
  spoke: () => boolean;
  /** Ask the worker to answer, so a silent one can be told from a busy one. */
  ping: () => void;
  /** Fail every call this connection holds, and every call it is given afterwards. */
  close: (failure: (method: ComputeMethod) => Error) => void;
}>;

/* A byte view that does not cover the whole buffer behind it. */
const isPartialView = (value: unknown): value is Uint8Array<ArrayBuffer> =>
  value instanceof Uint8Array && value.byteLength !== value.buffer.byteLength;

/**
 * The store's half of the seam over one port.
 *
 * @param port - A port a {@link serveComputeWorker} serves.
 * @param now - The clock silence is measured on.
 * @returns The contract over that port, and the means to fail what it holds.
 */
export const openComputeConnection = (port: ComputePort, now: () => number = Date.now): ComputeConnection => {
  let next = 0;
  let heard = now();
  let spoke = false;
  let closed: ((method: ComputeMethod) => Error) | undefined;
  const waiting = new Map<number, Readonly<{ method: ComputeMethod; call: PromiseWithResolvers<unknown> }>>();
  port.addEventListener('message', (event) => {
    const { id, result, error, started, pong } = event.data as ComputeAnswer;
    heard = now();
    spoke = true;
    if (started === true || pong === true) {
      return;
    }
    const held = waiting.get(id);
    waiting.delete(id);
    if (error === undefined) {
      held?.call.resolve(result);
    } else {
      held?.call.reject(reviveError(error));
    }
  });
  port.start?.();
  const ask = async (method: ComputeMethod, args: readonly unknown[]): Promise<unknown> => {
    if (closed !== undefined) {
      throw closed(method);
    }
    const id = next;
    next += 1;
    if (waiting.size === 0) {
      /* An idle worker's silence is not a busy worker's. */
      heard = now();
    }
    const call = Promise.withResolvers<unknown>();
    waiting.set(id, { method, call });
    /* Cloned, not transferred: the caller keeps its own bytes, whole and usable (a pack
     * writer reads an object again after deflating it, a loose writer hashes then deflates),
     * unless it hands them over as consumed. */
    const [bytes] = args;
    const transfers = transfersArguments(method, args);
    /* A view over part of a larger buffer is sent as a copy of its own bytes, handed over: a clone
     * carries the whole buffer behind a view, and a pack entry read out of a wide Range read would
     * otherwise send the whole read to the worker once per entry. */
    const sent = transfers
      ? args
      : args.map((argument) => (isPartialView(argument) ? new Uint8Array(argument) : argument));
    const handed = transfers
      ? [(bytes as Uint8Array<ArrayBuffer>).buffer]
      : sent.flatMap((argument, at) => (argument === args[at] ? [] : [(argument as Uint8Array<ArrayBuffer>).buffer]));
    try {
      port.postMessage({ id, method, args: sent } satisfies ComputeRequest, handed);
    } catch (error) {
      /* A call that never left (an uncloneable argument, a detached buffer) waits for nothing. */
      waiting.delete(id);
      throw error;
    }
    return call.promise;
  };
  const compute = Object.fromEntries(
    computeMethods.map((method) => [method, async (...args: readonly unknown[]) => ask(method, args)]),
  ) as unknown as ComputeWorker;
  return Object.freeze({
    compute: Object.freeze(compute),
    pending: () => waiting.size,
    heard: () => heard,
    spoke: () => spoke,
    ping: () => {
      port.postMessage({ id: -1, ping: true }, []);
    },
    close: (failure) => {
      closed = failure;
      for (const [id, held] of waiting) {
        waiting.delete(id);
        held.call.reject(failure(held.method));
      }
    },
  });
};

/**
 * The store's half of the seam: each call's input is cloned to the worker, so
 * the caller's buffer is never detached, and the answer is transferred back.
 *
 * @param port - A port a {@link serveComputeWorker} serves.
 * @returns The compute contract over that port.
 */
export const connectComputeWorker = (port: ComputePort): ComputeWorker => openComputeConnection(port).compute;
