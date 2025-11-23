import { assign, assertEvent, setup, fromPromise, enqueueActions } from 'xstate';
import type { AnyActorRef, ActorRefFrom, OutputFrom, DoneActorEvent } from 'xstate';
import { unzipMachine } from '#machines/unzip.machine.js';
import type { UnzipMachineActor } from '#machines/unzip.machine.js';
import { assertActorDoneEvent } from '#lib/xstate.js';

/**
 * Import GitHub Machine Context
 */
export type ImportGitHubContext = {
  parentRef: AnyActorRef | undefined;
  owner: string;
  repo: string;
  ref: string;
  requestedMainFile: string;
  selectedMainFile: string | undefined;
  downloadProgress: { loaded: number; total: number };
  extractProgress: { processed: number; total: number };
  unzipRef: ActorRefFrom<UnzipMachineActor> | undefined;
  unzipSubscription: { unsubscribe: () => void } | undefined;
  files: Map<string, { filename: string; content: Uint8Array }>;
  buildId: string | undefined;
  error: Error | undefined;
};

/**
 * Import GitHub Machine Input
 */
type ImportGitHubInput = {
  parentRef?: AnyActorRef;
  owner: string;
  repo: string;
  ref: string;
  mainFile: string;
};

/**
 * Import GitHub Machine Events
 */
type ImportGitHubEventInternal =
  | { type: 'retry' }
  | {
      type: 'updateDownloadProgress';
      loaded: number;
      total: number;
    }
  | {
      type: 'updateExtractProgress';
      processed: number;
      total: number;
    }
  | {
      type: 'extractionComplete';
      files: Map<string, { filename: string; content: Uint8Array }>;
    }
  | {
      type: 'extractionError';
      error: Error;
    }
  | {
      type: 'selectMainFile';
      filename: string;
    }
  | { type: 'confirmImport' };

type ImportGitHubEvent = ImportGitHubEventExternalDone | ImportGitHubEventInternal;

// Actor output types
type DownloadResult = { type: 'downloaded'; blob: Blob };

// Download actor
const downloadZipActor = fromPromise<
  DownloadResult,
  { owner: string; repo: string; ref: string; onProgress: (loaded: number, total: number) => void }
