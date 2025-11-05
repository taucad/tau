/* eslint-disable no-await-in-loop -- TODO: address */
import { assign, assertEvent, setup, fromPromise, emit, enqueueActions } from 'xstate';
import type { OutputFrom, DoneActorEvent } from 'xstate';
import git from 'isomorphic-git';
import { lightningFs } from '#db/storage.js';
import { assertActorDoneEvent } from '#lib/xstate.js';

/**
 * Get the directory path for a build in the virtual filesystem
 */
export function getBuildDirectory(buildId: string): string {
  return `/builds/${buildId}`;
}

/**
 * File System Item
 *
 * Represents a file or directory in the virtual filesystem
 */
export type FileSystemItem = {
  path: string;
  content: string;
  isDirectory: boolean;
  status?: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked';
};

/**
 * Filesystem Machine Context
 */
export type FilesystemContext = {
  buildId: string | undefined;
  files: Map<string, FileSystemItem>;
  dirtyFiles: Set<string>;
  error: Error | undefined;
  isInitialized: boolean;
};

/**
 * Filesystem Machine Input
 */
type FilesystemInput = {
  buildId?: string;
};

// Define the actors that the machine can invoke
const initializeFilesystemActor = fromPromise<string, { buildId: string }>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  // Ensure /builds directory exists
  try {
    await lightningFs.promises.mkdir('/builds');
  } catch {
    // Directory might already exist, ignore
  }

  // Create the directory for this specific build
  const buildDir = getBuildDirectory(input.buildId);
  try {
    await lightningFs.promises.mkdir(buildDir);
  } catch {
    // Directory might already exist, ignore
  }

  return input.buildId;
});

const writeFileActor = fromPromise<
  { path: string; content: string },
  { buildId: string; path: string; content: string }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const buildDir = getBuildDirectory(input.buildId);

  // Ensure directory exists
  const directory = input.path.split('/').slice(0, -1).join('/');
  if (directory) {
    // Create directory path recursively
    const parts = directory.split('/');
    let currentPath = buildDir;

    for (const part of parts) {
      currentPath += `/${part}`;
      try {
        await fs.promises.mkdir(currentPath);
      } catch {
        // Directory might already exist, ignore
      }
    }
  }

  // Write file
  await fs.promises.writeFile(`${buildDir}/${input.path}`, input.content, 'utf8');
  return { path: input.path, content: input.content };
});

const deleteFileActor = fromPromise<string, { buildId: string; path: string }>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const buildDir = getBuildDirectory(input.buildId);
  await fs.promises.unlink(`${buildDir}/${input.path}`);
  return input.path;
});

const refreshGitStatusActor = fromPromise<
  Map<string, 'clean' | 'modified' | 'added' | 'deleted' | 'untracked'>,
  { buildId: string; files: Map<string, FileSystemItem> }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);
  const statusMap = new Map<string, 'clean' | 'modified' | 'added' | 'deleted' | 'untracked'>();

  try {
    // Check if git is initialized in this directory
    const gitDir = `${dir}/.git`;
    try {
      await fs.promises.stat(gitDir);
    } catch {
      // Git not initialized, all files are untracked
      for (const [path] of input.files) {
        statusMap.set(path, 'untracked');
      }

      return statusMap;
    }

    // Get status for each file using isomorphic-git
    for (const [path] of input.files) {
      try {
        const status = await git.status({
          fs,
          dir,
          filepath: path,
        });

        // Map git status to our status enum
        switch (status) {
          case 'unmodified': {
            statusMap.set(path, 'clean');

            break;
          }

          case 'modified': {
            statusMap.set(path, 'modified');

            break;
          }

          case '*added': {
            statusMap.set(path, 'added');

            break;
          }

          case '*deleted': {
            statusMap.set(path, 'deleted');

            break;
          }

          default: {
            statusMap.set(path, 'untracked');
          }
        }
      } catch {
        // File might not be tracked yet
        statusMap.set(path, 'untracked');
      }
    }
  } catch {
    // If there's any error, treat all files as untracked
    for (const [path] of input.files) {
      statusMap.set(path, 'untracked');
    }
  }

  return statusMap;
});

const loadFilesActor = fromPromise<
  Map<string, FileSystemItem>,
  { buildId: string; files: Record<string, { content: string }> }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const filesMap = new Map<string, FileSystemItem>();

  // Ensure /builds directory exists
  try {
    await fs.promises.mkdir('/builds');
  } catch {
    // Directory might already exist, ignore
  }

  // Ensure the specific build directory exists
  const buildDir = getBuildDirectory(input.buildId);
  try {
    await fs.promises.mkdir(buildDir);
  } catch {
    // Directory might already exist, ignore
  }

  // Write all files to LightningFS
  for (const [path, fileData] of Object.entries(input.files)) {
    const directory = path.split('/').slice(0, -1).join('/');
    if (directory) {
      // Create directory path recursively
      const parts = directory.split('/');
      let currentPath = buildDir;

      for (const part of parts) {
        currentPath += `/${part}`;
        try {
          await fs.promises.mkdir(currentPath);
        } catch {
          // Directory might already exist
        }
      }
    }

    await fs.promises.writeFile(`${buildDir}/${path}`, fileData.content, 'utf8');

    filesMap.set(path, {
      path,
      content: fileData.content,
      isDirectory: false,
      status: 'clean',
    });
  }

  return filesMap;
});

