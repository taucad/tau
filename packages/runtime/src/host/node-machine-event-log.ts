import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { ResourceQueue } from '@taucad/filesystem';

// Ponytail: bounded in-memory recovery keeps each log simple; add an indexed log only beyond 64 MiB.
const maximumFileBytes = 64 * 1024 * 1024;
const maximumFrameBytes = 1024 * 1024;
const queueKey = 'machine-event-log';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Exclusive-writer fence retained by the host authority. @internal */
export type MachineEventLogOwner = Readonly<{ assertCurrent(): void | Promise<void> }>;

/** One committed machine-authority event. @internal */
export type MachineEventLogRecord<Event> = Readonly<{ sequence: number; event: Event }>;

/** Narrow append/replay log used by machine directory and physical-effect owners. @internal */
export type MachineEventLog<Event> = Readonly<{
  append(candidate: unknown): Promise<MachineEventLogRecord<Event>>;
  replay(input: Readonly<{ cursor: number; limit: number }>): Promise<
    Readonly<{
      records: ReadonlyArray<MachineEventLogRecord<Event>>;
      nextCursor: number;
      endCursor: number;
    }>
  >;
  close(): Promise<void>;
}>;

type StoredFrame = Readonly<{ sequence: number; event: CacheValue; checksum: ContentDigest }>;

const guarded = async <Value>(owner: MachineEventLogOwner, operation: () => Promise<Value>): Promise<Value> => {
  await owner.assertCurrent();
  const value = await operation();
  await owner.assertCurrent();
  return value;
};

const canonicalEvent = <Event extends CacheValue>(candidate: unknown, parse: (value: unknown) => Event): Event =>
  parse(JSON.parse(canonicalizeCacheValue({ value: parse(candidate) })));

const checksum = async (event: CacheValue): Promise<ContentDigest> =>
  digestContent({ bytes: encoder.encode(canonicalizeCacheValue({ value: event })) });

const openLogFile = async (directoryPath: string, fileName: string): Promise<FileHandle> => {
  const createFlags =
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
    constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_RDWR;
  let file: FileHandle;
  try {
    file = await open(join(directoryPath, fileName), createFlags, 0o600);
  } catch (error) {
    if (error === null || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') {
      throw error;
    }
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
    return open(join(directoryPath, fileName), constants.O_APPEND | constants.O_NOFOLLOW | constants.O_RDWR);
  }
  try {
    const directory = await open(directoryPath, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
  return file;
};

const readOwnedFile = async (file: FileHandle, owner: MachineEventLogOwner): Promise<Uint8Array<ArrayBuffer>> => {
  const stats = await guarded(owner, async () => file.stat());
  if (!stats.isFile() || !Number.isSafeInteger(stats.size) || stats.size < 0 || stats.size > maximumFileBytes) {
    throw new Error('MACHINE_EVENT_LOG_FILE_LIMIT');
  }
  const bytes = new Uint8Array(stats.size);
  let offset = 0;
  while (offset < bytes.byteLength) {
    // oxlint-disable-next-line eslint/no-await-in-loop, eslint/no-loop-func -- Each guarded positional read captures the current offset.
    const result = await guarded(owner, async () => file.read(bytes, offset, bytes.byteLength - offset, offset));
    if (result.bytesRead === 0) {
      throw new Error('MACHINE_EVENT_LOG_SHORT_READ');
    }
    offset += result.bytesRead;
  }
  return bytes;
};

// Decode one committed frame, throwing on anything but the exact canonical bytes this log writes at `sequence`.
const decodeFrame = async <Event extends CacheValue>(
  line: Uint8Array<ArrayBuffer>,
  sequence: number,
  parse: (value: unknown) => Event,
): Promise<Event> => {
  if (line.byteLength < 1 || line.byteLength > maximumFrameBytes) {
    throw new Error('MACHINE_EVENT_LOG_CORRUPT_RECORD');
  }
  const text = decoder.decode(line);
  const candidate: unknown = JSON.parse(text);
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('MACHINE_EVENT_LOG_CORRUPT_RECORD');
  }
  const frame = candidate as Record<string, unknown>;
  if (
    Object.keys(frame).length !== 3 ||
    frame['sequence'] !== sequence ||
    typeof frame['checksum'] !== 'string' ||
    !Object.hasOwn(frame, 'event')
  ) {
    throw new Error('MACHINE_EVENT_LOG_CORRUPT_RECORD');
  }
  const event = canonicalEvent(frame['event'], parse);
  const expectedChecksum = await checksum(event);
  const stored: StoredFrame = { sequence, event, checksum: expectedChecksum };
  if (frame['checksum'] !== expectedChecksum || text !== canonicalizeCacheValue({ value: stored })) {
    throw new Error('MACHINE_EVENT_LOG_CORRUPT_RECORD');
  }
  return event;
};

const recover = async <Event extends CacheValue>(
  file: FileHandle,
  owner: MachineEventLogOwner,
  parse: (value: unknown) => Event,
): Promise<Readonly<{ byteLength: number; records: ReadonlyArray<MachineEventLogRecord<Event>> }>> => {
  const bytes = await readOwnedFile(file, owner);
  const lastNewline = bytes.lastIndexOf(10);
  const committedLength = bytes.byteLength === 0 ? 0 : lastNewline + 1;
  if (committedLength !== bytes.byteLength) {
    await guarded(owner, async () => file.truncate(committedLength));
    await guarded(owner, async () => file.sync());
  }
  const records: Array<MachineEventLogRecord<Event>> = [];
  let start = 0;
  while (start < committedLength) {
    const end = bytes.indexOf(10, start);
    let event: Event;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Checksums preserve committed record order during recovery.
      event = await decodeFrame(bytes.subarray(start, end), records.length, parse);
    } catch (error) {
      throw new Error('MACHINE_EVENT_LOG_CORRUPT_RECORD', { cause: error });
    }
    records.push(Object.freeze({ sequence: records.length, event }));
    start = end + 1;
  }
  return Object.freeze({ byteLength: committedLength, records: Object.freeze(records) });
};

