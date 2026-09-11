import type { FileHandle } from 'node:fs/promises';

import type { JobJournalStorage } from '#jobs/job-journal.js';

/** Input for adapting an authority-owned append-capable Node file. @internal */
export type CreateNodeJournalStorageInput = Readonly<{ file: FileHandle }>;

/**
 * Adapt an already-opened authority-owned Node file to journal storage.
 *
 * The caller owns path admission, creation and directory durability, and must
 * retain exclusive writer authority for the adapter lifetime.
 *
 * @internal
 * @param input - An append-capable file handle transferred to the adapter.
 * @returns Bounded positional journal storage.
 */
export const createNodeJournalStorage = async (input: CreateNodeJournalStorageInput): Promise<JobJournalStorage> => {
  let initialStats;
  try {
    initialStats = await input.file.stat();
    if (!initialStats.isFile() || !Number.isSafeInteger(initialStats.size) || initialStats.size < 0) {
      throw new TypeError('JOB_JOURNAL_STORAGE_INVALID_FILE');
    }
  } catch (initializationError) {
    try {
      await input.file.close();
    } catch (closeError) {
      throw new AggregateError(
        [initializationError, closeError],
        'Node journal storage initialization and transferred handle cleanup both failed.',
      );
    }
    throw initializationError;
  }
  let appendOffset = initialStats.size;
  let closed = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const assertOpen = (): void => {
    if (closing || closed) {
      throw new Error('JOB_JOURNAL_STORAGE_CLOSED');
    }
  };

  return Object.freeze({
    async read({ offset, maximumBytes }) {
      assertOpen();
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(maximumBytes) ||
        maximumBytes < 1 ||
        !Number.isSafeInteger(offset + maximumBytes)
      ) {
        throw new TypeError('JOB_JOURNAL_STORAGE_INVALID_READ');
      }
      const bytes = new Uint8Array(maximumBytes);
      let bytesRead = 0;
      while (bytesRead < maximumBytes) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- short positional reads must be completed in order.
        const result = await input.file.read(bytes, bytesRead, maximumBytes - bytesRead, offset + bytesRead);
        if (result.bytesRead === 0) {
          break;
        }
        bytesRead += result.bytesRead;
      }
      const stats = await input.file.stat();
      const { size } = stats;
      return { bytes: bytes.slice(0, bytesRead), endOfFile: offset + bytesRead >= size };
    },
    async append(bytes) {
      assertOpen();
      let written = 0;
      while (written < bytes.byteLength) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- short positional writes must preserve byte order.
        const result = await input.file.write(bytes, written, bytes.byteLength - written, appendOffset + written);
        if (result.bytesWritten === 0) {
          throw new Error('JOB_JOURNAL_STORAGE_SHORT_WRITE');
        }
        written += result.bytesWritten;
      }
      appendOffset += written;
    },
    async flush() {
      assertOpen();
      await input.file.sync();
    },
    async truncate(size) {
      assertOpen();
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new TypeError('JOB_JOURNAL_STORAGE_INVALID_TRUNCATE');
      }
      await input.file.truncate(size);
      appendOffset = size;
    },
    async close() {
      if (closed) {
        return;
      }
      closing = true;
      closePromise ??= input.file.close();
      try {
        await closePromise;
        closed = true;
      } catch (error) {
        closePromise = undefined;
        throw error;
      }
    },
  });
};