const filesystemActors = {
  initializeFilesystemActor,
  writeFileActor,
  deleteFileActor,
  refreshGitStatusActor,
  loadFilesActor,
} as const;

type FilesystemActorNames = keyof typeof filesystemActors;

/**
 * Filesystem Machine Events
 */
type FilesystemEventInternal =
  | { type: 'initializeFilesystem'; buildId: string }
  | { type: 'setFiles'; buildId: string; files: Record<string, { content: string }> }
  | { type: 'createFile'; path: string; content: string }
  | { type: 'updateFile'; path: string; content: string }
  | { type: 'deleteFile'; path: string }
  | { type: 'refreshStatus' }
  | { type: 'clearFilesystem' };

export type FilesystemEventExternal = OutputFrom<(typeof filesystemActors)[FilesystemActorNames]>;
type FilesystemEventExternalDone = DoneActorEvent<FilesystemEventExternal, FilesystemActorNames>;

type FilesystemEvent = FilesystemEventExternalDone | FilesystemEventInternal;

/**
 * Filesystem Machine Emitted Events
 */
type FilesystemEmitted =
  | { type: 'filesystemInitialized'; buildId: string }
  | { type: 'fileCreated'; path: string; content: string }
  | { type: 'fileUpdated'; path: string; content: string }
  | { type: 'fileDeleted'; path: string }
  | { type: 'filesChanged'; files: Map<string, FileSystemItem> }
  | { type: 'statusRefreshed'; dirtyFiles: Set<string> }
  | { type: 'error'; error: Error };

/**
 * Filesystem Machine
 *
 * Manages the virtual filesystem for a build using LightningFS.
 * Each build gets its own isolated filesystem instance.
 *
 * States:
 * - uninitialized: No filesystem instance active
 * - initializing: Setting up LightningFS for a build
 * - ready: Filesystem is ready for operations
 * - error: An error occurred during filesystem operations
 */
