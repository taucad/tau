import { setup, types } from 'xstate';
import type { AnyActorRef } from 'xstate';
import JSZip from 'jszip';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';

/**
 * Zip Machine Context
 */
export type ZipContext = {
  parentRef: AnyActorRef | undefined;
  files: Map<string, { content: Uint8Array<ArrayBuffer>; filename: string }>;
  zipBlob: Blob | undefined;
  error: Error | undefined;
  zipFilename: string;
};

/**
 * Zip Machine Input
 */
type ZipInput = {
  parentRef?: AnyActorRef;
  zipFilename?: string;
};

/**
 * Zip Machine Events
 */
type ZipEventInternal =
  | {
      type: 'addFile';
      filename: string;
      content: Uint8Array<ArrayBuffer>;
    }
  | {
      type: 'addFiles';
      files: Array<{ filename: string; content: Uint8Array<ArrayBuffer> }>;
    }
  | { type: 'generate' }
  | { type: 'clear' }
  | { type: 'reset' };

type ZipEventEmitted = { type: 'zipGenerated'; blob: Blob };

type ZipEvent = ZipEventInternal | ZipEventEmitted;

const generateZipActor = fromSafeAsync<
  ZipEventEmitted,
  { files: Map<string, { content: Uint8Array<ArrayBuffer>; filename: string }> }
>(async ({ input }) => {
  const zip = new JSZip();

  for (const [, file] of input.files) {
    zip.file(file.filename, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { type: 'zipGenerated', blob };
});

const zipActors = {
  generateZipActor,
} as const;

type ZipFiles = ZipContext['files'];

const withFile = (files: ZipFiles, filename: string, content: Uint8Array<ArrayBuffer>): ZipFiles => {
  const updated = new Map(files);
  updated.set(filename, { content, filename });
  return updated;
};

const withFiles = (
  files: ZipFiles,
  added: ReadonlyArray<{ filename: string; content: Uint8Array<ArrayBuffer> }>,
): ZipFiles => {
  const updated = new Map(files);
  for (const file of added) {
    updated.set(file.filename, { content: file.content, filename: file.filename });
  }
  return updated;
};

const reset = { files: new Map(), zipBlob: undefined, error: undefined } satisfies Partial<ZipContext>;

/**
 * Zip Machine
 *
 * Manages creating ZIP archives from multiple files.
 *
 * States:
 * - idle: Waiting for files to be added
 * - generating: Creating the ZIP file
 * - ready: ZIP file is ready for download
 * - error: An error occurred during generation
 */
export const zipMachine = setup({
  schemas: {
    context: types<ZipContext>(),
    events: eventSchemas<ZipEvent>(),
    input: types<ZipInput>(),
  },
  actors: zipActors,
  guards: {
    hasFiles: (context: ZipContext) => context.files.size > 0,
  },
}).createMachine({
  id: 'zip',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    files: new Map(),
    zipBlob: undefined,
    error: undefined,
    zipFilename: input.zipFilename ?? 'archive.zip',
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        addFile: {
          context: ({ context, event }) => ({ files: withFile(context.files, event.filename, event.content) }),
        },
        addFiles: {
          context: ({ context, event }) => ({ files: withFiles(context.files, event.files) }),
        },
        generate: ({ context, guards }) => (guards.hasFiles(context) ? { target: 'generating' } : undefined),
        clear: {
          context: { files: new Map() },
        },
        reset: {
          context: reset,
        },
      },
    },
    generating: {
      entry: () => ({ context: { error: undefined } }),
      invoke: {
        src: 'generateZipActor',
        input: ({ context }) => ({
          files: context.files,
        }),
        onDone: {
          target: 'ready',
        },
        onError: {
          target: 'error',
          context: ({ event }) => ({
            error: event.error instanceof Error ? event.error : new Error('Unknown error'),
          }),
        },
      },
      on: {
        zipGenerated: {
          context: ({ event }) => ({ zipBlob: event.blob }),
        },
      },
    },
    ready: {
      on: {
        addFile: {
          target: 'idle',
          context: ({ context, event }) => ({
            zipBlob: undefined,
            files: withFile(context.files, event.filename, event.content),
          }),
        },
        addFiles: {
          target: 'idle',
          context: ({ context, event }) => ({ zipBlob: undefined, files: withFiles(context.files, event.files) }),
        },
        clear: {
          target: 'idle',
          context: { files: new Map(), zipBlob: undefined },
        },
        reset: {
          target: 'idle',
          context: reset,
        },
        generate: {
          target: 'generating',
        },
      },
    },
    error: {
      on: {
        generate: ({ context, guards }) => (guards.hasFiles(context) ? { target: 'generating' } : undefined),
        clear: {
          target: 'idle',
          context: { files: new Map(), error: undefined },
        },
        reset: {
          target: 'idle',
          context: reset,
        },
      },
    },
  },
});
