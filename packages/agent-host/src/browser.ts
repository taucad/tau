import type { FileStatOptions } from '@taucad/filesystem';
import { EventLogError } from '#log/event-log-error.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import { parseEventLogBytes } from '#log/serialization.js';
import type { AgentLogEvent, StorageDurabilityClass } from '#log/event-types.js';
import { chatAttachmentPath } from '#harness/session-record.js';
import type { AttachmentReader } from '#harness/session-record.js';
import type { HostClock } from '#harness/session.js';
import { createBrowserLeadership } from '#browser/leadership.js';
import { createChatStore, requireChatPathSegment } from '#launchers/chat-store.js';
import type { ChatStore } from '#launchers/chat-store.js';

type SyncAccessHandle = {
  getSize(): number;
  read(buffer: Uint8Array<ArrayBuffer>, options?: { at?: number }): number;
  write(buffer: Uint8Array<ArrayBuffer>, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
};

type SyncAccessCapableFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle?: () => Promise<SyncAccessHandle>;
};

/** A read-only open: no handle, lock or writer is kept between reads (W6 RH-A18). */
type BrowserEventLogReader = Pick<EventLogAppender, 'read' | 'close'>;

/** Browser OPFS event-log options. @public */
export type OpfsEventLogOptions = {
  /** Exact OPFS file handle for `.tau/chats/<chatId>/events.jsonl`. */
  readonly fileHandle: FileSystemFileHandle;
  /** `read` takes no sync handle; `write` holds the exclusive sync handle for the log's life. */
  readonly access: 'read' | 'write';
};

/** Provider or bridge-proxy event-log options. @public */
export type ProviderEventLogOptions = {
  readonly filePath: string;
  /** `read` creates nothing and takes no lock; `write` fences every append inside a per-append Web Lock. */
  readonly access: 'read' | 'write';
  /**
   * The per-append Web Lock's name, unique per chat log across projects, such as `tau-log-append:<projectId>:<chatId>`.
   * Defaults to one derived from `filePath`, which serializes same-path logs of different projects needlessly.
   */
  readonly lockName?: string | undefined;
  readonly fileSystem: {
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    writeFile(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
    appendFile?(path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
    unlink(path: string): Promise<void>;
    /** Current durable byte size; omission retains the full-read compatibility fallback. */
    stat?(path: string, options: FileStatOptions): Promise<{ readonly size: number }>;
  };
};

const readAll = (handle: SyncAccessHandle): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(handle.getSize());
  let offset = 0;
  while (offset < bytes.byteLength) {
    const read = handle.read(bytes.subarray(offset), { at: offset });
    if (read <= 0) {
      throw new EventLogError(
        'STORAGE_SHORT_READ',
        `OPFS stopped after reading ${offset} of ${bytes.byteLength} bytes.`,
      );
    }
    offset += read;
  }
  return bytes;
};

const appendAll = (handle: SyncAccessHandle, bytes: Uint8Array<ArrayBuffer>): void => {
  const start = handle.getSize();
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = handle.write(bytes.subarray(offset), { at: start + offset });
    if (written <= 0) {
      throw new EventLogError(
        'STORAGE_SHORT_WRITE',
        `OPFS stopped after writing ${offset} of ${bytes.byteLength} bytes for one event-log line.`,
      );
    }
    offset += written;
  }
  handle.flush();
};

const readerOf = (read: () => Promise<Uint8Array<ArrayBuffer>>): BrowserEventLogReader => {
  let closed = false;
  return {
    read: async (): Promise<readonly AgentLogEvent[]> => {
      if (closed) {
        throw new EventLogError('LOG_CLOSED', 'The event log reader is closed.');
      }
      return parseEventLogBytes(await read()).events;
    },
    close: async () => {
      closed = true;
    },
  };
};

/**
 * Open an OPFS positional-append event log in a dedicated browser worker.
 *
 * A write open holds the exclusive sync access handle for the log's life: every JSONL line is written at
 * `getSize()` and flushed before its append resolves, and every append is fenced on the log's length (`LOG_FENCED`,
 * D5). While another worker holds the handle the open is refused `WRITER_LOCKED`, whose recovery is to wait (CL-Q1).
 * A read open reads the file without a handle. OPFS is unavailable on null origins, so tests must use a real origin.
 *
 * @param options - Exact OPFS file handle owned by the elected worker leader, and the access mode.
 * @returns A reader, or an initialized, leader-epoch-idempotent event-log appender.
 * @public
 */
