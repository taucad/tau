import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { mkdir, open, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { FileHandle } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { acquireNodeAuthorityWriter, NodeAuthorityWriterError } from '@taucad/filesystem/backend/node';
import type { NodeAuthorityWriter } from '@taucad/filesystem/backend/node';
import { EventLogError } from '#log/event-log-error.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import { parseEventLogBytes } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { chatAttachmentPath } from '#harness/session-record.js';
import type { AttachmentReader } from '#harness/session-record.js';
import { createChatStore, requireChatPathSegment } from '#launchers/chat-store.js';
import type { ChatStore } from '#launchers/chat-store.js';
import { createNodeLeadership } from '#launchers/node/node-leadership.js';

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
  /**
   * `read` never creates the file or its directory and takes no lock: each read reads the file as it is (W6 RH-A18).
   * `write` creates the file, syncs its directory once, and holds the chat's writer lock for the log's life.
   */
  readonly access: 'read' | 'write';
};

/** A read-only open: no handle, lock or writer is kept between reads. @public */
export type EventLogReader = Pick<EventLogAppender, 'read' | 'close'>;

/** A write open: the appender, whose `append` answers the end cursor. @public */
export type EventLogWriter = EventLogAppender;

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

/* The legacy pid marker, kept as a courtesy for builds that honour only it until the desktop support window ends
 * (CL-S11). Every takeover of a stale marker is verified after a settle window: a writer holding the kernel lock can
 * still race one that holds none (a Darwin worker thread, an unsupported platform, an older build). */
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
    // Two takers can both unlink one stale lock, so both `wx` creates succeed and the earlier file is gone. Only the
    // handle whose inode the path still names holds the lock; the other stands down without unlinking.
    // ponytail: verify-after-settle narrows the race to sub-millisecond straggling (0/40 measured), not a proof; the
    // kernel lock is the sound fence wherever the helper holds one.
    await sleep(200);
    const [mine, onDisk] = await Promise.all([handle.stat(), stat(path).catch(() => undefined)]);
    if (onDisk?.ino !== mine.ino) {
      await handle.close().catch(() => undefined);
      throw locked();
    }
  }
  return { handle, path };
};

/**
 * The chat's kernel writer lock (EQ2): `lockf` on Darwin and `flock` on Linux on `authority.writer.lock` in the chat's
 * directory, held for the log's life. It is per open file description, so a second writer in this process is refused,
 * and the kernel releases it when the holder dies. Taken from a worker thread it does not hold on Darwin (the helper's
 * child locks a description the worker does not keep), so a Darwin worker takes none. There, and on platforms the
 * helper refuses, the pid marker is the only fence: advisory (CL-Q5), with each takeover verified after a settle window.
 */
