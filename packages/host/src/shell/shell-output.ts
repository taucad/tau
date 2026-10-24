/**
 * Bounded capture of one noninteractive shell call's output (blueprint, Bash invocation and result; A08).
 *
 * Both streams are drained as fast as the child writes, so a full pipe never blocks it. Memory stays bounded whatever
 * the command prints: each stream keeps only its tail up to the inline budget, and the full interleaved output is
 * streamed to a records file up to the retention limit, past which bytes are counted and dropped.
 */
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, posix } from 'node:path';

import { shellLimits, shellLogDirectory } from '#shell/shell-contract.js';
import type { ShellLog, ShellStream } from '#shell/shell-contract.js';

/** One stream's tail and totals. */
type Tail = { chunks: Array<Uint8Array<ArrayBuffer>>; kept: number; bytes: number };

/** Where a call's full output goes once it outgrows the inline budget. */
export type ShellLogTarget = Readonly<{
  /** The checkout's real root path. */
  root: string;
  /** A file name unique to this call, without directories. */
  name: string;
}>;

/** What a finished capture reports. */
export type ShellCapture = Readonly<{ stdout: ShellStream; stderr: ShellStream; log?: ShellLog | undefined }>;

const isContinuation = (byte: number): boolean => (byte & 0xc0) === 0x80; // oxlint-disable-line no-bitwise -- UTF-8 lead bits.

const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
const lenientDecoder = new TextDecoder('utf-8');

/**
 * Decode a byte tail, dropping a leading partial character the cut split, and say whether anything was invalid.
 *
 * @param bytes - The kept bytes.
 * @param cut - Whether earlier bytes were dropped, so the first character may be partial.
 * @returns The text and whether replacement characters stand in for invalid bytes.
 */
export const decodeTail = (
  bytes: Uint8Array<ArrayBuffer>,
  cut: boolean,
): Readonly<{ text: string; undecodable: boolean }> => {
  let start = 0;
  if (cut) {
    while (start < Math.min(3, bytes.length) && isContinuation(bytes[start]!)) {
      start++;
    }
  }
  const view = bytes.subarray(start);
  try {
    return { text: fatalDecoder.decode(view), undecodable: false };
  } catch {
    return { text: lenientDecoder.decode(view), undecodable: true };
  }
};

const keep = (tail: Tail, chunk: Uint8Array<ArrayBuffer>, limit: number): void => {
  tail.bytes += chunk.byteLength;
  const piece = chunk.byteLength > limit ? chunk.subarray(chunk.byteLength - limit) : chunk;
  tail.chunks.push(piece);
  tail.kept += piece.byteLength;
  while (tail.kept - tail.chunks[0]!.byteLength >= limit) {
    tail.kept -= tail.chunks.shift()!.byteLength;
  }
};

const lastBytes = (tail: Tail, count: number): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(tail.kept);
  let offset = 0;
  for (const chunk of tail.chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.subarray(Math.max(0, joined.byteLength - count));
};

/**
 * Split the combined inline budget: each stream gets half, and a stream that needs less hands the rest to the other.
 *
 * @param stdout - Bytes stdout produced.
 * @param stderr - Bytes stderr produced.
 * @param budget - The combined inline budget.
 * @returns How many tail bytes of each stream are shown.
 */
export const inlineShares = (
  stdout: number,
  stderr: number,
  budget: number,
): Readonly<{ stdout: number; stderr: number }> => {
  const half = Math.floor(budget / 2);
  const out = Math.min(stdout, Math.max(half, budget - Math.min(stderr, half)));
  return { stdout: out, stderr: Math.min(stderr, budget - out) };
};

/**
 * Open the call's log file inside the records row, refusing any link along the way: the directory is created by the
 * host, and the file is new, so a name the shell planted can never redirect the write.
 */
const openLog = async (target: ShellLogTarget): Promise<Readonly<{ handle: FileHandle; path: string }>> => {
  const directory = join(target.root, ...shellLogDirectory.split('/'));
  await mkdir(directory, { recursive: true });
  const status = await lstat(directory);
  if (!status.isDirectory() || (await realpath(directory)) !== directory) {
    throw new Error(`${shellLogDirectory} is not a plain directory inside the project.`);
  }
  const file = join(directory, target.name);
  // oxlint-disable-next-line no-bitwise -- open flags.
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
  const handle = await open(file, flags, 0o600);
  return { handle, path: file };
};

