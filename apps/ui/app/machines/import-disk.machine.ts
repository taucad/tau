import { assertEvent, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { listDataTransfer, listFileList } from '#utils/file-reader.utils.js';
import type { ImportListing, ImportSourceDescriptor } from '#machines/import-staging.js';
import { findMainFile } from '#routes/import.$/import.utils.js';

/**
 * Plans one source in the file-manager worker: paths and sizes come back,
 * never bytes (charter D12). The route supplies it from its import session.
 */
export type ImportPlanner = (source: ImportSourceDescriptor) => Promise<ImportListing>;

const emptyListing: ImportListing = {
  name: 'Uploaded Files',
  files: [],
  bytes: 0,
  skipped: { excluded: 0, reserved: 0, symlinks: 0 },
};

/**
 * Import Disk Machine Context
 */
export type ImportDiskContext = {
  parentRef: AnyActorRef | undefined;
  plan: ImportPlanner;
  /** What the source holds once the policy and limits judged it: the review's paths and sizes. */
  listing: ImportListing;
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
  plan?: ImportPlanner;
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
  | { type: 'filesReady'; listing: ImportListing; importName: string }
  | { type: 'error'; error: Error };

// Actor output types
type FilesReadResult = { type: 'filesRead'; listing: ImportListing; importName: string };
type ProjectCreatedResult = { type: 'projectCreated'; projectId: string };

const planned = async (plan: ImportPlanner, source: ImportSourceDescriptor): Promise<FilesReadResult> => {
  const listing = await plan(source);
  return { type: 'filesRead', listing, importName: listing.name };
};

/** Picked files (or a folder pick): handed over by reference. */
const readFilesActor = fromSafeAsync<FilesReadResult, { files: FileList | File[]; plan: ImportPlanner }>(
  async ({ input }) => planned(input.plan, { kind: 'files', files: listFileList(input.files) }),
);

/** A drop: its items are taken while the event lasts, then handed over as handles or walked for references. */
const readDataTransferActor = fromSafeAsync<
  FilesReadResult,
  { source: Promise<ImportSourceDescriptor>; plan: ImportPlanner }
>(async ({ input }) => planned(input.plan, await input.source));

/** A zip: its central directory is read by range in the worker. */
const extractZipActor = fromSafeAsync<FilesReadResult, { file: File; plan: ImportPlanner }>(async ({ input }) =>
  planned(input.plan, { kind: 'zip', file: input.file }),
);

/** A picked folder: the handle crosses to the worker, which walks it. */
const readDirectoryHandleActor = fromSafeAsync<
  FilesReadResult,
  { handle: FileSystemDirectoryHandle; plan: ImportPlanner }
>(async ({ input }) => planned(input.plan, { kind: 'directory', handle: input.handle }));

/**
 * Create project actor - placeholder that should be provided by the route:
 * it stages the planned source and creates the project from the staging.
 */
const createProjectActor = fromSafeAsync<
  ProjectCreatedResult,
  {
    importName: string;
    mainFile: string;
    listing: ImportListing;
    onProgress: (processed: number, total: number) => void;
  }
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
  listing: emptyListing,
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
    const { listing } = event;
    enq.emit({ type: 'filesReady', listing, importName: event.importName });
    return {
      context: {
        listing,
        importName: event.importName,
        selectedMainFile: findMainFile(listing.files.map(({ path }) => path)),
      },
    };
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
 * Manages importing files from disk (files, folders, or ZIP archives). The
 * page hands every source to the file-manager worker by reference and gets
 * back paths and sizes; it never holds the files' bytes (charter D12).
 *
 * States:
 * - idle: Waiting for files to process
 * - reading / readingDataTransfer / readingDirectoryHandle: Planning picked files, a drop or a folder
 * - extracting: Planning a ZIP archive from its central directory
 * - selectingMainFile: User selects the main file
 * - creating: Staging the files and creating the project from the staging
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
    plan:
      input.plan ??
      (async () => {
        throw new Error('An import needs the file manager to plan its files.');
      }),
    listing: emptyListing,
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
        input({ event, context }) {
          assertEvent(event, 'processFiles');

          return { files: event.files, plan: context.plan };
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
        input({ event, context }) {
          assertEvent(event, 'processDataTransfer');

          /* Listed now, while the drop's items are still readable. */
          return { source: listDataTransfer(event.items), plan: context.plan };
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
        input({ event, context }) {
          assertEvent(event, 'processDirectoryHandle');

          return { handle: event.handle, plan: context.plan };
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
        input({ event, context }) {
          assertEvent(event, 'processZip');

          return { file: event.file, plan: context.plan };
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
        input: ({ context, self }) => ({
          importName: context.importName,
          mainFile: context.selectedMainFile!,
          listing: context.listing,
          onProgress(processed: number, total: number) {
            self.send({ type: 'updateProgress', processed, total });
          },
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
        updateProgress: readingHandlers.updateProgress,
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