>(async ({ input }) => {
  // Use proxy endpoint to avoid CORS issues
  const zipUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/zipball/${input.ref}`;
  const proxyUrl = `/api/import?url=${encodeURIComponent(zipUrl)}`;

  const response = await fetch(proxyUrl, {
    headers: {
      'User-Agent': 'TauCAD',
      accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub download failed: ${response.status} ${response.statusText}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  // eslint-disable-next-line no-await-in-loop -- reading stream sequentially
  for (let result = await reader.read(); !result.done; result = await reader.read()) {
    chunks.push(result.value);
    receivedLength += result.value.length;

    // Send progress update - throttling handled by state machine
    // Use -1 to indicate unknown total size (for indeterminate progress UI)
    const total = contentLength ?? -1;
    input.onProgress(receivedLength, total);
  }

  // Send final progress update
  const finalTotal = contentLength ?? receivedLength;
  input.onProgress(receivedLength, finalTotal);

  // Combine chunks into a single Uint8Array
  const zipData = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    zipData.set(chunk, position);
    position += chunk.length;
  }

  return { type: 'downloaded', blob: new Blob([zipData], { type: 'application/zip' }) };
});

// This actor should be provided via the `provide` mechanism in the route
const createBuildActor = fromPromise<
  { type: 'buildCreated'; buildId: string },
  {
    owner: string;
    repo: string;
    ref: string;
    mainFile: string;
    files: Map<string, { filename: string; content: Uint8Array }>;
  }
>(async () => {
  throw new Error('Not implemented');
});

const importGitHubActors = {
  downloadZipActor,
  createBuildActor,
} as const;

type ImportGitHubActorNames = keyof typeof importGitHubActors;

// Define the events that actors can emit
export type ImportGitHubEventExternal = OutputFrom<(typeof importGitHubActors)[ImportGitHubActorNames]>;
type ImportGitHubEventExternalDone = DoneActorEvent<ImportGitHubEventExternal, ImportGitHubActorNames>;

/**
 * Import GitHub Machine
 *
 * Manages importing a GitHub repository as a build.
 *
 * States:
 * - downloading: Downloading ZIP from GitHub with progress tracking
 * - extracting: Extracting files from ZIP with progress tracking
 * - selectingMainFile: User reviews files and selects main file
 * - creating: Creating the build with selected main file
 * - success: Import completed successfully
 * - error: An error occurred during import
 *
 * Progress Tracking:
 * - Download progress is tracked via contentLength header or receivedLength
 * - Extract progress is tracked via processed/total file counts
 * - Progress updates are applied immediately for responsive UI feedback
 */
export const importGitHubMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ImportGitHubContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ImportGitHubEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ImportGitHubInput,
  },
  actors: {
    ...importGitHubActors,
    unzipMachine,
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
    applyDownloadProgressImmediately: assign({
      downloadProgress({ event }) {
        assertEvent(event, 'updateDownloadProgress');
        return { loaded: event.loaded, total: event.total };
      },
    }),
    applyExtractProgressImmediately: assign({
      extractProgress({ event }) {
        assertEvent(event, 'updateExtractProgress');
        return { processed: event.processed, total: event.total };
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
    setBuildId: assign({
      buildId({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'buildCreated');
        return event.output.buildId;
      },
    }),
    initializeSelectedMainFile: assign({
      selectedMainFile({ context }) {
        // If main file was requested and exists, use it; otherwise undefined for user selection
        const fileNames = [...context.files.keys()];

        if (context.requestedMainFile.length > 0 && fileNames.includes(context.requestedMainFile)) {
          return context.requestedMainFile;
        }

        // Try to find a CAD file as suggestion
        const cadExtensions = ['.scad', '.jscad', '.ts', '.js'];
        const foundFile = fileNames.find((filename) => cadExtensions.some((ext) => filename.endsWith(ext)));

        return foundFile;
      },
    }),
    setSelectedMainFile: assign({
      selectedMainFile({ event }) {
        assertEvent(event, 'selectMainFile');
        return event.filename;
      },
    }),
    spawnUnzipMachine: assign({
      unzipRef({ spawn }) {
        return spawn('unzipMachine', { id: 'unzip', input: {} });
      },
    }),
    sendExtractToUnzip: enqueueActions(({ enqueue, context, event }) => {
      assertActorDoneEvent(event);
      assertEvent(event.output, 'downloaded');
      if (context.unzipRef) {
        enqueue.sendTo(context.unzipRef, { type: 'extract', zipBlob: event.output.blob });
      }
    }),
  },
  guards: {
    hasSelectedMainFile({ context }) {
      return context.selectedMainFile !== undefined && context.selectedMainFile.length > 0;
    },
  },
}).createMachine({
  id: 'importGitHub',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    owner: input.owner,
    repo: input.repo,
    ref: input.ref,
    requestedMainFile: input.mainFile,
    selectedMainFile: undefined,
    downloadProgress: { loaded: 0, total: 0 },
    extractProgress: { processed: 0, total: 0 },
    unzipRef: undefined,
    unzipSubscription: undefined,
    files: new Map(),
    buildId: undefined,
    error: undefined,
  }),
  initial: 'downloading',
  states: {
    downloading: {
      entry: ['clearError', 'spawnUnzipMachine'],
      invoke: {
        src: 'downloadZipActor',
        input: ({ context, self }) => ({
          owner: context.owner,
          repo: context.repo,
          ref: context.ref,
          onProgress(loaded: number, total: number) {
            self.send({ type: 'updateDownloadProgress', loaded, total });
          },
        }),
        onDone: {
          target: 'extracting',
          actions: 'sendExtractToUnzip',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
      on: {
        updateDownloadProgress: {
          actions: 'applyDownloadProgressImmediately',
        },
      },
    },
    extracting: {
      entry: assign({
        unzipSubscription({ context, self }) {
          // Subscribe to the spawned unzip machine's state changes and events
          if (!context.unzipRef) {
            return undefined;
          }

          // Subscribe to state changes
          const stateSubscription = context.unzipRef.subscribe((state) => {
            if (state.matches('ready')) {
              // Unzip completed successfully
              self.send({
                type: 'extractionComplete',
                files: state.context.files,
              });
            } else if (state.matches('error')) {
              // Unzip failed
              self.send({
                type: 'extractionError',
                error: state.context.error ?? new Error('Failed to extract ZIP'),
              });
            }
            // If state is 'extracting' or 'idle', we just wait for the next state change
          });

          // Subscribe to progress events
          const progressSubscription = context.unzipRef.on('progress', ({ processedBytes, totalBytes }) => {
            self.send({
              type: 'updateExtractProgress',
              processed: processedBytes,
              total: totalBytes,
            });
          });

          // Return combined cleanup
          return {
            unsubscribe() {
              stateSubscription.unsubscribe();
              progressSubscription.unsubscribe();
            },
          };
        },
      }),
      exit({ context }) {
        // Clean up subscription
        if (context.unzipSubscription) {
          context.unzipSubscription.unsubscribe();
        }
      },
      on: {
        updateExtractProgress: {
          actions: 'applyExtractProgressImmediately',
        },
        extractionComplete: {
          target: 'selectingMainFile',
          actions: [
            assign({
              files({ event }) {
                assertEvent(event, 'extractionComplete');
                return event.files;
              },
            }),
            'initializeSelectedMainFile',
          ],
        },
        extractionError: {
          target: 'error',
          actions: assign({
            error({ event }) {
              assertEvent(event, 'extractionError');
              return event.error;
            },
          }),
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
      },
    },
    creating: {
      invoke: {
        src: 'createBuildActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          ref: context.ref,
          mainFile: context.selectedMainFile!,
          files: context.files,
        }),
        onDone: {
          target: 'success',
          actions: 'setBuildId',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    success: {
      type: 'final',
    },
    error: {
      on: {
        retry: 'downloading',
      },
    },
  },
});

export type ImportGitHubMachineActor = typeof importGitHubMachine;
