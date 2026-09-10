import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
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

// A lock whose recorded writer pid no longer exists was left behind by a crashed or killed host;
// nothing will ever release it, so it may be taken over. Unreadable or non-numeric content counts as held.
// ponytail: pid liveness only; a reused pid after reboot keeps a dead lock alive until that process exits — add a boot id if that bites.
const isStaleLock = async (path: string): Promise<boolean> => {
  const pid = Number.parseInt(await readFile(path, 'utf8').catch(() => ''), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
};

const openLock = async (path: string): Promise<FileHandle | undefined> => {
  try {
    return await open(path, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return undefined;
    }
    throw error;
  }
};

const acquireWriterLock = async (filePath: string): Promise<{ readonly handle: FileHandle; readonly path: string }> => {
  const path = `${filePath}.lock`;
  const locked = (): EventLogError =>
    new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active Node writer.`);
  let handle = await openLock(path);
  let tookOver = false;
  if (handle === undefined && (await isStaleLock(path))) {
    await unlink(path).catch(() => undefined);
    handle = await openLock(path);
    tookOver = true;
  }
  // A lock released between the EEXIST and the pid read reads as held; one more try before refusing.
  handle ??= await openLock(path);
  if (handle === undefined) {
    throw locked();
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
  if (tookOver) {
    // Two takers can both unlink one stale lock, so both `wx` creates succeed and the earlier file is
    // gone. Only the handle whose inode the path still names holds the lock; the other must stand
    // down without unlinking (the path is the winner's now).
    // ponytail: verify-after-settle narrows the race to sub-millisecond straggling (0/40 measured), not a proof — an OS advisory lock (flock) is the sound upgrade.
    await sleep(200);
    const [mine, onDisk] = await Promise.all([handle.stat(), stat(path).catch(() => undefined)]);
    if (onDisk?.ino !== mine.ino) {
      await handle.close().catch(() => undefined);
      throw locked();
    }
  }
  return { handle, path };
};

const releaseWriterLock = async (lock: { readonly handle: FileHandle; readonly path: string }): Promise<void> => {
  // A straggling taker past the settle window may already own the path; unlinking it would admit a
  // third writer, so only the lock the path still names is removed (6-review C1).
  const [mine, onDisk] = await Promise.all([lock.handle.stat(), stat(lock.path).catch(() => undefined)]);
  try {
    await lock.handle.close();
  } finally {
    if (onDisk?.ino === mine.ino) {
      await unlink(lock.path).catch(() => undefined);
    }
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