/**
 * Capture one call's two streams within the shared bounds.
 *
 * @param options - Where the full log may go, and the bounds (the shared constants by default).
 * @returns The capture: `drain` consumes a stream; `finish` settles the streams and the log once.
 */
export const createShellCapture = (
  options: Readonly<{
    log: ShellLogTarget;
    inlineBytes?: number;
    retainedBytes?: number;
  }>,
): Readonly<{
  drain: (stream: 'stdout' | 'stderr', chunks: AsyncIterable<Uint8Array<ArrayBuffer>>) => Promise<void>;
  finish: () => Promise<ShellCapture>;
}> => {
  const inlineBytes = options.inlineBytes ?? shellLimits.inlineOutputBytes;
  const retainedBytes = options.retainedBytes ?? shellLimits.retainedOutputBytes;
  const tails: Record<'stdout' | 'stderr', Tail> = {
    stdout: { chunks: [], kept: 0, bytes: 0 },
    stderr: { chunks: [], kept: 0, bytes: 0 },
  };
  /* The interleaved head, held until the output outgrows the inline budget and a log is needed. */
  let head: Array<Uint8Array<ArrayBuffer>> = [];
  let headBytes = 0;
  let retained = 0;
  let discarded = 0;
  let file: Readonly<{ handle: FileHandle; path: string }> | undefined;
  let failure: string | undefined;
  /* Writes run one at a time, in arrival order. */
  let writing: Promise<void> = Promise.resolve();

  const write = (chunk: Uint8Array<ArrayBuffer>): void => {
    // oxlint-disable-next-line promise/prefer-await-to-then -- a serial chain: each write starts after the one before.
    writing = writing.then(async () => {
      if (failure !== undefined) {
        return;
      }
      try {
        file ??= await openLog(options.log);
        await file.handle.write(chunk);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    });
  };

  const retain = (chunk: Uint8Array<ArrayBuffer>): void => {
    const room = retainedBytes - retained;
    const piece = chunk.byteLength > room ? chunk.subarray(0, room) : chunk;
    discarded += chunk.byteLength - piece.byteLength;
    retained += piece.byteLength;
    if (piece.byteLength === 0) {
      return;
    }
    if (headBytes + piece.byteLength <= inlineBytes) {
      head.push(new Uint8Array(piece));
      headBytes += piece.byteLength;
      return;
    }
    for (const held of head) {
      write(held);
    }
    head = [];
    headBytes = Number.POSITIVE_INFINITY;
    write(new Uint8Array(piece));
  };

  const drain = async (stream: 'stdout' | 'stderr', chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<void> => {
    for await (const chunk of chunks) {
      keep(tails[stream], chunk, inlineBytes);
      retain(chunk);
    }
  };

  const finish = async (): Promise<ShellCapture> => {
    await writing;
    const total = tails.stdout.bytes + tails.stderr.bytes;
    const shares = inlineShares(tails.stdout.bytes, tails.stderr.bytes, inlineBytes);
    const streamOf = (stream: 'stdout' | 'stderr'): ShellStream => {
      const tail = tails[stream];
      const truncated = shares[stream] < tail.bytes;
      return { ...decodeTail(lastBytes(tail, shares[stream]), truncated), bytes: tail.bytes, truncated };
    };
    const stdout = streamOf('stdout');
    const stderr = streamOf('stderr');
    if (total <= inlineBytes) {
      return { stdout, stderr };
    }
    let log: ShellLog;
    if (file === undefined || failure !== undefined) {
      log = { status: 'unavailable', message: failure ?? 'The log was not written.', discardedBytes: discarded };
    } else {
      try {
        await file.handle.sync();
        log = {
          status: 'saved',
          path: posix.join(shellLogDirectory, options.log.name),
          bytes: retained,
          discardedBytes: discarded,
        };
      } catch (error) {
        log = {
          status: 'unavailable',
          message: error instanceof Error ? error.message : String(error),
          discardedBytes: discarded,
        };
      }
    }
    await file?.handle.close().catch(() => undefined);
    if (log.status === 'unavailable' && file !== undefined) {
      /* No reference to a partial file: remove it rather than leave a log nothing names. */
      await unlink(file.path).catch(() => undefined);
    }
    return { stdout, stderr, log };
  };

  return { drain, finish };
};