export function createOpfsEventLog(
  options: OpfsEventLogOptions & { readonly access: 'read' },
): Promise<BrowserEventLogReader>;
export function createOpfsEventLog(
  options: OpfsEventLogOptions & { readonly access: 'write' },
): Promise<EventLogAppender>;
/** Implements both access overloads of {@link createOpfsEventLog}. @public */
export async function createOpfsEventLog(
  options: OpfsEventLogOptions,
): Promise<BrowserEventLogReader | EventLogAppender> {
  if (location.origin === 'null') {
    throw new EventLogError(
      'STORAGE_NOT_WRITABLE',
      'OPFS is unavailable on a null origin. Run the dedicated worker from a real secure or localhost origin.',
    );
  }
  if (options.access === 'read') {
    return readerOf(async () => {
      const file = await options.fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    });
  }

  const acquire = (options.fileHandle as SyncAccessCapableFileHandle).createSyncAccessHandle;
  if (typeof acquire !== 'function') {
    throw new EventLogError(
      'STORAGE_NOT_WRITABLE',
      'FileSystemSyncAccessHandle is unavailable. Open the OPFS file from a dedicated worker on a supported origin.',
    );
  }

  let handle: SyncAccessHandle;
  try {
    handle = await acquire.call(options.fileHandle);
  } catch (error) {
    throw new EventLogError(
      'WRITER_LOCKED',
      "Another worker holds this chat log's exclusive OPFS handle. Wait until it closes the log, then open it again.",
      { cause: error },
    );
  }

  const storage: EventLogStorage = {
    read: async () => readAll(handle),
    append: async (bytes) => {
      appendAll(handle, bytes);
    },
    truncate: async (size) => {
      handle.truncate(size);
      handle.flush();
    },
    size: async () => handle.getSize(),
    // The exclusive handle is held for the log's life, so every section is already exclusive.
    exclusive: async (section) => section(),
    close: async () => {
      handle.close();
    },
  };

  try {
    return await createEventLogAppender(storage);
  } catch (error) {
    handle.close();
    throw error;
  }
}

/**
 * Open an event log through Tau's abstract filesystem provider or bridge proxy.
 *
 * A write open fences every append inside a per-append Web Lock, exclusive and never stolen (EQ2): the log's length
 * is checked against this writer's view and the line appended in one section, so a writer whose view is stale is
 * refused `LOG_FENCED` without writing, and a frozen holder holds nothing between appends. The adjacent `.lock`
 * marker is kept as a courtesy for builds that honour only it until the desktop support window ends (CL-S11).
 * A read open creates nothing and takes no lock.
 *
 * @param options - The log's provider path, the provider, the access mode and the lock's name.
 * @returns A reader, or an initialized, leader-epoch-idempotent event-log appender.
 * @public
 */
