import { assign, assertEvent, setup, fromPromise, enqueueActions, emit } from 'xstate';
import type { OutputFrom, DoneActorEvent } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import FileManagerWorker from '#machines/file-manager.worker.js?worker';
import type { FileWorker } from '#machines/file-manager.worker.js';
import { assertActorDoneEvent } from '#lib/xstate.js';

type FileEntry = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  isLoaded: boolean;
};

type FileManagerContext = {
  worker: Worker | undefined;
  wrappedWorker: Remote<FileWorker> | undefined;
  fileTree: Map<string, FileEntry>;
  error: Error | undefined;
  lastWrittenPath: string | undefined;
  openFiles: Map<string, Uint8Array>;
  lastOpenedPath: string | undefined;
  lastRenamedOldPath: string | undefined;
  lastRenamedNewPath: string | undefined;
  lastDeletedPath: string | undefined;
  rootDirectory: string;
  shouldInitializeOnStart: boolean;
};

async function ensureDirectoryExists(worker: Remote<FileWorker>, targetPath: string): Promise<void> {
  const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const segments = normalizedPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const segment of segments) {
    currentPath += `/${segment}`;
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential mkdir to build the tree
      await worker.mkdir(currentPath);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('EEXIST')) {
        throw error instanceof Error ? error : new Error(errorMessage);
      }
    }
  }
}

const initializeWorkerActor = fromPromise<
  { type: 'workerInitialized' } | { type: 'workerInitializationFailed'; error: Error },
  { context: FileManagerContext }