const acquireKernelLock = async (filePath: string): Promise<NodeAuthorityWriter | undefined> => {
  if (process.platform === 'darwin' && !isMainThread) {
    // Owed to the filesystem owners (RV8-F3): until the helper holds from a worker, the pid marker fences alone.
    return undefined;
  }
  try {
    return await acquireNodeAuthorityWriter({ authorityRoot: dirname(filePath) });
  } catch (error) {
    if (error instanceof NodeAuthorityWriterError && error.code === 'AUTHORITY_ALREADY_OWNED') {
      throw new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active Node writer.`, {
        cause: error,
      });
    }
    if (error instanceof NodeAuthorityWriterError && error.code === 'AUTHORITY_LOCK_UNSUPPORTED') {
      return undefined;
    }
    throw error;
  }
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

const readIfPresent = async (filePath: string): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    return new Uint8Array(await readFile(filePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Uint8Array(new ArrayBuffer(0));
    }
    throw error;
  }
};

/** Sync a directory so a file created in it survives power loss (L4 D-107). */
const syncDirectory = async (directory: string): Promise<void> => {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const openWriter = async (filePath: string): Promise<EventLogAppender> => {
  await mkdir(dirname(filePath), { recursive: true });
  const kernelLock = await acquireKernelLock(filePath);
  const releaseKernelLock = async (): Promise<void> => kernelLock?.release();
  let lock: { readonly handle: FileHandle; readonly path: string };
  try {
    lock = await acquireWriterLock(filePath);
  } catch (error) {
    await releaseKernelLock();
    throw error;
  }
  const releaseLocks = async (): Promise<void> => {
    try {
      await releaseWriterLock(lock);
    } finally {
      await releaseKernelLock();
    }
  };
  let file: FileHandle;
  try {
    const created = await open(filePath, 'wx').then(
      async (handle) => {
        await handle.close();
        return true;
      },
      (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return false;
        }
        throw error;
      },
    );
    if (created) {
      await syncDirectory(dirname(filePath));
    }
    file = await open(filePath, 'a+');
  } catch (error) {
    await releaseLocks();
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
    size: async () => {
      const stats = await file.stat();
      return stats.size;
    },
    // The kernel lock is held for the log's life, so every section is already exclusive.
    exclusive: async (section) => section(),
    close: async () => {
      try {
        await file.close();
      } finally {
        await releaseLocks();
      }
    },
  };

  try {
    return await createEventLogAppender(storage);
  } catch (error) {
    try {
      await file.close();
    } finally {
      await releaseLocks();
    }
    throw error;
  }
};

/**
 * Open a Node filesystem event log.
 *
 * A write open holds the chat's kernel writer lock for the log's life (a writer that finds it held is refused
 * `WRITER_LOCKED`), appends with an fsync per line, and syncs the directory once after creating the file. A torn final
 * line is repaired by the first append, never at open. Every append is fenced: it lands only if the log is still the
 * log this writer read (`LOG_FENCED`, D5). A read open creates nothing, takes no lock and keeps no handle.
 *
 * @param options - Exact event-log file path and access mode.
 * @returns A reader or an initialized, leader-epoch-idempotent writer.
 * @public
 */
export function createNodeEventLog(options: NodeEventLogOptions & { readonly access: 'read' }): Promise<EventLogReader>;
export function createNodeEventLog(
  options: NodeEventLogOptions & { readonly access: 'write' },
): Promise<EventLogWriter>;
/** Implements both access overloads of {@link createNodeEventLog}. @public */
export async function createNodeEventLog(options: NodeEventLogOptions): Promise<EventLogReader | EventLogWriter> {
  if (options.access === 'write') {
    return openWriter(options.filePath);
  }
  let closed = false;
  return {
    read: async (): Promise<readonly AgentLogEvent[]> => {
      if (closed) {
        throw new EventLogError('LOG_CLOSED', 'The event log reader is closed.');
      }
      return parseEventLogBytes(await readIfPresent(options.filePath)).events;
    },
    close: async () => {
      closed = true;
    },
  };
}

/** Options for {@link createNodeChatStore}. @public */
export type NodeChatStoreOptions = Readonly<{
  /** Absolute workspace root; each chat's log lives at `.tau/chats/<chatId>/events.jsonl` under it. */
  workspaceRoot: string;
}>;

/**
 * The Node half of a launcher (W6 RH-S2): chat logs under a workspace directory, written under the chat's kernel lock,
 * with one process leading every chat it opens. A read never creates the chat's directory, file or lock (RH-R1).
 *
 * @param options - The workspace root.
 * @returns The opaque store `createAgentLauncher` takes.
 * @public
 *
 * @example <caption>One launcher over a workspace</caption>
 * ```typescript
 * import { createNodeChatStore } from '@taucad/agent-host/node';
 *
 * const chats = createNodeChatStore({ workspaceRoot: process.cwd() });
 * ```
 */
export const createNodeChatStore = (options: NodeChatStoreOptions): ChatStore => {
  const filePath = (chatId: string): string =>
    join(options.workspaceRoot, '.tau', 'chats', requireChatPathSegment(chatId), 'events.jsonl');
  let observer: FSWatcher | undefined;
  const subscriptions = new Map<
    symbol,
    Readonly<{
      path: string;
      onChange: () => void;
      onError: (error: unknown) => void;
    }>
  >();
  return createChatStore({
    platform: 'node',
    /* `appendFile` then `sync()` per append, and the directory synced once at creation (W3 §11). */
    durability: 'exclusive-append',
    attachments: createNodeAttachmentReader(options.workspaceRoot),
    readBytes: async (chatId) => readIfPresent(filePath(chatId)),
    observeBytes: async (chatId, { signal, onChange, onError }) => {
      const key = Symbol(chatId);
      subscriptions.set(key, { path: relative(options.workspaceRoot, filePath(chatId)), onChange, onError });
      if (observer === undefined) {
        try {
          // One binding-owned watch also sees creation of a missing chat's ancestors.
          const watching = watch(options.workspaceRoot, { recursive: true }, (_event, filename) => {
            if (observer !== watching) {
              return;
            }
            for (const subscription of subscriptions.values()) {
              if (filename === null || filename === subscription.path || subscription.path.startsWith(`${filename}/`)) {
                subscription.onChange();
              }
            }
          });
          observer = watching;
          watching.on('error', (error) => {
            if (observer !== watching) {
              return;
            }
            // oxlint-disable-next-line unicorn/no-useless-spread -- callbacks can release or replace subscriptions.
            for (const subscription of [...subscriptions.values()]) {
              subscription.onError(error);
            }
          });
          watching.on('close', () => {
            if (observer === watching) {
              observer = undefined;
              // oxlint-disable-next-line unicorn/no-useless-spread -- notify precisely the owners present at closure.
              for (const subscription of [...subscriptions.values()]) {
                subscription.onError(new Error('The chat source observation closed.'));
              }
            }
          });
        } catch (error) {
          subscriptions.delete(key);
          throw error;
        }
      }
      const release = (): void => {
        signal.removeEventListener('abort', release);
        subscriptions.delete(key);
        if (subscriptions.size === 0) {
          const watching = observer;
          observer = undefined;
          watching?.close();
        }
      };
      signal.addEventListener('abort', release, { once: true });
      if (signal.aborted) {
        release();
      }
      return release;
    },
    openWriter: async (chatId) => createNodeEventLog({ filePath: filePath(chatId), access: 'write' }),
    leadership: createNodeLeadership,
  });
};
