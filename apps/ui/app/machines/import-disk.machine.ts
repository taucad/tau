import { assign, assertEvent, setup, emit } from 'xstate';
import type { AnyActorRef } from 'xstate';
import JSZip from 'jszip';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { FileMap } from '#utils/file-reader.utils.js';
import {
  readFromFileList,
  readFromDataTransfer,
  readFromDirectoryHandle,
  normalizeFilePaths,
  getImportName,
} from '#utils/file-reader.utils.js';
import { findMainFile } from '#routes/import.$/import.utils.js';

/**
 * Import Disk Machine Context
 */
export type ImportDiskContext = {
  parentRef: AnyActorRef | undefined;
  files: FileMap;
  importName: string;
  selectedMainFile: string | undefined;
  error: Error | undefined;
  progress: { processed: number; total: number };
  projectId: string | undefined;
};

/**
 * Import Disk Machine Input
 */
type ImportDiskInput = {
  parentRef?: AnyActorRef;
};

/**
 * Import Disk Machine Events
 */
type ImportDiskEventInternal =
  | { type: 'processFiles'; files: FileList | File[] }
  | { type: 'processDataTransfer'; items: DataTransferItemList }
  | { type: 'processDirectoryHandle'; handle: FileSystemDirectoryHandle }
  | { type: 'processZip'; file: File }
  | { type: 'updateProgress'; processed: number; total: number }
  | { type: 'selectMainFile'; file: string }
  | { type: 'confirmImport' }
  | { type: 'retry' }
  | { type: 'reset' }
  | { type: 'externalError'; error: Error };

/**
 * Import Disk Machine Emitted Events
 */
type ImportDiskEmitted =
  | { type: 'progress'; processed: number; total: number }
  | { type: 'filesReady'; files: FileMap; importName: string }
  | { type: 'error'; error: Error };

// Actor output types
type FilesReadResult = { type: 'filesRead'; files: FileMap; importName: string };
type ProjectCreatedResult = { type: 'projectCreated'; projectId: string };

/**
 * Read files actor - reads files from FileList
 */
const readFilesActor = fromSafeAsync<
  FilesReadResult,
  { files: FileList | File[]; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const files = await readFromFileList(input.files, input.onProgress);
  const importName = getImportName(files);

  return { type: 'filesRead', files, importName };
});

/**
 * Read data transfer actor - reads files from DataTransferItemList (drag-drop)
 */
const readDataTransferActor = fromSafeAsync<
  FilesReadResult,
  { items: DataTransferItemList; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const files = await readFromDataTransfer(input.items, input.onProgress);
  const importName = getImportName(files);

  return { type: 'filesRead', files, importName };
});

/**
 * Extract ZIP actor - extracts files from a ZIP blob with smart path normalization
 */
const extractZipActor = fromSafeAsync<
  FilesReadResult,
  { file: File; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const zip = await JSZip.loadAsync(input.file);
  const files: FileMap = new Map();

  const fileEntries = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const totalFiles = fileEntries.length;
  let processedFiles = 0;

  for (const [path, file] of fileEntries) {
    // oxlint-disable-next-line no-await-in-loop -- processing files sequentially for progress tracking
    const content = (await file.async('uint8array')) as Uint8Array<ArrayBuffer>;
    files.set(path, {
      filename: path,
      content,
    });

    processedFiles++;
    input.onProgress(processedFiles, totalFiles);
  }

  const normalizedFiles = normalizeFilePaths(files);
  const importName = getImportName(normalizedFiles, input.file.name);

  return { type: 'filesRead', files: normalizedFiles, importName };
});

/**
 * Read directory handle actor - recursively reads files from a FileSystemDirectoryHandle.
 * Used for the File System Access API import flow.
 */
const readDirectoryHandleActor = fromSafeAsync<
  FilesReadResult,
  { handle: FileSystemDirectoryHandle; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const files = await readFromDirectoryHandle(input.handle, input.onProgress);
  const normalizedFiles = normalizeFilePaths(files);
  const importName = getImportName(normalizedFiles, input.handle.name);

  return { type: 'filesRead', files: normalizedFiles, importName };
});

/**
 * Create project actor - placeholder that should be provided by the route
 */
const createProjectActor = fromSafeAsync<
  ProjectCreatedResult,
  { importName: string; mainFile: string; files: FileMap }
>(async () => {
  throw new Error('createProjectActor must be provided by the route');
});

const importDiskActors = {
  readFilesActor,
  readDataTransferActor,
  readDirectoryHandleActor,
  extractZipActor,
  createProjectActor,
} as const;

type ImportDiskEvent = ImportDiskEventInternal | FilesReadResult | ProjectCreatedResult;

/**
 * Import Disk Machine
 *
 * Manages importing files from disk (files, folders, or ZIP archives).
 *
 * States:
 * - idle: Waiting for files to process
 * - reading: Reading files from File API
 * - extracting: Extracting files from ZIP archive
 * - selectingMainFile: User selects the main file
 * - creating: Creating the project
 * - success: Import completed successfully
 * - error: An error occurred during import
 */
