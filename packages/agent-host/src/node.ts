import { mkdir, open, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { EventLogError } from '#log/event-log-error.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import { chatAttachmentPath } from '#harness/session-record.js';
import type { AttachmentReader } from '#harness/session-record.js';

/**
 * Read chat attachments from a workspace on the Node filesystem (D15).
 *
 * @param workspaceRoot - Absolute root whose `.tau/chats` holds each chat.
 * @returns A reader answering `undefined` for bytes not on this machine; any other I/O failure rejects.
 * @public
 */
export const createNodeAttachmentReader = (workspaceRoot: string): AttachmentReader => ({
  read: async (chatId, path) => {
    try {
      // A copy: a Node `Buffer` may be a view over a shared pool, and a reader answers owned bytes.
      return new Uint8Array(await readFile(join(workspaceRoot, chatAttachmentPath(chatId, path))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  },
});

/** Node event-log options. @public */
export type NodeEventLogOptions = {
  /** Exact filesystem path for `.tau/chats/<chatId>/events.jsonl`. */
  readonly filePath: string;
};

// The log a lock was taken on, resolved through symlinks so two spellings of one log compare equal.
const resolveLogPath = async (filePath: string): Promise<string> =>
  join(await realpath(dirname(filePath)).catch(() => dirname(filePath)), basename(filePath));

// A lock whose recorded writer pid no longer exists was left behind by a crashed or killed host;
// nothing will ever release it, so it may be taken over. Unreadable or non-numeric content counts as held.
// ponytail: pid liveness only; a reused pid after reboot keeps a dead lock alive until that process exits — add a boot id if that bites.
const isStaleLock = async (path: string, logPath: string): Promise<boolean> => {
  const contents = await readFile(path, 'utf8').catch(() => '');
  const [pidLine = '', recordedPath] = contents.split('\n');
  const pid = Number.parseInt(pidLine, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  // A directory copied while Tau runs (duplicate project, restore from a copy) brings the lock with it,
  // naming a live pid that writes the original log, not this one. Locks written before this line record
  // no path and are still judged by pid alone.
  if (recordedPath !== undefined && recordedPath !== '' && recordedPath !== logPath) {
    return true;
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
  const logPath = await resolveLogPath(filePath);
  const locked = (): EventLogError =>
    new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active Node writer.`);
  let handle = await openLock(path);
  let tookOver = false;
  if (handle === undefined && (await isStaleLock(path, logPath))) {
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
    await handle.writeFile(`${process.pid}\n${logPath}\n`);
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