const unowned: MachineEventLogOwner = {
  assertCurrent() {
    /* A read-only log is not this host's to fence. */
  },
};

/**
 * Read the committed events of a log another writer owned, without writing to it: bytes after the last newline and
 * every frame from the first one that fails its checks are left out, never repaired.
 *
 * @internal
 * @param path - The log file; a missing file reads as empty. A link or anything but a regular file is refused.
 * @returns The events of the valid committed prefix, in order, and whether that prefix is every committed frame.
 */
export const readMachineEventLogPrefix = async (
  path: string,
): Promise<Readonly<{ events: readonly CacheValue[]; complete: boolean }>> => {
  let file: FileHandle;
  try {
    // Non-blocking, so a FIFO in the log's place is refused as a non-file instead of blocking the open.
    // oxlint-disable-next-line eslint/no-bitwise -- POSIX open flags are bit masks.
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return Object.freeze({ events: Object.freeze([]), complete: true });
    }
    throw error;
  }
  try {
    const bytes = await readOwnedFile(file, unowned);
    const committedLength = bytes.lastIndexOf(10) + 1;
    const events: CacheValue[] = [];
    let start = 0;
    while (start < committedLength) {
      const end = bytes.indexOf(10, start);
      try {
        // SAFETY: the frame's event comes from JSON.parse, so it is plain JSON.
        // oxlint-disable-next-line eslint/no-await-in-loop -- frames are checked in order; the first bad one ends the prefix.
        events.push(await decodeFrame(bytes.subarray(start, end), events.length, (value) => value as CacheValue));
      } catch {
        return Object.freeze({ events: Object.freeze(events), complete: false });
      }
      start = end + 1;
    }
    return Object.freeze({ events: Object.freeze(events), complete: true });
  } finally {
    await file.close();
  }
};

/**
 * Open one bounded, checksummed machine event log, creating it `0600` when missing.
 *
 * @internal
 * @param input - Protected directory, the log's file name, retained writer fence, and closed event parser.
 * @returns Recovered single-writer append/replay log.
 */
export const createNodeMachineEventLog = async <Event extends CacheValue>(input: {
  directory: string;
  fileName: string;
  owner: MachineEventLogOwner;
  parse(candidate: unknown): Event;
}): Promise<MachineEventLog<Event>> => {
  const file = await openLogFile(input.directory, input.fileName);
  let recovered;
  try {
    recovered = await recover(file, input.owner, input.parse);
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
  const records = [...recovered.records];
  let visibleBytes = recovered.byteLength;
  let closed = false;
  let poisoned = false;
  const queue = new ResourceQueue();

  const assertOpen = async (): Promise<void> => {
    await input.owner.assertCurrent();
    if (closed) {
      throw new Error('MACHINE_EVENT_LOG_CLOSED');
    }
    if (poisoned) {
      throw new Error('MACHINE_EVENT_LOG_POISONED');
    }
  };

  return Object.freeze({
    append: async (candidate) =>
      queue.queueFor(queueKey, async () => {
        await assertOpen();
        const event = canonicalEvent(candidate, input.parse);
        const frame: StoredFrame = { sequence: records.length, event, checksum: await checksum(event) };
        const bytes = encoder.encode(`${canonicalizeCacheValue({ value: frame })}\n`);
        if (bytes.byteLength > maximumFrameBytes + 1 || visibleBytes + bytes.byteLength > maximumFileBytes) {
          throw new Error('MACHINE_EVENT_LOG_FILE_LIMIT');
        }
        try {
          let written = 0;
          while (written < bytes.byteLength) {
            // oxlint-disable-next-line eslint/no-await-in-loop, eslint/no-loop-func -- Each guarded short append captures the current byte offset.
            const result = await guarded(input.owner, async () =>
              file.write(bytes, written, bytes.byteLength - written, null),
            );
            if (result.bytesWritten === 0) {
              throw new Error('MACHINE_EVENT_LOG_SHORT_WRITE');
            }
            written += result.bytesWritten;
          }
          await guarded(input.owner, async () => file.sync());
        } catch (error) {
          try {
            await guarded(input.owner, async () => file.truncate(visibleBytes));
            await guarded(input.owner, async () => file.sync());
          } catch (rollbackError) {
            poisoned = true;
            throw new Error('MACHINE_EVENT_LOG_POISONED', {
              cause: new AggregateError([error, rollbackError], 'Append and rollback both failed.'),
            });
          }
          throw error;
        }
        const record = Object.freeze({ sequence: records.length, event });
        records.push(record);
        visibleBytes += bytes.byteLength;
        return record;
      }),
    replay: async ({ cursor, limit }) =>
      queue.queueFor(queueKey, async () => {
        await assertOpen();
        if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1024) {
          throw new TypeError('MACHINE_EVENT_LOG_INVALID_REPLAY');
        }
        const start = Math.min(cursor, records.length);
        const page = Object.freeze(records.slice(start, start + limit));
        return Object.freeze({ records: page, nextCursor: start + page.length, endCursor: records.length });
      }),
    close: async () =>
      queue.queueFor(queueKey, async () => {
        if (closed) {
          return;
        }
        closed = true;
        await file.close();
      }),
  });
};