export const importDiskMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ImportDiskContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ImportDiskEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ImportDiskInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ImportDiskEmitted,
  },
  actors: importDiskActors,
  guards: {
    hasSelectedMainFile({ context }) {
      return context.selectedMainFile !== undefined && context.selectedMainFile.length > 0;
    },
    hasFiles({ context }) {
      return context.files.size > 0;
    },
  },
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
    setProgress: assign({
      progress({ event }) {
        assertEvent(event, 'updateProgress');

        return { processed: event.processed, total: event.total };
      },
    }),
    setFilesFromResult: assign({
      files({ event }) {
        assertEvent(event, 'filesRead');
        return event.files;
      },
      importName({ event }) {
        assertEvent(event, 'filesRead');
        return event.importName;
      },
    }),
    initializeSelectedMainFile: assign({
      selectedMainFile({ context }) {
        const fileNames = [...context.files.keys()];
        return findMainFile(fileNames);
      },
    }),
    setSelectedMainFile: assign({
      selectedMainFile({ event }) {
        assertEvent(event, 'selectMainFile');

        return event.file;
      },
    }),
    setProjectId: assign({
      projectId({ event }) {
        assertEvent(event, 'projectCreated');
        return event.projectId;
      },
    }),
    reset: assign({
      files: new Map(),
      importName: 'Uploaded Files',
      selectedMainFile: undefined,
      error: undefined,
      progress: { processed: 0, total: 0 },
      projectId: undefined,
    }),
    emitProgress: emit(({ context }) => ({
      type: 'progress',
      processed: context.progress.processed,
      total: context.progress.total,
    })),
    emitFilesReady: emit(({ context }) => ({
      type: 'filesReady',
      files: context.files,
      importName: context.importName,
    })),
    emitError: emit(({ context }) => ({
      type: 'error',
      error: context.error ?? new Error('Unknown error'),
    })),
  },
}).createMachine({
  id: 'importDisk',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    files: new Map(),
    importName: 'Uploaded Files',
    selectedMainFile: undefined,
    error: undefined,
    progress: { processed: 0, total: 0 },
    projectId: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        externalError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
        processFiles: {
          target: 'reading',
        },
        processDataTransfer: {
          target: 'readingDataTransfer',
        },
        processDirectoryHandle: {
          target: 'readingDirectoryHandle',
        },
        processZip: {
          target: 'extracting',
        },
        reset: {
          actions: 'reset',
        },
      },
    },
    reading: {
      entry: 'clearError',
      invoke: {
        src: 'readFilesActor',
        input({ event, self }) {
          assertEvent(event, 'processFiles');

          return {
            files: event.files,
            onProgress(processed: number, total: number) {
              self.send({ type: 'updateProgress', processed, total });
            },
          };
        },
        onDone: {
          target: 'selectingMainFile',
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        filesRead: {
          actions: ['setFilesFromResult', 'initializeSelectedMainFile', 'emitFilesReady'],
        },
        updateProgress: {
          actions: ['setProgress', 'emitProgress'],
        },
      },
    },
    readingDataTransfer: {
      entry: 'clearError',
      invoke: {
        src: 'readDataTransferActor',
        input({ event, self }) {
          assertEvent(event, 'processDataTransfer');

          return {
            items: event.items,
            onProgress(processed: number, total: number) {
              self.send({ type: 'updateProgress', processed, total });
            },
          };
        },
        onDone: {
          target: 'selectingMainFile',
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        filesRead: {
          actions: ['setFilesFromResult', 'initializeSelectedMainFile', 'emitFilesReady'],
        },
        updateProgress: {
          actions: ['setProgress', 'emitProgress'],
        },
      },
    },
    readingDirectoryHandle: {
      entry: 'clearError',
      invoke: {
        src: 'readDirectoryHandleActor',
        input({ event, self }) {
          assertEvent(event, 'processDirectoryHandle');

          return {
            handle: event.handle,
            onProgress(processed: number, total: number) {
              self.send({ type: 'updateProgress', processed, total });
            },
          };
        },
        onDone: {
          target: 'selectingMainFile',
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        filesRead: {
          actions: ['setFilesFromResult', 'initializeSelectedMainFile', 'emitFilesReady'],
        },
        updateProgress: {
          actions: ['setProgress', 'emitProgress'],
        },
      },
    },
    extracting: {
      entry: 'clearError',
      invoke: {
        src: 'extractZipActor',
        input({ event, self }) {
          assertEvent(event, 'processZip');

          return {
            file: event.file,
            onProgress(processed: number, total: number) {
              self.send({ type: 'updateProgress', processed, total });
            },
          };
        },
        onDone: {
          target: 'selectingMainFile',
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        filesRead: {
          actions: ['setFilesFromResult', 'initializeSelectedMainFile', 'emitFilesReady'],
        },
        updateProgress: {
          actions: ['setProgress', 'emitProgress'],
        },
      },
    },
    selectingMainFile: {
      on: {
        selectMainFile: {
          actions: 'setSelectedMainFile',
        },
        confirmImport: {
          target: 'creating',
          guard: 'hasSelectedMainFile',
        },
        reset: {
          target: 'idle',
          actions: 'reset',
        },
      },
    },
    creating: {
      invoke: {
        src: 'createProjectActor',
        input: ({ context }) => ({
          importName: context.importName,
          mainFile: context.selectedMainFile!,
          files: context.files,
        }),
        onDone: {
          target: 'success',
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        projectCreated: {
          actions: 'setProjectId',
        },
      },
    },
    success: {
      type: 'final',
    },
    error: {
      on: {
        retry: {
          target: 'idle',
          actions: 'clearError',
        },
        reset: {
          target: 'idle',
          actions: 'reset',
        },
      },
    },
  },
});

export type ImportDiskMachineActor = typeof importDiskMachine;