>(async ({ input }) => {
  const { context } = input;

  // Clean up any existing worker
  if (context.worker) {
    context.worker.terminate();
  }

  try {
    const worker = new FileManagerWorker({ name: `fm-${context.rootDirectory}` });
    const wrappedWorker = wrap<FileWorker>(worker);

    // Store references
    context.worker = worker;
    context.wrappedWorker = wrappedWorker;

    // Create root directory
    try {
      await ensureDirectoryExists(wrappedWorker, context.rootDirectory);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }

    return { type: 'workerInitialized' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize worker';
    return {
      type: 'workerInitializationFailed',
      error: new Error(errorMessage),
    };
  }
});

const readDirectoryActor = fromPromise<
  { type: 'directoryRead'; entries: FileEntry[] } | { type: 'directoryReadFailed'; error: Error },
  { context: FileManagerContext; path: string }
>(async ({ input }) => {
  const { context, path } = input;

  if (!context.wrappedWorker) {
    return {
      type: 'directoryReadFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Path is relative, prepend rootDirectory to make absolute
    const absolutePath = path === '' ? context.rootDirectory : `${context.rootDirectory}/${path}`;
    const fileStats = await context.wrappedWorker.getDirectoryStat(absolutePath);
    const entries: FileEntry[] = [];

    for (const fileStat of fileStats) {
      // FileStat.path is relative to the directory we scanned
      const relativeFilePath = path === '' ? fileStat.path : `${path}/${fileStat.path}`;

      entries.push({
        path: relativeFilePath, // Store relative path from root in file tree
        name: fileStat.name,
        type: fileStat.type,
        size: fileStat.size,
        isLoaded: false,
      });
    }

    return { type: 'directoryRead', entries };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to read directory';
    return {
      type: 'directoryReadFailed',
      error: new Error(errorMessage),
    };
  }
});

const writeFileActor = fromPromise<
  { type: 'fileWritten'; path: string } | { type: 'fileWriteFailed'; error: Error },
  { context: FileManagerContext; path: string; data: Uint8Array }
>(async ({ input }) => {
  const { context, path, data } = input;

  if (!context.wrappedWorker) {
    return {
      type: 'fileWriteFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Prepend rootDirectory to make absolute path
    const absolutePath = `${context.rootDirectory}/${path}`;
    await context.wrappedWorker.writeFile(absolutePath, data);
    return { type: 'fileWritten', path };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to write file';
    return {
      type: 'fileWriteFailed',
      error: new Error(errorMessage),
    };
  }
});

const writeFilesActor = fromPromise<
  { type: 'filesWritten'; paths: string[] } | { type: 'filesWriteFailed'; error: Error },
  { context: FileManagerContext; files: Record<string, { content: Uint8Array }> }
>(async ({ input }) => {
  const { context, files } = input;

  if (!context.wrappedWorker) {
    return {
      type: 'filesWriteFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Prepend rootDirectory to make absolute paths
    const absoluteFiles: Record<string, { content: Uint8Array }> = {};
    const paths = Object.keys(files);

    for (const path of paths) {
      const absolutePath = `${context.rootDirectory}/${path}`;
      const fileData = files[path];
      if (fileData) {
        absoluteFiles[absolutePath] = fileData;
      }
    }

    await context.wrappedWorker.writeFiles(absoluteFiles);
    return { type: 'filesWritten', paths };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to write files';
    return {
      type: 'filesWriteFailed',
      error: new Error(errorMessage),
    };
  }
});

const readFileActor = fromPromise<
  { type: 'fileRead'; data: Uint8Array } | { type: 'fileReadFailed'; error: Error },
  { context: FileManagerContext; path: string }
>(async ({ input }) => {
  const { context, path } = input;

  if (!context.wrappedWorker) {
    return {
      type: 'fileReadFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Prepend rootDirectory to make absolute path
    const absolutePath = `${context.rootDirectory}/${path}`;
    const data = await context.wrappedWorker.readFile(absolutePath);
    return { type: 'fileRead', data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to read file';
    return {
      type: 'fileReadFailed',
      error: new Error(errorMessage),
    };
  }
});

const renameFileActor = fromPromise<
  { type: 'fileRenamed'; oldPath: string; newPath: string } | { type: 'fileRenameFailed'; error: Error },
  { context: FileManagerContext; oldPath: string; newPath: string }
>(async ({ input }) => {
  const { context, oldPath, newPath } = input;
  const worker = context.wrappedWorker;

  if (!worker) {
    return {
      type: 'fileRenameFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Prepend rootDirectory to make absolute paths
    const absoluteOldPath = `${context.rootDirectory}/${oldPath}`;
    const absoluteNewPath = `${context.rootDirectory}/${newPath}`;
    await worker.rename(absoluteOldPath, absoluteNewPath);
    return { type: 'fileRenamed', oldPath, newPath };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to rename file';
    return {
      type: 'fileRenameFailed',
      error: new Error(errorMessage),
    };
  }
});

const deleteFileActor = fromPromise<
  { type: 'fileDeleted'; path: string } | { type: 'fileDeleteFailed'; error: Error },
  { context: FileManagerContext; path: string }
>(async ({ input }) => {
  const { context, path } = input;
  const worker = context.wrappedWorker;

  if (!worker) {
    return {
      type: 'fileDeleteFailed',
      error: new Error('Worker not initialized'),
    };
  }

  try {
    // Prepend rootDirectory to make absolute path
    const absolutePath = `${context.rootDirectory}/${path}`;
    await worker.unlink(absolutePath);
    return { type: 'fileDeleted', path };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
    return {
      type: 'fileDeleteFailed',
      error: new Error(errorMessage),
    };
  }
});

const fileManagerActors = {
  initializeWorkerActor,
  readDirectoryActor,
  writeFileActor,
  writeFilesActor,
  readFileActor,
  renameFileActor,
  deleteFileActor,
} as const;
type FileManagerActorNames = keyof typeof fileManagerActors;

type FileManagerEventInternal =
  | { type: 'initialize' }
  | { type: 'setRoot'; path: string }
  | { type: 'loadDirectory'; path: string }
  | { type: 'writeFile'; path: string; data: Uint8Array }
  | { type: 'writeFiles'; files: Record<string, { content: Uint8Array }> }
  | { type: 'readFile'; path: string }
  | { type: 'renameFile'; oldPath: string; newPath: string }
  | { type: 'deleteFile'; path: string };

type FileManagerEventExternal = OutputFrom<(typeof fileManagerActors)[FileManagerActorNames]>;
type FileManagerEventExternalDone = DoneActorEvent<FileManagerEventExternal, FileManagerActorNames>;

type FileManagerEvent = FileManagerEventExternalDone | FileManagerEventInternal;

type FileManagerInput = {
  rootDirectory: string;
  shouldInitializeOnStart?: boolean;
};

type FileManagerEmitted =
  | { type: 'fileWritten'; path: string }
  | { type: 'fileRead'; path: string; data: Uint8Array }
  | { type: 'fileRenamed'; oldPath: string; newPath: string }
  | { type: 'fileDeleted'; path: string };

/**
 * File Manager Machine
 *
 * This machine manages the file-manager WebWorker and filesystem operations:
 * - Initializes the worker and creates a configurable root directory
 * - Reads directory contents lazily on demand
 * - Maintains a file tree in context
 */
export const fileManagerMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as FileManagerContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as FileManagerEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as FileManagerInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as FileManagerEmitted,
  },
  actors: fileManagerActors,
  actions: {
    setError: assign({
      error({ event }) {
        console.log('setting error', event);
        assertActorDoneEvent(event);

        if (event.output.type === 'workerInitializationFailed') {
          return event.output.error;
        }

        return undefined;
      },
    }),

    clearError: assign({
      error: undefined,
    }),

    updateFileTree: assign({
      fileTree({ context, event }) {
        assertActorDoneEvent(event);

        if (event.output.type === 'directoryRead') {
          const newTree = new Map(context.fileTree);

          for (const entry of event.output.entries) {
            newTree.set(entry.path, entry);
          }

          return newTree;
        }

        return context.fileTree;
      },
    }),

    setDirectoryLoaded: assign({
      fileTree({ context, event }) {
        assertEvent(event, 'loadDirectory');
        const newTree = new Map(context.fileTree);
        const entry = newTree.get(event.path);

        if (entry && entry.type === 'dir') {
          newTree.set(event.path, { ...entry, isLoaded: true });
        }

        return newTree;
      },
    }),

    setLastWrittenPath: assign({
      lastWrittenPath({ event }) {
        assertActorDoneEvent(event);

        if (event.output.type === 'fileWritten') {
          return event.output.path;
        }

        return undefined;
      },
    }),

    addOpenFile: assign({
      openFiles({ context, event }) {
        assertActorDoneEvent(event);

        if (event.output.type === 'fileRead') {
          const newMap = new Map(context.openFiles);
          const path = context.lastOpenedPath;

          if (path) {
            newMap.set(path, event.output.data);
          }

          return newMap;
        }

        return context.openFiles;
      },
      lastOpenedPath({ context }) {
        return context.lastOpenedPath;
      },
    }),

    setLastOpenedPath: assign({
      lastOpenedPath({ event }) {
        assertEvent(event, 'readFile');
        return event.path;
      },
    }),

    updateRootAndReset: assign({
      rootDirectory({ event }) {
        assertEvent(event, 'setRoot');
        return event.path;
      },
      fileTree: () => new Map(),
      openFiles: () => new Map(),
      lastWrittenPath: undefined,
      lastOpenedPath: undefined,
      error: undefined,
    }),

    destroyWorker({ context }) {
      if (context.worker) {
        context.worker.terminate();
        context.worker = undefined;
        context.wrappedWorker = undefined;
      }
    },

    emitFileWritten: emit(({ context }) => ({
      type: 'fileWritten' as const,
      path: context.lastWrittenPath ?? '',
    })),

    emitFileRead: emit(({ context, event }) => {
      assertActorDoneEvent(event);
      if (event.output.type === 'fileRead') {
        return {
          type: 'fileRead' as const,
          path: context.lastOpenedPath ?? '',
          data: event.output.data,
        };
      }

      return {
        type: 'fileRead' as const,
        path: '',
        data: new Uint8Array(),
      };
    }),

    setLastRenamedPaths: assign({
      lastRenamedOldPath({ event }) {
        assertEvent(event, 'renameFile');
        return event.oldPath;
      },
      lastRenamedNewPath({ event }) {
        assertEvent(event, 'renameFile');
        return event.newPath;
      },
    }),

    setLastDeletedPath: assign({
      lastDeletedPath({ event }) {
        assertEvent(event, 'deleteFile');
        return event.path;
      },
    }),

    emitFileRenamed: emit(({ context }) => ({
      type: 'fileRenamed' as const,
      oldPath: context.lastRenamedOldPath ?? '',
      newPath: context.lastRenamedNewPath ?? '',
    })),

    emitFileDeleted: emit(({ context }) => ({
      type: 'fileDeleted' as const,
      path: context.lastDeletedPath ?? '',
    })),
  },
  guards: {
    isWorkerInitializationFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'workerInitializationFailed';
    },

    isDirectoryReadFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'directoryReadFailed';
    },

    isFileWriteFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'fileWriteFailed';
    },

    isFilesWriteFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'filesWriteFailed';
    },

    isFileReadFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'fileReadFailed';
    },

    isFileRenameFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'fileRenameFailed';
    },

    isFileDeleteFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'fileDeleteFailed';
    },
  },
}).createMachine({
  id: 'fileManager',
  entry: enqueueActions(({ enqueue, context, self }) => {
    if (context.shouldInitializeOnStart) {
      enqueue.sendTo(self, { type: 'initialize' });
    }
  }),
  context: ({ input }) => ({
    worker: undefined,
    wrappedWorker: undefined,
    fileTree: new Map(),
    error: undefined,
    lastWrittenPath: undefined,
    openFiles: new Map(),
    lastOpenedPath: undefined,
    lastRenamedOldPath: undefined,
    lastRenamedNewPath: undefined,
    lastDeletedPath: undefined,
    rootDirectory: input.rootDirectory,
    shouldInitializeOnStart: input.shouldInitializeOnStart ?? true,
  }),
  initial: 'initializing',
  exit: ['destroyWorker'],
  states: {
    initializing: {
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },

    creatingWorker: {
      entry: ['clearError'],
      invoke: {
        id: 'initializeWorkerActor',
        src: 'initializeWorkerActor',
        input({ context }) {
          return { context };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isWorkerInitializationFailed',
            actions: ['setError'],
          },
          {
            target: 'loadingRootDirectory',
          },
        ],
      },
    },

    loadingRootDirectory: {
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context }) {
          // Pass empty string for root directory (will be converted to absolute internally)
          return { context, path: '' };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree'],
          },
        ],
      },
    },

    ready: {
      on: {
        setRoot: {
          target: 'creatingWorker',
          actions: ['destroyWorker', 'updateRootAndReset'],
        },
        loadDirectory: {
          target: 'loadingDirectory',
        },
        writeFile: {
          target: 'writingFile',
        },
        writeFiles: {
          target: 'writingFiles',
        },
        readFile: {
          target: 'readingFile',
        },
        renameFile: {
          target: 'renamingFile',
        },
        deleteFile: {
          target: 'deletingFile',
        },
      },
    },

    writingFile: {
      entry: ['clearError'],
      invoke: {
        id: 'writeFileActor',
        src: 'writeFileActor',
        input({ context, event }) {
          assertEvent(event, 'writeFile');
          return { context, path: event.path, data: event.data };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isFileWriteFailed',
            actions: ['setError'],
          },
          {
            target: 'reloadingAfterWrite',
            actions: ['setLastWrittenPath'],
          },
        ],
      },
    },

    reloadingAfterWrite: {
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context }) {
          // LastWrittenPath is relative, extract parent directory
          let parentPath = '';
          if (context.lastWrittenPath) {
            const lastSlashIndex = context.lastWrittenPath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              parentPath = context.lastWrittenPath.slice(0, lastSlashIndex);
            }
            // If lastSlashIndex is 0 or -1, parentPath remains '' (root)
          }

          return { context, path: parentPath };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree', 'emitFileWritten'],
          },
        ],
      },
    },

    writingFiles: {
      entry: ['clearError'],
      invoke: {
        id: 'writeFilesActor',
        src: 'writeFilesActor',
        input({ context, event }) {
          assertEvent(event, 'writeFiles');
          return { context, files: event.files };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isFilesWriteFailed',
            actions: ['setError'],
          },
          {
            target: 'reloadingAfterWriteFiles',
          },
        ],
      },
    },

    reloadingAfterWriteFiles: {
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context }) {
          // Reload root directory since files could be in multiple directories
          return { context, path: '' };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree'],
          },
        ],
      },
    },

    readingFile: {
      entry: ['clearError', 'setLastOpenedPath'],
      invoke: {
        id: 'readFileActor',
        src: 'readFileActor',
        input({ context, event }) {
          assertEvent(event, 'readFile');
          return { context, path: event.path };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isFileReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['addOpenFile', 'emitFileRead'],
          },
        ],
      },
    },

    loadingDirectory: {
      entry: ['clearError'],
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context, event }) {
          assertEvent(event, 'loadDirectory');
          return { context, path: event.path };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree', 'setDirectoryLoaded'],
          },
        ],
      },
    },

    renamingFile: {
      entry: ['clearError', 'setLastRenamedPaths'],
      invoke: {
        id: 'renameFileActor',
        src: 'renameFileActor',
        input({ context, event }) {
          assertEvent(event, 'renameFile');
          return { context, oldPath: event.oldPath, newPath: event.newPath };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isFileRenameFailed',
            actions: ['setError'],
          },
          {
            target: 'reloadingAfterRename',
          },
        ],
      },
    },

    reloadingAfterRename: {
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context }) {
          // Extract parent directory from old path (files stay in same dir when renamed)
          let parentPath = '';
          if (context.lastRenamedOldPath) {
            const lastSlashIndex = context.lastRenamedOldPath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              parentPath = context.lastRenamedOldPath.slice(0, lastSlashIndex);
            }
          }

          return { context, path: parentPath };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree', 'emitFileRenamed'],
          },
        ],
      },
    },

    deletingFile: {
      entry: ['clearError', 'setLastDeletedPath'],
      invoke: {
        id: 'deleteFileActor',
        src: 'deleteFileActor',
        input({ context, event }) {
          assertEvent(event, 'deleteFile');
          return { context, path: event.path };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isFileDeleteFailed',
            actions: ['setError'],
          },
          {
            target: 'reloadingAfterDelete',
          },
        ],
      },
    },

    reloadingAfterDelete: {
      invoke: {
        id: 'readDirectoryActor',
        src: 'readDirectoryActor',
        input({ context }) {
          // Extract parent directory from deleted path
          let parentPath = '';
          if (context.lastDeletedPath) {
            const lastSlashIndex = context.lastDeletedPath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              parentPath = context.lastDeletedPath.slice(0, lastSlashIndex);
            }
          }

          return { context, path: parentPath };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isDirectoryReadFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
            actions: ['updateFileTree', 'emitFileDeleted'],
          },
        ],
      },
    },

    error: {
      on: {
        setRoot: {
          target: 'creatingWorker',
          actions: ['destroyWorker', 'updateRootAndReset'],
        },
        initialize: {
          target: 'creatingWorker',
        },
        loadDirectory: {
          target: 'loadingDirectory',
        },
      },
    },
  },
});

export type FileManagerMachine = typeof fileManagerMachine;
export type { FileManagerEmitted };
