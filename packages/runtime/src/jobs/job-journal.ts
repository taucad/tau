import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue, ContentDigest } from '@taucad/cache-core';
import { ResourceQueue } from '@taucad/filesystem';

const journalQueueKey = 'authority-journal';
const maximumFrameBytes = 1024 * 1024;
const readChunkBytes = 64 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Explicit exclusive-owner fence supplied by the authority composition. @internal */
export type JobJournalOwnerFence = Readonly<{ assertCurrent(): void | Promise<void> }>;

/** Named bounded range read for an already exclusively owned journal. @internal */
export type JobJournalReadInput = Readonly<{ offset: number; maximumBytes: number }>;

/** One bounded storage read result. @internal */
export type JobJournalReadResult = Readonly<{ bytes: Uint8Array<ArrayBuffer>; endOfFile: boolean }>;

/** Minimal storage handle owned and opened by the environment-specific authority. @internal */
export type JobJournalStorage = Readonly<{
  read(input: JobJournalReadInput): Promise<JobJournalReadResult>;
  append(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  flush(): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}>;

/** One committed authority-journal record. @internal */
export type JobJournalRecord<Event> = Readonly<{ sequence: number; event: Event }>;

/** Named bounded replay request. @internal */
export type JobJournalReplayInput = Readonly<{ cursor: number; limit: number }>;

/** One bounded replay page from a stable committed journal prefix. @internal */
export type JobJournalReplayPage<Event> = Readonly<{
  records: ReadonlyArray<JobJournalRecord<Event>>;
  nextCursor: number;
  endCursor: number;
}>;

/** Private authority-owned journal primitive. @internal */
export type JobJournal<Event> = Readonly<{
  append(candidate: unknown): Promise<JobJournalRecord<Event>>;
  replay(input: JobJournalReplayInput): Promise<JobJournalReplayPage<Event>>;
  close(): Promise<void>;
}>;

/** Named journal construction input. @internal */
export type CreateJobJournalInput<Event extends CacheValue> = Readonly<{
  storage: JobJournalStorage;
  owner: JobJournalOwnerFence;
  parseEvent(candidate: unknown): Event;
}>;

type JournalFrame = Readonly<{ sequence: number; event: CacheValue; checksum: ContentDigest }>;
type ScanResult = Readonly<{ byteLength: number; count: number; discardedTail: boolean }>;

const guarded = async <Value>(owner: JobJournalOwnerFence, operation: () => Promise<Value>): Promise<Value> => {
  await owner.assertCurrent();
  const value = await operation();
  await owner.assertCurrent();
  return value;
};

const joinBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
};

const canonicalEvent = <Event extends CacheValue>(candidate: unknown, parseEvent: (value: unknown) => Event): Event => {
  const parsed = parseEvent(candidate);
  const canonical = canonicalizeCacheValue({ value: parsed });
  return JSON.parse(canonical) as Event;
};

const checksum = async (event: CacheValue): Promise<ContentDigest> =>
  digestContent({ bytes: encoder.encode(canonicalizeCacheValue({ value: event })) });

const parseFrame = async <Event extends CacheValue>(
  bytes: Uint8Array<ArrayBuffer>,
  expectedSequence: number,
  parseEvent: (value: unknown) => Event,
): Promise<JobJournalRecord<Event>> => {
  if (bytes.byteLength === 0 || bytes.byteLength > maximumFrameBytes) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch (error) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD', { cause: error });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  }
  const frame = value as Record<string, unknown>;
  if (
    Object.keys(frame).length !== 3 ||
    !Object.hasOwn(frame, 'sequence') ||
    !Object.hasOwn(frame, 'event') ||
    !Object.hasOwn(frame, 'checksum') ||
    frame['sequence'] !== expectedSequence ||
    typeof frame['checksum'] !== 'string'
  ) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  }
  let event: Event;
  try {
    event = canonicalEvent(frame['event'], parseEvent);
  } catch (error) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD', { cause: error });
  }
  const expectedChecksum = await checksum(event);
  if (frame['checksum'] !== expectedChecksum) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  }
  const canonicalFrame = canonicalizeCacheValue({
    value: { sequence: expectedSequence, event, checksum: expectedChecksum },
  });
  if (decoder.decode(bytes) !== canonicalFrame) {
    throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
  }
  return { sequence: expectedSequence, event };
};