export function createProviderEventLog(
  options: ProviderEventLogOptions & { readonly access: 'read' },
): Promise<BrowserEventLogReader>;
export function createProviderEventLog(
  options: ProviderEventLogOptions & { readonly access: 'write' },
): Promise<EventLogAppender>;
/** Implements both access overloads of {@link createProviderEventLog}. @public */
export async function createProviderEventLog(
  options: ProviderEventLogOptions,
): Promise<BrowserEventLogReader | EventLogAppender> {
  const { filePath, fileSystem } = options;
  const readBytes = async (): Promise<Uint8Array<ArrayBuffer>> =>
    (await fileSystem.exists(filePath)) ? fileSystem.readFile(filePath) : new Uint8Array();
  if (options.access === 'read') {
    return readerOf(readBytes);
  }
  const { appendFile } = fileSystem;
  if (!appendFile) {
    throw new EventLogError('STORAGE_NOT_WRITABLE', 'The selected filesystem provider cannot append event-log data.');
  }
  const lockName = options.lockName ?? `tau-log-append:${filePath}`;

  const lockPath = `${filePath}.lock`;
  if (await fileSystem.exists(lockPath)) {
    throw new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active provider writer.`);
  }
  await appendFile.call(fileSystem, lockPath, `${Date.now()}\n`);

  const releaseWriterLock = async (): Promise<void> => {
    await fileSystem.unlink(lockPath).catch(() => undefined);
  };
  const storage: EventLogStorage = {
    read: readBytes,
    append: async (bytes) => appendFile.call(fileSystem, filePath, bytes),
    truncate: async (size) => {
      if (!(await fileSystem.exists(filePath))) {
        if (size === 0) {
          return;
        }
        throw new EventLogError('STORAGE_SHORT_READ', `Event log "${filePath}" disappeared before rollback.`);
      }
      const bytes = await fileSystem.readFile(filePath);
      await fileSystem.writeFile(filePath, bytes.slice(0, size));
    },
    size: async () => {
      if (fileSystem.stat) {
        try {
          const stat = await fileSystem.stat(filePath, { content: 'head' });
          return stat.size;
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'ENOTDIR')
          ) {
            return 0;
          }
          throw error;
        }
      }
      const bytes = await readBytes();
      return bytes.byteLength;
    },
    exclusive: async (section) => navigator.locks.request(lockName, { mode: 'exclusive' }, section),
    close: releaseWriterLock,
  };

  try {
    return await createEventLogAppender(storage);
  } catch (error) {
    await releaseWriterLock();
    throw error;
  }
}

/**
 * Read chat attachments through Tau's abstract filesystem provider or bridge proxy (D15).
 *
 * @param fileSystem - The project-root filesystem that also holds `.tau/chats`.
 * @returns A reader answering `undefined` for bytes not on this device.
 * @public
 */
export const createProviderAttachmentReader = (
  fileSystem: Pick<ProviderEventLogOptions['fileSystem'], 'exists' | 'readFile'>,
): AttachmentReader => ({
  read: async (chatId, path) => {
    // Bridge paths are root-relative, like the event log's.
    const filePath = chatAttachmentPath(chatId, path);
    return (await fileSystem.exists(filePath)) ? fileSystem.readFile(filePath) : undefined;
  },
});

// ── the browser chat store (W6 RH-S7) ─────────────────────────────────────────────────────────────

/** Options for {@link createBrowserChatStore}. @public */
export type BrowserChatStoreOptions = Readonly<{
  projectId: string;
  /** This worker's id among the origin's tabs (RH-R5). */
  tabId: string;
  /** The composition root's build identity: a tab on another build never runs this build's command (RH-R7). */
  build: string;
  /**
   * Where the project's chat logs and their attachments live: the project's own OPFS directory, whose logs take the
   * exclusive sync handle (`exclusive-append`), or the project's root filesystem, a provider or bridge proxy whose
   * appends are fenced one at a time.
   */
  log:
    | Readonly<{ kind: 'opfs'; directory: FileSystemDirectoryHandle }>
    | Readonly<{
        kind: 'provider';
        fileSystem: ProviderEventLogOptions['fileSystem'];
        /** The provider's durability class, stamped on each admission; `stream-append` when absent. */
        durability?: StorageDurabilityClass | undefined;
      }>;
  /**
   * Rooted observation of a project-relative log path. Resolve only once delivery is acknowledged; report lost
   * delivery through onError, and release registration on abort. Notifications never substitute for fresh bytes.
   */
  observeLog?:
    | ((
        input: Readonly<{
          path: string;
          signal: AbortSignal;
          onChange: () => void;
          onError: (error: unknown) => void;
        }>,
      ) => Promise<() => void>)
    | undefined;
  /**
   * The page's visibility, relayed to the worker: a hidden page never queues for a chat's lock (RH-R16), and a page
   * shown again re-arms the heartbeat bounds it may have been frozen through.
   */
  visibility?:
    | Readonly<{ visible: () => boolean; subscribe: (listener: (visible: boolean) => void) => () => void }>
    | undefined;
  /** The clock leadership's timers run on, and whose `now` measures a frozen tab's late timers; the worker's when absent. */
  clock?: (HostClock & Readonly<{ now: () => number }>) | undefined;
  /** Leadership's bounds in milliseconds, for tests; the substrate's values (`timeouts.json`) when absent. */
  delays?:
    | Partial<
        Readonly<{
          heartbeatInterval: number;
          heartbeatTimeout: number;
          recoveryDelay: number;
          claimBound: number;
          queuedWriteBound: number;
        }>
      >
    | undefined;
}>;

const logName = 'events.jsonl';

/**
 * Chat logs for one project in a browser worker. A read never creates the chat, takes a lock or keeps a handle
 * (RH-R1); a write opens only under the chat's Web Lock, which M2 holds while the chat needs a writer (EQ4).
 *
 * @param options - The project, this worker, and where the logs live.
 * @returns The opaque store `createAgentLauncher` takes.
 * @public
 *
 * @example <caption>One launcher per project in the resident worker</caption>
 * ```typescript
 * import { createBrowserChatStore } from '@taucad/agent-host/browser';
 * import type { ProviderEventLogOptions } from '@taucad/agent-host/browser';
 *
 * declare const fileSystem: ProviderEventLogOptions['fileSystem'];
 * const chats = createBrowserChatStore({
 *   projectId: 'project-1',
 *   tabId: 'tab-1',
 *   build: '1.0.0',
 *   log: { kind: 'provider', fileSystem },
 * });
 * ```
 */
export const createBrowserChatStore = (options: BrowserChatStoreOptions): ChatStore => {
  const { log } = options;
  const logPath = (chatId: string): string => `.tau/chats/${requireChatPathSegment(chatId)}/${logName}`;

  /** A file under the OPFS project directory, by its root-relative path; `undefined` when it is not there. */
  const opfsFile = async (
    directory: FileSystemDirectoryHandle,
    path: string,
    create: boolean,
  ): Promise<FileSystemFileHandle | undefined> => {
    const segments = path.split('/');
    const name = segments.pop()!;
    try {
      let parent = directory;
      for (const segment of segments) {
        // oxlint-disable-next-line no-await-in-loop -- each directory opens inside the one before it.
        parent = await parent.getDirectoryHandle(segment, { create });
      }
      return await parent.getFileHandle(name, { create });
    } catch (error) {
      if (!create && (error as { readonly name?: unknown }).name === 'NotFoundError') {
        return undefined;
      }
      throw error;
    }
  };

  if (log.kind === 'opfs') {
    const { directory } = log;
    const bytesOf = async (path: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
      const file = await opfsFile(directory, path, false);
      if (file === undefined) {
        return undefined;
      }
      const blob = await file.getFile();
      return new Uint8Array(await blob.arrayBuffer());
    };
    return createChatStore({
      platform: 'browser',
      observeBytes:
        options.observeLog === undefined
          ? undefined
          : async (chatId, input) => options.observeLog!({ ...input, path: logPath(chatId) }),
      durability: 'exclusive-append',
      attachments: { read: async (chatId, path) => bytesOf(chatAttachmentPath(chatId, path)) },
      readBytes: async (chatId) => (await bytesOf(logPath(chatId))) ?? new Uint8Array(),
      openWriter: async (chatId) =>
        createOpfsEventLog({ fileHandle: (await opfsFile(directory, logPath(chatId), true))!, access: 'write' }),
      /* OPFS's exclusive handle cannot be stolen from a frozen holder (RH-R12). */
      leadership: leadershipOf(options, false),
    });
  }

  const { fileSystem } = log;
  return createChatStore({
    platform: 'browser',
    observeBytes:
      options.observeLog === undefined
        ? undefined
        : async (chatId, input) => options.observeLog!({ ...input, path: logPath(chatId) }),
    durability: log.durability ?? 'stream-append',
    attachments: createProviderAttachmentReader(fileSystem),
    readBytes: async (chatId) => {
      const filePath = logPath(chatId);
      return (await fileSystem.exists(filePath)) ? fileSystem.readFile(filePath) : new Uint8Array();
    },
    openWriter: async (chatId) => {
      const filePath = logPath(chatId);
      /* This open runs under the chat's Web Lock (M2), so a surviving marker is a dead or stolen holder's; the
       * per-append fence refuses that holder's appends whatever the marker says (EQ2, RH-R12). */
      await fileSystem.unlink(`${filePath}.lock`).catch(() => undefined);
      return createProviderEventLog({
        fileSystem,
        filePath,
        access: 'write',
        lockName: `tau-log-append:${options.projectId}/${requireChatPathSegment(chatId)}`,
      });
    },
    /* The provider leg fences each append, so a steal from a silent holder can serve (RH-R12). */
    leadership: leadershipOf(options, true),
  });
};

const leadershipOf = (
  options: BrowserChatStoreOptions,
  canSteal: boolean,
): ReturnType<typeof createBrowserLeadership> =>
  createBrowserLeadership({
    projectId: options.projectId,
    sender: options.tabId,
    build: options.build,
    canSteal,
    visibility: options.visibility,
    clock: options.clock,
    delays: options.delays,
  });