export const filesystemMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as FilesystemContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as FilesystemEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as FilesystemEmitted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as FilesystemInput,
  },
  actors: filesystemActors,
  actions: {
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }

        return new Error('Unknown error');
      },
    }),
    clearError: assign({
      error: undefined,
    }),
    setBuildId: assign({
      buildId({ event }) {
        assertEvent(event, ['initializeFilesystem', 'setFiles']);
        return event.buildId;
      },
    }),
    markInitialized: assign({
      isInitialized: true,
    }),
    updateFilesFromLoad: assign({
      files({ event }) {
        assertActorDoneEvent(event);
        return event.output as Map<string, FileSystemItem>;
      },
    }),
    updateFileInContext: assign({
      files({ context, event }) {
        assertActorDoneEvent(event);
        const { path, content } = event.output as { path: string; content: string };
        const updatedFiles = new Map(context.files);
        updatedFiles.set(path, {
          path,
          content,
          isDirectory: false,
          status: 'modified',
        });
        return updatedFiles;
      },
      dirtyFiles({ context, event }) {
        assertActorDoneEvent(event);
        const { path } = event.output as { path: string; content: string };
        const updated = new Set(context.dirtyFiles);
        updated.add(path);
        return updated;
      },
    }),
    removeFileFromContext: assign({
      files({ context, event }) {
        assertActorDoneEvent(event);
        const path = event.output as string;
        const updatedFiles = new Map(context.files);
        updatedFiles.delete(path);
        return updatedFiles;
      },
      dirtyFiles({ context, event }) {
        assertActorDoneEvent(event);
        const path = event.output as string;
        const updated = new Set(context.dirtyFiles);
        updated.add(path);
        return updated;
      },
    }),
    updateFileStatus: assign({
      files({ context, event }) {
        assertActorDoneEvent(event);
        const statusMap = event.output as Map<string, 'clean' | 'modified' | 'added' | 'deleted' | 'untracked'>;
        const updatedFiles = new Map(context.files);

        for (const [path, status] of statusMap) {
          const file = updatedFiles.get(path);
          if (file) {
            updatedFiles.set(path, { ...file, status });
          }
        }

        return updatedFiles;
      },
      dirtyFiles({ event }) {
        assertActorDoneEvent(event);
        const statusMap = event.output as Map<string, 'clean' | 'modified' | 'added' | 'deleted' | 'untracked'>;
        const dirtySet = new Set<string>();

        for (const [path, status] of statusMap) {
          if (status !== 'clean') {
            dirtySet.add(path);
          }
        }

        return dirtySet;
      },
    }),
    clearFilesystem: assign({
      buildId: undefined,
      files: new Map(),
      dirtyFiles: new Set(),
      isInitialized: false,
    }),
  },
}).createMachine({
  id: 'filesystem',
  context: ({ input }) => ({
    buildId: input.buildId,
    files: new Map(),
    dirtyFiles: new Set(),
    error: undefined,
    isInitialized: false,
  }),
  initial: 'uninitialized',
  states: {
    uninitialized: {
      on: {
        initializeFilesystem: {
          target: 'initializing',
          actions: 'setBuildId',
        },
        setFiles: {
          target: 'loadingFiles',
          actions: 'setBuildId',
        },
      },
    },
    initializing: {
      entry: 'clearError',
      invoke: {
        src: 'initializeFilesystemActor',
        input: ({ context }) => ({ buildId: context.buildId! }),
        onDone: {
          target: 'ready',
          actions: [
            'markInitialized',
            emit(({ context }) => ({
              type: 'filesystemInitialized' as const,
              buildId: context.buildId!,
            })),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    loadingFiles: {
      entry: 'clearError',
      invoke: {
        src: 'loadFilesActor',
        input({ context, event }) {
          assertEvent(event, 'setFiles');
          return { buildId: context.buildId!, files: event.files };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'markInitialized',
            'updateFilesFromLoad',
            emit(({ context }) => ({
              type: 'filesChanged' as const,
              files: context.files,
            })),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    ready: {
      on: {
        createFile: 'creatingFile',
        updateFile: 'updatingFile',
        deleteFile: 'deletingFile',
        refreshStatus: 'refreshingStatus',
        setFiles: {
          target: 'loadingFiles',
          actions: 'setBuildId',
        },
        clearFilesystem: {
          target: 'uninitialized',
          actions: 'clearFilesystem',
        },
      },
    },
    creatingFile: {
      entry: 'clearError',
      invoke: {
        src: 'writeFileActor',
        input({ context, event }) {
          assertEvent(event, 'createFile');
          return { buildId: context.buildId!, path: event.path, content: event.content };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'updateFileInContext',
            enqueueActions(({ enqueue, event }) => {
              assertActorDoneEvent(event);
              const { path, content } = event.output;
              enqueue.emit({
                type: 'fileCreated' as const,
                path,
                content,
              });
              enqueue.emit({
                type: 'filesChanged' as const,
                files: new Map(), // Will be populated from context
              });
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    updatingFile: {
      entry: 'clearError',
      invoke: {
        src: 'writeFileActor',
        input({ context, event }) {
          assertEvent(event, 'updateFile');
          return { buildId: context.buildId!, path: event.path, content: event.content };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'updateFileInContext',
            enqueueActions(({ enqueue, event }) => {
              assertActorDoneEvent(event);
              const { path, content } = event.output;
              enqueue.emit({
                type: 'fileUpdated' as const,
                path,
                content,
              });
              enqueue.emit({
                type: 'filesChanged' as const,
                files: new Map(), // Will be populated from context
              });
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    deletingFile: {
      entry: 'clearError',
      invoke: {
        src: 'deleteFileActor',
        input({ context, event }) {
          assertEvent(event, 'deleteFile');
          return { buildId: context.buildId!, path: event.path };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'removeFileFromContext',
            enqueueActions(({ enqueue, event }) => {
              assertActorDoneEvent(event);
              const path = event.output;
              enqueue.emit({
                type: 'fileDeleted' as const,
                path,
              });
              enqueue.emit({
                type: 'filesChanged' as const,
                files: new Map(), // Will be populated from context
              });
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    refreshingStatus: {
      invoke: {
        src: 'refreshGitStatusActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
          files: context.files,
        }),
        onDone: {
          target: 'ready',
          actions: [
            'updateFileStatus',
            emit(({ context }) => ({
              type: 'statusRefreshed' as const,
              dirtyFiles: context.dirtyFiles,
            })),
          ],
        },
        onError: {
          // If status refresh fails, just go back to ready without updating status
          target: 'ready',
        },
      },
    },
    error: {
      on: {
        createFile: 'creatingFile',
        updateFile: 'updatingFile',
        deleteFile: 'deletingFile',
        refreshStatus: 'refreshingStatus',
        setFiles: {
          target: 'loadingFiles',
          actions: 'setBuildId',
        },
        clearFilesystem: {
          target: 'uninitialized',
          actions: 'clearFilesystem',
        },
      },
    },
  },
});
