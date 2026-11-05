/**
 * The compute worker's contract: the CPU work of the Git object store, and
 * nothing that touches storage (charter D1, D7).
 *
 * Inflate, deflate, hashing and pack indexing take bytes in and hand bytes
 * back; the authority does every read and write. Today the authority runs the
 * work in its own realm ({@link createInlineCompute}); a host that gives the
 * store a dedicated worker passes {@link connectComputeWorker} over a port that
 * worker serves with {@link serveComputeWorker} — one seam, with the buffers
 * transferred, never copied.
 *
 * @module
 */

import { indexPack } from 'isomorphic-git';
import { bytesToHex, digest } from '#object-hash.js';

/** The CPU work the object store hands off. Every call is pure: bytes in, bytes out. */
export type ComputeWorker = Readonly<{
  /** Inflate one object's zlib stream. */
  inflate: (compressed: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
  /** Deflate one object's framed or entry bytes into a zlib stream. */
  deflate: (raw: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
  /** SHA-1 of the bytes, lowercase hex: WebCrypto where the origin has it. */
  sha1: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
  /**
   * The version-2 `.idx` of one whole pack (≤ 64 MiB, the store's ceiling).
   * `isomorphic-git`'s indexer over an in-memory file: no store is read.
   */
  indexPack: (pack: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>;
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

/* One pack, one index: the only two files `indexPack` reads or writes. */
const memoryFiles = (pack: Uint8Array<ArrayBuffer>) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([['pack.pack', pack]]);
  const missing = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
  const at = (path: string): string =>
    path
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
      .join('/');
  return {
    files,
    fs: {
      promises: {
        readFile: async (path: string) => {
          const content = files.get(at(path));
          if (content === undefined) {
            throw missing(path);
          }
          return content;
        },
        writeFile: async (path: string, data: Uint8Array<ArrayBuffer>) => {
          files.set(at(path), data);
        },
        unlink: async (path: string) => {
          files.delete(at(path));
        },
        readdir: async () => [...files.keys()],
        mkdir: async () => undefined,
        rmdir: async () => undefined,
        stat: async (path: string) => {
          const content = files.get(at(path));
          if (content === undefined) {
            throw missing(path);
          }
          return {
            type: 'file',
            size: content.byteLength,
            mtimeMs: 0,
            isFile: () => true,
            isDirectory: () => false,
            isSymbolicLink: () => false,
          };
        },
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

/**
 * The compute contract run in the caller's own realm.
 *
 * @returns A compute worker that needs no worker.
 */
export const createInlineCompute = (): ComputeWorker =>
  Object.freeze({
    inflate: async (compressed) => through(new DecompressionStream('deflate'), compressed),
    deflate: async (raw) => through(new CompressionStream('deflate'), raw),
    sha1: async (bytes) => {
      const crypto = subtle();
      /* An insecure origin has no `crypto.subtle`; the JS hasher answers there. */
      return crypto === undefined
        ? bytesToHex(digest('sha1', bytes))
        : bytesToHex(new Uint8Array(await crypto.digest('SHA-1', bytes)));
    },
    indexPack: async (pack) => {
      const { fs, files } = memoryFiles(pack);
      await indexPack({ fs, dir: '', gitdir: '', filepath: 'pack.pack' });
      const written = files.get('pack.idx');
      if (written === undefined) {
        throw new Error('The pack indexer wrote no index.');
      }
      return new Uint8Array(written);
    },
  });

type ComputeRequest = Readonly<{ id: number; method: keyof ComputeWorker; bytes: Uint8Array<ArrayBuffer> }>;
type ComputeAnswer = Readonly<{ id: number; result?: Uint8Array<ArrayBuffer> | string; error?: string }>;

/** The one side of a message channel the compute seam needs. */
export type ComputePort = Readonly<{
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  start?: () => void;
}>;

/**
 * Serve the compute contract on one port: the worker's half of the seam.
 *
 * @param port - The port the store's authority holds the other end of.
 * @param compute - The work itself; inline by default.
 */
export const serveComputeWorker = (port: ComputePort, compute: ComputeWorker = createInlineCompute()): void => {
  port.addEventListener('message', (event) => {
    const { id, method, bytes } = event.data as ComputeRequest;
    // async-iife: bootstrap -- every outcome is posted back, so nothing rejects unobserved.
    void (async (): Promise<void> => {
      try {
        const result = await compute[method](bytes);
        port.postMessage({ id, result } satisfies ComputeAnswer, typeof result === 'string' ? [] : [result.buffer]);
      } catch (error) {
        port.postMessage(
          { id, error: error instanceof Error ? error.message : String(error) } satisfies ComputeAnswer,
          [],
        );
      }
    })();
  });
  port.start?.();
};

/**
 * The store's half of the seam: each call's input buffer is transferred to
 * the worker and its answer transferred back.
 *
 * @param port - A port a {@link serveComputeWorker} serves.
 * @returns The compute contract over that port.
 */
export const connectComputeWorker = (port: ComputePort): ComputeWorker => {
  let next = 0;
  const waiting = new Map<number, PromiseWithResolvers<Uint8Array<ArrayBuffer> | string>>();
  port.addEventListener('message', (event) => {
    const { id, result, error } = event.data as ComputeAnswer;
    const call = waiting.get(id);
    waiting.delete(id);
    if (error === undefined) {
      call?.resolve(result!);
    } else {
      call?.reject(new Error(error));
    }
  });
  port.start?.();
  const ask = async <Result extends Uint8Array<ArrayBuffer> | string>(
    method: keyof ComputeWorker,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<Result> => {
    const id = next;
    next += 1;
    const call = Promise.withResolvers<Uint8Array<ArrayBuffer> | string>();
    waiting.set(id, call);
    /* The caller hands its buffer over: a view of a larger one is copied out first. */
    const owned =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : new Uint8Array(bytes);
    port.postMessage({ id, method, bytes: owned } satisfies ComputeRequest, [owned.buffer]);
    return (await call.promise) as Result;
  };
  return Object.freeze({
    inflate: async (compressed) => ask('inflate', compressed),
    deflate: async (raw) => ask('deflate', raw),
    sha1: async (bytes) => ask('sha1', bytes),
    indexPack: async (pack) => ask('indexPack', pack),
  });
};
