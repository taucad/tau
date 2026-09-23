import { assertEvent, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject } from 'xstate';
import JSZip from 'jszip';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { FileMap } from '#utils/file-reader.utils.js';
import {
  readFromFileList,
  readFromDataTransfer,
  readFromDirectoryHandle,
  normalizeFilePaths,
  getImportName,
  isExcludedImportPath,
} from '#utils/file-reader.utils.js';
import { findMainFile } from '#routes/import.$/import.utils.js';

/**
 * What {@link isExcludedImportPath} leaves behind, dropped at the one place
 * every read actor's result enters the machine — so the repository a zip
 * carried reaches neither the main-file picker, nor `filesReady`, nor
 * `createProject`.
 */
const withoutExcludedImportPaths = (files: FileMap): FileMap =>
  new Map([...files].filter(([path]) => !isExcludedImportPath(path)));

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

type ImportDiskEnqueue = EnqueueObject<ImportDiskEvent, ImportDiskEmitted>;

const reset = {
  files: new Map(),
  importName: 'Uploaded Files',
  selectedMainFile: undefined,
  error: undefined,
  progress: { processed: 0, total: 0 },
  projectId: undefined,
} satisfies Partial<ImportDiskContext>;

/* A failure is remembered and said once. */
const fail = (error: unknown, enq: ImportDiskEnqueue) => {
  const known = error instanceof Error ? error : new Error('Unknown error');
  enq.emit({ type: 'error', error: known });
  return { target: 'error', context: { error: known } };
};

/* The handlers every reading state shares: the files land, and progress is reported as it moves. */
const readingHandlers = {
  filesRead: (
    { event }: Readonly<{ event: Extract<ImportDiskEvent, { type: 'filesRead' }> }>,
    enq: ImportDiskEnqueue,
  ) => {
    const files = withoutExcludedImportPaths(event.files);
    enq.emit({ type: 'filesReady', files, importName: event.importName });
    return { context: { files, importName: event.importName, selectedMainFile: findMainFile([...files.keys()]) } };
  },
  updateProgress: (
    { event }: Readonly<{ event: Extract<ImportDiskEvent, { type: 'updateProgress' }> }>,
    enq: ImportDiskEnqueue,
  ) => {
    enq.emit({ type: 'progress', processed: event.processed, total: event.total });
    return { context: { progress: { processed: event.processed, total: event.total } } };
  },
};

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
  schemas: {
    context: types<ImportDiskContext>(),
    events: eventSchemas<ImportDiskEvent>(),
    input: types<ImportDiskInput>(),
    emitted: eventSchemas<ImportDiskEmitted>(),
  },
  actors: importDiskActors,
  guards: {
    hasSelectedMainFile: (context: ImportDiskContext) =>
      context.selectedMainFile !== undefined && context.selectedMainFile.length > 0,
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
        externalError: ({ event }, enq) => fail(event.error, enq),
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
          context: reset,
        },
      },
    },
    reading: {
      entry: () => ({ context: { error: undefined } }),
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
        onError: ({ event }, enq) => fail(event.error, enq),
      },
      on: readingHandlers,
    },
    readingDataTransfer: {
      entry: () => ({ context: { error: undefined } }),
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
        onError: ({ event }, enq) => fail(event.error, enq),
      },
      on: readingHandlers,
    },
    readingDirectoryHandle: {
      entry: () => ({ context: { error: undefined } }),
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
        onError: ({ event }, enq) => fail(event.error, enq),
      },
      on: readingHandlers,
    },
    extracting: {
      entry: () => ({ context: { error: undefined } }),
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
        onError: ({ event }, enq) => fail(event.error, enq),
      },
      on: readingHandlers,
    },
    selectingMainFile: {
      on: {
        selectMainFile: {
          context: ({ event }) => ({ selectedMainFile: event.file }),
        },
        confirmImport: ({ context, guards }) =>
          guards.hasSelectedMainFile(context) ? { target: 'creating' } : undefined,
        reset: {
          target: 'idle',
          context: reset,
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
        onError: ({ event }, enq) => fail(event.error, enq),
      },
      on: {
        projectCreated: {
          context: ({ event }) => ({ projectId: event.projectId }),
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
          context: { error: undefined },
        },
        reset: {
          target: 'idle',
          context: reset,
        },
      },
    },
  },
});

export type ImportDiskMachineActor = typeof importDiskMachine;
