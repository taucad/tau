import { mkdir, open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createEventLogAppender } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';

/** Node event-log options. @public */
export type NodeEventLogOptions = {
  /** Exact filesystem path for `.tau/chats/<chatId>/events.jsonl`. */
  readonly filePath: string;
};

const acquireWriterLock = async (filePath: string): Promise<{ readonly handle: FileHandle; readonly path: string }> => {
  const path = `${filePath}.lock`;
  let handle: FileHandle;
  try {
    handle = await open(path, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active Node writer.`, {
        cause: error,
      });
    }
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    await handle.sync();
    return { handle, path };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
};

const releaseWriterLock = async (lock: { readonly handle: FileHandle; readonly path: string }): Promise<void> => {
  try {
    await lock.handle.close();
  } finally {
    await unlink(lock.path).catch(() => undefined);
  }
};

/**
 * Open a Node filesystem event log using append mode and an fsync per line.
 *
 * Parent directories are created when absent. A torn final line is truncated
 * before the first new append so later records cannot attach to corrupt bytes.
 *
 * @param options - Exact event-log file path owned by the host.
 * @returns An initialized, leader-epoch-idempotent event-log appender.
 * @public
 */
export const createNodeEventLog = async (options: NodeEventLogOptions): Promise<EventLogAppender> => {
  await mkdir(dirname(options.filePath), { recursive: true });
  const lock = await acquireWriterLock(options.filePath);
  let file: FileHandle;
  try {
    file = await open(options.filePath, 'a+');
  } catch (error) {
    await releaseWriterLock(lock);
    throw error;
  }
  const storage: EventLogStorage = {
    read: async () => {
      const { size } = await file.stat();
      const bytes = new Uint8Array(size);
      let offset = 0;
      while (offset < size) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential positional reads share one file handle.
        const result = await file.read(bytes, offset, size - offset, offset);
        if (result.bytesRead <= 0) {
          throw new EventLogError('STORAGE_SHORT_READ', `Node stopped after reading ${offset} of ${size} bytes.`);
        }
        offset += result.bytesRead;
      }
      return bytes;
    },
    append: async (bytes) => {
      await file.appendFile(bytes);
      await file.sync();
    },
    truncate: async (size) => {
      await file.truncate(size);
      await file.sync();
    },
    close: async () => {
      try {
        await file.close();
      } finally {
        await releaseWriterLock(lock);
      }
    },
  };

  try {
    return await createEventLogAppender(storage);
  } catch (error) {
    try {
      await file.close();
    } finally {
      await releaseWriterLock(lock);
    }
    throw error;
  }
};
