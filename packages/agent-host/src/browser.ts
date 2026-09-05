// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { EventLogError } from '#log/event-log-error.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { createEventLogAppender } from '#log/event-log-appender.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { EventLogAppender, EventLogStorage } from '#log/event-log-appender.js';

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

/** Browser OPFS event-log options. @public */
export type OpfsEventLogOptions = {
  /** Exact OPFS file handle for `.tau/chats/<chatId>/events.jsonl`. */
  readonly fileHandle: FileSystemFileHandle;
};

/** Provider or bridge-proxy event-log options. @public */
export type ProviderEventLogOptions = {
  readonly filePath: string;
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

/**
 * Open an OPFS positional-append event log in a dedicated browser worker.
 *
 * Every JSONL line is written at `getSize()` and flushed before its append
 * resolves. OPFS is unavailable on null origins, so tests must use a real origin.
 *
 * @param options - Exact OPFS file handle owned by the elected worker leader.
 * @returns An initialized, leader-epoch-idempotent event-log appender.
 * @public
 */
export const createOpfsEventLog = async (options: OpfsEventLogOptions): Promise<EventLogAppender> => {
  if (location.origin === 'null') {
    throw new EventLogError(
      'STORAGE_NOT_WRITABLE',
      'OPFS is unavailable on a null origin. Run the dedicated worker from a real secure or localhost origin.',
    );
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
      'STORAGE_NOT_WRITABLE',
      'Could not acquire the exclusive OPFS sync access handle. Confirm this worker owns the active leader epoch.',
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
};

/**
 * Open an event log through Tau's abstract filesystem provider or bridge proxy.
 *
 * The provider owns parent creation and per-path append ordering. The adjacent
 * marker mirrors the Node adapter's advisory single-writer lock; browser host
 * leader epochs remain the authoritative fencing mechanism.
 *
 * @public
 */
export const createProviderEventLog = async (options: ProviderEventLogOptions): Promise<EventLogAppender> => {
  const { filePath, fileSystem } = options;
  const { appendFile } = fileSystem;
  if (!appendFile) {
    throw new EventLogError('STORAGE_NOT_WRITABLE', 'The selected filesystem provider cannot append event-log data.');
  }

  const lockPath = `${filePath}.lock`;
  if (await fileSystem.exists(lockPath)) {
    throw new EventLogError('WRITER_LOCKED', `Event log "${filePath}" already has an active provider writer.`);
  }
  await appendFile.call(fileSystem, lockPath, `${Date.now()}\n`);

  const releaseWriterLock = async (): Promise<void> => {
    await fileSystem.unlink(lockPath).catch(() => undefined);
  };
  const storage: EventLogStorage = {
    read: async () => ((await fileSystem.exists(filePath)) ? fileSystem.readFile(filePath) : new Uint8Array()),
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
    close: releaseWriterLock,
  };

  try {
    return await createEventLogAppender(storage);
  } catch (error) {
    await releaseWriterLock();
    throw error;
  }
};
