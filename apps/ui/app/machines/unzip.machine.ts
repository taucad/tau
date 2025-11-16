import { assign, assertEvent, setup, fromPromise, emit } from 'xstate';
import type { AnyActorRef } from 'xstate';
import JSZip from 'jszip';

/**
 * Unzip Machine Context
 */
export type UnzipContext = {
  parentRef: AnyActorRef | undefined;
  zipBlob: Blob | undefined;
  files: Map<string, { filename: string; content: Uint8Array }>;
  error: Error | undefined;
  totalBytes: number;
  processedBytes: number;
};

/**
 * Unzip Machine Input
 */
type UnzipInput = {
  parentRef?: AnyActorRef;
};

/**
 * Unzip Machine Events
 */
type UnzipEventInternal =
  | {
      type: 'extract';
      zipBlob: Blob;
    }
  | {
      type: 'updateProgress';
      processedBytes: number;
      totalBytes: number;
    }
  | { type: 'reset' };

/**
 * Unzip Machine Emitted Events
 */
type UnzipEmitted =
  | {
      type: 'progress';
      processedBytes: number;
      totalBytes: number;
    }
  | {
      type: 'complete';
      files: Map<string, { filename: string; content: Uint8Array }>;
    }
  | {
      type: 'error';
      error: Error;
    };

type UnzipEvent = UnzipEventInternal;

// Define the actors that the machine can invoke
const extractZipActor = fromPromise<
  Map<string, { filename: string; content: Uint8Array }>,
  { zipBlob: Blob; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const zip = await JSZip.loadAsync(input.zipBlob);
  const files = new Map<string, { filename: string; content: Uint8Array }>();

  // Get all file entries (excluding directories)
  const fileEntries = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const totalFiles = fileEntries.length;
  let processedFiles = 0;

  // Process each file sequentially for progress tracking
  for (const [path, file] of fileEntries) {
    // Remove the first path segment (usually the repo name)
    const normalizedPath = path.split('/').slice(1).join('/');

    if (normalizedPath) {
      // eslint-disable-next-line no-await-in-loop -- processing files sequentially for progress tracking
      const content = await file.async('uint8array');
      files.set(normalizedPath, {
        filename: normalizedPath,
        content,
      });
    }

    processedFiles++;
    input.onProgress(processedFiles, totalFiles);
  }

  return files;
});

const unzipActors = {
  extractZipActor,
} as const;

/**
 * Unzip Machine
 *
 * Manages extracting files from ZIP archives.
 *
 * States:
 * - idle: Waiting for a zip blob to extract
 * - extracting: Extracting files from the ZIP
 * - ready: Files are extracted and ready to use
 * - error: An error occurred during extraction
 */
export const unzipMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as UnzipContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as UnzipEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as UnzipInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as UnzipEmitted,
  },
  actors: unzipActors,
  guards: {
    hasZipBlob({ context }) {
      return context.zipBlob !== undefined;
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
    setZipBlob: assign({
      zipBlob({ event }) {
        assertEvent(event, 'extract');
        return event.zipBlob;
      },
    }),
    setFiles: assign({
      files({ event }) {
        if ('output' in event && event.output instanceof Map) {
          return event.output;
        }

        return new Map();
      },
    }),
    setProgress: assign({
      processedBytes({ event }) {
        assertEvent(event, 'updateProgress');
        return event.processedBytes;
      },
      totalBytes({ event }) {
        assertEvent(event, 'updateProgress');
        return event.totalBytes;
      },
    }),
    reset: assign({
      zipBlob: undefined,
      files: new Map(),
      error: undefined,
      totalBytes: 0,
      processedBytes: 0,
    }),
    emitProgress: emit(({ context }) => ({
      type: 'progress' as const,
      processedBytes: context.processedBytes,
      totalBytes: context.totalBytes,
    })),
    emitComplete: emit(({ context }) => ({
      type: 'complete' as const,
      files: context.files,
    })),
    emitError: emit(({ context }) => ({
      type: 'error' as const,
      error: context.error ?? new Error('Unknown error'),
    })),
  },
}).createMachine({
  id: 'unzip',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    zipBlob: undefined,
    files: new Map(),
    error: undefined,
    totalBytes: 0,
    processedBytes: 0,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        extract: {
          target: 'extracting',
          actions: 'setZipBlob',
        },
        reset: {
          actions: 'reset',
        },
      },
    },
    extracting: {
      entry: 'clearError',
      invoke: {
        src: 'extractZipActor',
        input: ({ context, self }) => ({
          zipBlob: context.zipBlob!,
          onProgress(processed: number, total: number) {
            self.send({
              type: 'updateProgress',
              processedBytes: processed,
              totalBytes: total,
            });
          },
        }),
        onDone: {
          target: 'ready',
          actions: ['setFiles', 'emitComplete'],
        },
        onError: {
          target: 'error',
          actions: ['setError', 'emitError'],
        },
      },
      on: {
        updateProgress: {
          actions: ['setProgress', 'emitProgress'],
        },
      },
    },
    ready: {
      on: {
        extract: {
          target: 'extracting',
          actions: 'setZipBlob',
        },
        reset: {
          target: 'idle',
          actions: 'reset',
        },
      },
    },
    error: {
      on: {
        extract: {
          target: 'extracting',
          actions: 'setZipBlob',
        },
        reset: {
          target: 'idle',
          actions: 'reset',
        },
      },
    },
  },
});

export type UnzipMachineActor = typeof unzipMachine;