const scan = async <Event extends CacheValue>(input: {
  storage: JobJournalStorage;
  owner: JobJournalOwnerFence;
  maximumByteLength?: number;
  startOffset?: number;
  startSequence?: number;
  parseEvent(candidate: unknown): Event;
  visit?(record: JobJournalRecord<Event>, byteOffset: number): void;
}): Promise<ScanResult> => {
  let offset = input.startOffset ?? 0;
  let committedByteLength = offset;
  let count = input.startSequence ?? 0;
  let pending = new Uint8Array(0);
  while (input.maximumByteLength === undefined || offset < input.maximumByteLength) {
    const maximumBytes = Math.min(readChunkBytes, (input.maximumByteLength ?? offset + readChunkBytes) - offset);
    // oxlint-disable-next-line eslint/no-await-in-loop, eslint/no-loop-func -- Journal chunks must be read and fenced in byte order.
    const result = await guarded(input.owner, async () => input.storage.read({ offset, maximumBytes }));
    if (result.bytes.byteLength > maximumBytes || (result.bytes.byteLength === 0 && !result.endOfFile)) {
      throw new Error('JOB_JOURNAL_STORAGE_PROTOCOL');
    }
    offset += result.bytes.byteLength;
    pending = joinBytes(pending, result.bytes);
    let lineStart = 0;
    for (let index = 0; index < pending.byteLength; index += 1) {
      if (pending[index] !== 10) {
        continue;
      }
      const line = pending.slice(lineStart, index);
      // oxlint-disable-next-line eslint/no-await-in-loop, eslint/no-loop-func -- Sequence and checksum validation is deliberately serial.
      const record = await guarded(input.owner, async () => parseFrame(line, count, input.parseEvent));
      input.visit?.(record, committedByteLength);
      count += 1;
      committedByteLength += line.byteLength + 1;
      lineStart = index + 1;
    }
    pending = pending.slice(lineStart);
    if (pending.byteLength > maximumFrameBytes) {
      throw new Error('JOB_JOURNAL_FRAME_LIMIT');
    }
    if (result.endOfFile) {
      if (input.maximumByteLength !== undefined && offset < input.maximumByteLength) {
        throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
      }
      break;
    }
  }
  return { byteLength: committedByteLength, count, discardedTail: pending.byteLength > 0 };
};

/**
 * Open one authority-wide journal over an externally owned, exclusively fenced storage handle.
 * The caller must retain exclusive ownership for the journal's full lifetime; the fence detects
 * stale ownership but is not a substitute for provider-level single-writer exclusion. Invoking
 * this function transfers cleanup ownership of the supplied handle: initialization failure closes
 * it, and an initialized journal's `close` remains available after poison or ownership loss.
 *
 * @internal
 * @param input - Storage, owner fence, and bounded event-domain parser.
 * @returns A recovered journal positioned after the last committed newline-framed record.
 */
