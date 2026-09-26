import { setup, types } from 'xstate';
import type { AnyActorRef } from 'xstate';
import JSZip from 'jszip';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';

/**
 * Unzip Machine Context
 */
export type UnzipContext = {
  parentRef: AnyActorRef | undefined;
  zipBlob: Blob | undefined;
  files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
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
      files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
    }
  | {
      type: 'error';
      error: Error;
    };

type ZipExtractedEvent = {
  type: 'zipExtracted';
  files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
};

type UnzipEvent = UnzipEventInternal | ZipExtractedEvent;

const extractZipActor = fromSafeAsync<
  ZipExtractedEvent,
  { zipBlob: Blob; onProgress: (processed: number, total: number) => void }
>(async ({ input }) => {
  const zip = await JSZip.loadAsync(input.zipBlob);
  const files = new Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>();

  const fileEntries = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const totalFiles = fileEntries.length;
  let processedFiles = 0;

  for (const [path, file] of fileEntries) {
    const normalizedPath = path.split('/').slice(1).join('/');

    if (normalizedPath) {
      // oxlint-disable-next-line no-await-in-loop -- processing files sequentially for progress tracking
      const content = await file.async('uint8array');
      files.set(normalizedPath, {
        filename: normalizedPath,
        content: content as Uint8Array<ArrayBuffer>,
      });
    }

    processedFiles++;
    input.onProgress(processedFiles, totalFiles);
  }

  return { type: 'zipExtracted', files };
});

const unzipActors = {
  extractZipActor,
} as const;

const reset = {
  zipBlob: undefined,
  files: new Map(),
  error: undefined,
  totalBytes: 0,
  processedBytes: 0,
} satisfies Partial<UnzipContext>;

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
  schemas: {
    context: types<UnzipContext>(),
    events: eventSchemas<UnzipEvent>(),
    input: types<UnzipInput>(),
    emitted: eventSchemas<UnzipEmitted>(),
  },
  actors: unzipActors,
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
          context: ({ event }) => ({ zipBlob: event.zipBlob }),
        },
        reset: {
          context: reset,
        },
      },
    },
    extracting: {
      entry: () => ({ context: { error: undefined } }),
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
        },
        onError: ({ event }, enq) => {
          const error = event.error instanceof Error ? event.error : new Error('Unknown error');
          enq.emit({ type: 'error', error });
          return { target: 'error', context: { error } };
        },
      },
      on: {
        zipExtracted: ({ event }, enq) => {
          enq.emit({ type: 'complete', files: event.files });
          return { context: { files: event.files } };
        },
        updateProgress: ({ event }, enq) => {
          enq.emit({ type: 'progress', processedBytes: event.processedBytes, totalBytes: event.totalBytes });
          return { context: { processedBytes: event.processedBytes, totalBytes: event.totalBytes } };
        },
      },
    },
    ready: {
      on: {
        extract: {
          target: 'extracting',
          context: ({ event }) => ({ zipBlob: event.zipBlob }),
        },
        reset: {
          target: 'idle',
          context: reset,
        },
      },
    },
    error: {
      on: {
        extract: {
          target: 'extracting',
          context: ({ event }) => ({ zipBlob: event.zipBlob }),
        },
        reset: {
          target: 'idle',
          context: reset,
        },
      },
    },
  },
});

export type UnzipMachineActor = typeof unzipMachine;
