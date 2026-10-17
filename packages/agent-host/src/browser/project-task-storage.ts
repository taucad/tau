import type { BrowserChatStoreOptions } from '#browser.js';
import type { ProjectTaskStorage } from '#launchers/project-task-platform.js';

const taskJournalPath = '.tau/chats/.project-tasks/records.jsonl';

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

const storageError = (code: string, message: string, cause?: unknown): Error =>
  Object.assign(new Error(message, { cause }), { code });

const opfsJournalFile = async (root: FileSystemDirectoryHandle): Promise<FileSystemFileHandle> => {
  let directory = root;
  for (const segment of ['.tau', 'chats', '.project-tasks']) {
    // oxlint-disable-next-line no-await-in-loop -- each directory is a child of the preceding one.
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  return directory.getFileHandle('records.jsonl', { create: true });
};

const readAll = (handle: SyncAccessHandle): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(handle.getSize());
  let offset = 0;
  while (offset < bytes.byteLength) {
    const read = handle.read(bytes.subarray(offset), { at: offset });
    if (read <= 0) {
      throw storageError('STORAGE_SHORT_READ', `The task journal stopped at byte ${offset}.`);
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
      throw storageError('STORAGE_SHORT_WRITE', `The task journal stopped after writing ${offset} bytes.`);
    }
    offset += written;
  }
  handle.flush();
};

/** Open the protected journal under the already acquired project Web Lock. @internal */
export const openBrowserProjectTaskStorage = async (
  projectId: string,
  log: BrowserChatStoreOptions['log'],
): Promise<ProjectTaskStorage> => {
  if (log.kind === 'opfs') {
    if (location.origin === 'null') {
      throw storageError('STORAGE_NOT_WRITABLE', 'OPFS task records require a secure or localhost origin.');
    }
    const file = (await opfsJournalFile(log.directory)) as SyncAccessCapableFileHandle;
    if (typeof file.createSyncAccessHandle !== 'function') {
      throw storageError('STORAGE_NOT_WRITABLE', 'The task journal requires a dedicated worker with sync access.');
    }
    let handle: SyncAccessHandle;
    try {
      handle = await file.createSyncAccessHandle();
    } catch (error) {
      throw storageError('WRITER_LOCKED', 'Another worker still holds the OPFS task journal.', error);
    }
    let closed = false;
    const requireOpen = (): SyncAccessHandle => {
      if (closed) {
        throw storageError('TASK_CLOSED', 'The task journal is closed.');
      }
      return handle;
    };
    return {
      read: async () => readAll(requireOpen()),
      append: async (bytes) => {
        appendAll(requireOpen(), bytes);
      },
      truncate: async (size) => {
        requireOpen().truncate(size);
        requireOpen().flush();
      },
      size: async () => requireOpen().getSize(),
      exclusive: async (section) => section(),
      close: async () => {
        if (!closed) {
          closed = true;
          handle.close();
        }
      },
    };
  }

  const { fileSystem } = log;
  if (!fileSystem.appendFile) {
    throw storageError('STORAGE_NOT_WRITABLE', 'The selected project provider cannot append task records.');
  }
  const appendFile = fileSystem.appendFile.bind(fileSystem);
  const read = async (): Promise<Uint8Array<ArrayBuffer>> =>
    (await fileSystem.exists(taskJournalPath)) ? fileSystem.readFile(taskJournalPath) : new Uint8Array();
  let closed = false;
  const requireOpen = (): void => {
    if (closed) {
      throw storageError('TASK_CLOSED', 'The task journal is closed.');
    }
  };
  return {
    read: async () => {
      requireOpen();
      return read();
    },
    append: async (bytes) => {
      requireOpen();
      await appendFile(taskJournalPath, bytes);
    },
    truncate: async (size) => {
      requireOpen();
      const bytes = await read();
      if (bytes.byteLength < size) {
        throw storageError('STORAGE_SHORT_READ', 'The task journal shrank before rollback.');
      }
      await fileSystem.writeFile(taskJournalPath, bytes.slice(0, size));
    },
    size: async () => {
      requireOpen();
      if (fileSystem.stat) {
        try {
          const stat = await fileSystem.stat(taskJournalPath, { content: 'head' });
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
      const bytes = await read();
      return bytes.byteLength;
    },
    exclusive: async (section) => {
      requireOpen();
      return navigator.locks.request(
        `agent-host-task-append:${encodeURIComponent(projectId)}`,
        { mode: 'exclusive' },
        section,
      );
    },
    close: async () => {
      closed = true;
    },
  };
};