export const createJobJournal = async <Event extends CacheValue>(
  input: CreateJobJournalInput<Event>,
): Promise<JobJournal<Event>> => {
  const { owner, parseEvent, storage } = input;
  const committedOffsets: number[] = [];
  let recovered: ScanResult;
  try {
    await owner.assertCurrent();
    recovered = await scan({
      storage,
      owner,
      parseEvent,
      visit(_record, byteOffset) {
        committedOffsets.push(byteOffset);
      },
    });
    if (recovered.discardedTail) {
      await guarded(owner, async () => storage.truncate(recovered.byteLength));
      await guarded(owner, async () => storage.flush());
    }
  } catch (openError) {
    try {
      await storage.close();
    } catch (closeError) {
      throw new Error('JOB_JOURNAL_OPEN_FAILED', {
        cause: new AggregateError([openError, closeError], 'Journal recovery and storage cleanup both failed.'),
      });
    }
    throw openError;
  }
  let visibleByteLength = recovered.byteLength;
  let visibleCount = recovered.count;
  let closed = false;
  let storageClosed = false;
  let poisoned = false;
  const queue = new ResourceQueue();

  const assertOpen = async (): Promise<void> => {
    await owner.assertCurrent();
    if (poisoned) {
      throw new Error('JOB_JOURNAL_POISONED');
    }
    if (closed) {
      throw new Error('JOB_JOURNAL_CLOSED');
    }
  };

  const rollback = async (cause: unknown): Promise<never> => {
    try {
      await guarded(owner, async () => storage.truncate(visibleByteLength));
      await guarded(owner, async () => storage.flush());
    } catch (rollbackError) {
      poisoned = true;
      throw new Error('JOB_JOURNAL_POISONED', {
        cause: new AggregateError([cause, rollbackError], 'Journal append and rollback both failed.'),
      });
    }
    throw cause;
  };

  return Object.freeze({
    append: async (candidate) =>
      queue.queueFor(journalQueueKey, async () => {
        await assertOpen();
        const event = canonicalEvent(candidate, parseEvent);
        const frame: JournalFrame = {
          sequence: visibleCount,
          event,
          checksum: await guarded(owner, async () => checksum(event)),
        };
        await owner.assertCurrent();
        const bytes = encoder.encode(`${canonicalizeCacheValue({ value: frame })}\n`);
        if (bytes.byteLength > maximumFrameBytes + 1) {
          throw new Error('JOB_JOURNAL_FRAME_LIMIT');
        }
        try {
          await guarded(owner, async () => storage.append(bytes));
          await guarded(owner, async () => storage.flush());
        } catch (error) {
          return rollback(error);
        }
        const record = Object.freeze({ sequence: visibleCount, event });
        committedOffsets.push(visibleByteLength);
        visibleCount += 1;
        visibleByteLength += bytes.byteLength;
        return record;
      }),
    replay: async (replayInput) =>
      queue.queueFor(journalQueueKey, async () => {
        await assertOpen();
        if (
          !Number.isSafeInteger(replayInput.cursor) ||
          replayInput.cursor < 0 ||
          !Number.isSafeInteger(replayInput.limit) ||
          replayInput.limit < 1 ||
          replayInput.limit > 1024
        ) {
          throw new TypeError('JOB_JOURNAL_INVALID_REPLAY');
        }
        const endCursor = visibleCount;
        const cursor = Math.min(replayInput.cursor, endCursor);
        const pageEndCursor = Math.min(cursor + replayInput.limit, endCursor);
        const startOffset = committedOffsets[cursor] ?? visibleByteLength;
        const maximumByteLength = committedOffsets[pageEndCursor] ?? visibleByteLength;
        const records: Array<JobJournalRecord<Event>> = [];
        const scanned = await scan({
          storage,
          owner,
          parseEvent,
          maximumByteLength,
          startOffset,
          startSequence: cursor,
          visit(record) {
            records.push(record);
          },
        });
        if (scanned.count !== pageEndCursor || scanned.byteLength !== maximumByteLength || scanned.discardedTail) {
          throw new Error('JOB_JOURNAL_CORRUPT_COMMITTED_RECORD');
        }
        return Object.freeze({
          records: Object.freeze(records),
          nextCursor: cursor + records.length,
          endCursor,
        });
      }),
    close: async () =>
      queue.queueFor(journalQueueKey, async () => {
        if (storageClosed) {
          return;
        }
        closed = true;
        await storage.close();
        storageClosed = true;
      }),
  });
};
