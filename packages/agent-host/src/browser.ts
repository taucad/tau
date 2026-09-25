import { EventLogError } from '#log/event-log-error.js';
import { createEventLogAppender } from '#log/event-log-appender.js';
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';
import { parseEventLogBytes } from '#log/serialization.js';
import type { AgentLogEvent } from '#log/event-types.js';
import { chatAttachmentPath } from '#harness/session-record.js';
import type { AttachmentReader } from '#harness/session-record.js';

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
    // ponytail: size by reading the file; a provider `stat` would save the read when logs grow large.
    size: async () => {
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
