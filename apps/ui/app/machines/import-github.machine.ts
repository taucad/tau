import { assign, assertEvent, setup, fromPromise, enqueueActions } from 'xstate';
import type { AnyActorRef, ActorRefFrom, OutputFrom, DoneActorEvent } from 'xstate';
import { unzipMachine } from '#machines/unzip.machine.js';
import type { UnzipMachineActor } from '#machines/unzip.machine.js';
import { assertActorDoneEvent } from '#lib/xstate.js';
import { getGitHubClient } from '#lib/github-api.js';

/**
 * Import GitHub Machine Context
 */
export type ImportGitHubContext = {
  parentRef: AnyActorRef | undefined;
  repoUrl: string;
  owner: string;
  repo: string;
  ref: string;
  requestedMainFile: string;
  selectedMainFile: string | undefined;
  repoMetadata:
    | {
        avatarUrl: string | undefined;
        description: string | undefined;
        stars: number | undefined;
        forks: number | undefined;
        watchers: number | undefined;
        license: string | undefined;
        defaultBranch: string | undefined;
        isPrivate: boolean | undefined;
        lastUpdated: string | undefined;
      }
    | undefined;
  branches: Array<{ name: string; sha: string }>;
  selectedBranch: string;
  branchesPage: number;
  hasMoreBranches: boolean;
  isLoadingMoreBranches: boolean;
  downloadProgress: { loaded: number; total: number };
  extractProgress: { processed: number; total: number };
  unzipRef: ActorRefFrom<UnzipMachineActor> | undefined;
  unzipSubscription: { unsubscribe: () => void } | undefined;
  files: Map<string, { filename: string; content: Uint8Array }>;
  buildId: string | undefined;
  error: Error | undefined;
  fetchErrors: {
    metadata: Error | undefined;
    branches: Error | undefined;
  };
};

function toMetadataFetchError(error: unknown): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('404')) {
    return new Error('Repository not found. Please check the URL and try again.');
  }

  if (errorMessage.includes('403') || errorMessage.includes('rate limit')) {
    return new Error(
      'GitHub API rate limit exceeded. Please add a GITHUB_API_TOKEN to your environment or wait before trying again.',
    );
  }

  return new Error(`Failed to fetch repository metadata: ${errorMessage}`);
}

/**
 * Import GitHub Machine Input
 */
type ImportGitHubInput = {
  parentRef?: AnyActorRef;
  owner?: string;
  repo?: string;
  ref?: string;
  mainFile?: string;
};

/**
 * Import GitHub Machine Events
 */
type ImportGitHubEventInternal =
  | { type: 'retry' }
  | { type: 'updateRepoUrl'; url: string }
  | { type: 'selectBranch'; branch: string }
  | { type: 'startImport' }
  | { type: 'cancelDownload' }
  | { type: 'loadMoreBranches' }
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
type RepoMetadataResult = {
  type: 'metadataRetrieved';
  metadata: {
    avatarUrl: string | undefined;
    description: string | undefined;
    stars: number | undefined;
    forks: number | undefined;
    watchers: number | undefined;
    license: string | undefined;
    defaultBranch: string | undefined;
    isPrivate: boolean | undefined;
    lastUpdated: string | undefined;
  };
};
type BranchesResult = {
  type: 'branchesRetrieved';
  branches: Array<{ name: string; sha: string }>;
  hasMore: boolean;
};

// Get repository metadata actor
const getRepoMetadataActor = fromPromise<RepoMetadataResult, { owner: string; repo: string }>(async ({ input }) => {
  const client = getGitHubClient();
  const metadata = await client.getRepository(input.owner, input.repo);

  return {
    type: 'metadataRetrieved',
    metadata,
  };
});

// Get branches actor
const getBranchesActor = fromPromise<BranchesResult, { owner: string; repo: string; page: number }>(
  async ({ input }): Promise<BranchesResult> => {
    const client = getGitHubClient();
    const result = await client.listBranches(input.owner, input.repo, input.page);

    return {
      type: 'branchesRetrieved' as const,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- result.branches is correctly typed from GitHubApiClient
      branches: result.branches,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- result.hasMore is correctly typed from GitHubApiClient
      hasMore: result.hasMore,
    };
  },
);

// Download actor
const downloadZipActor = fromPromise<
  DownloadResult,
  {
    owner: string;
    repo: string;
    ref: string;
    onProgress: (loaded: number, total: number) => void;
  }
>(async ({ input, signal }) => {
  const client = getGitHubClient();

  // Download the archive and get size from the GET response headers
  // Pass the signal to abort the fetch request if canceled
  const { stream, size: contentLength } = await client.downloadArchiveWithSize(
    input.owner,
    input.repo,
    input.ref,
    signal,
  );

  // Use size from Content-Length header (available immediately when download starts)
  const totalBytes = contentLength ?? 0;

  // Send initial progress with total size
  input.onProgress(0, totalBytes);

  const reader = stream.getReader();

  const chunks: Uint8Array[] = [];
  let receivedLength = 0;
  let lastProgressUpdate = 0;
  const progressUpdateInterval = 100; // Update every 100ms

  try {
    // Read the stream in chunks
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- standard stream reading pattern
    while (true) {
      // Check if aborted before reading next chunk
      if (signal.aborted) {
        // eslint-disable-next-line no-await-in-loop -- need to cancel stream before throwing
        await reader.cancel();
        throw new Error('Download canceled');
      }

      // eslint-disable-next-line no-await-in-loop -- reading stream sequentially
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      receivedLength += value.length;

      // Throttle progress updates to avoid overwhelming the UI
      const now = Date.now();
      if (now - lastProgressUpdate >= progressUpdateInterval || lastProgressUpdate === 0) {
        input.onProgress(receivedLength, totalBytes);
        lastProgressUpdate = now;
      }
    }

    // Always send final progress update with actual total
    input.onProgress(receivedLength, totalBytes);

    // Combine chunks into a single Uint8Array
    const zipData = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      zipData.set(chunk, position);
      position += chunk.length;
    }

    return { type: 'downloaded', blob: new Blob([zipData], { type: 'application/zip' }) };
  } finally {
    // Always release the reader lock
    reader.releaseLock();
  }
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
  getRepoMetadataActor,
  getBranchesActor,
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
  delays: {
    debounceDelay: 500,
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
      fetchErrors: {
        metadata: undefined,
        branches: undefined,
      },
    }),
    updateRepoUrl: assign({
      repoUrl({ event }) {
        assertEvent(event, 'updateRepoUrl');
        return event.url;
      },
    }),
    parseRepoUrl: assign(({ context }) => {
      // Parse GitHub URL and extract owner/repo/ref
      try {
        const url = new URL(context.repoUrl);
        if (url.hostname !== 'github.com') {
          return {};
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) {
          return {};
        }

        const [owner, repoRaw] = pathParts;
        if (!owner || !repoRaw) {
          return {};
        }

        const repo = repoRaw.replace(/\.git$/, '');
        const ref = 'main'; // Default to main, could be extended later

        return { owner, repo, ref };
      } catch {
        return {};
      }
    }),
    setRepoMetadata: assign({
      repoMetadata({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'metadataRetrieved');
        return event.output.metadata;
      },
      selectedBranch({ event, context }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'metadataRetrieved');
        // Use default branch from metadata, or keep current selection
        return event.output.metadata.defaultBranch ?? context.selectedBranch;
      },
    }),
    setBranches: assign({
      branches({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'branchesRetrieved');
        return event.output.branches;
      },
      hasMoreBranches({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'branchesRetrieved');
        return event.output.hasMore;
      },
      branchesPage: 1,
    }),
    appendBranches: assign({
      branches({ event, context }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'branchesRetrieved');
        return [...context.branches, ...event.output.branches];
      },
      hasMoreBranches({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'branchesRetrieved');
        return event.output.hasMore;
      },
      branchesPage({ context }) {
        return context.branchesPage + 1;
      },
      isLoadingMoreBranches: false,
    }),
    setLoadingMoreBranches: assign({
      isLoadingMoreBranches: true,
    }),
    setSelectedBranch: assign({
      selectedBranch({ event }) {
        assertEvent(event, 'selectBranch');
        return event.branch;
      },
      ref({ event }) {
        assertEvent(event, 'selectBranch');
        return event.branch;
      },
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
    setMetadataError: assign({
      fetchErrors: ({ context, event }) => ({
        ...context.fetchErrors,
        metadata:
          'error' in event && event.error instanceof Error
            ? event.error
            : new Error('Failed to fetch repository metadata'),
      }),
    }),
    setBranchesError: assign({
      fetchErrors: ({ context, event }) => ({
        ...context.fetchErrors,
        branches:
          'error' in event && event.error instanceof Error ? event.error : new Error('Failed to fetch branches'),
      }),
    }),
  },
  guards: {
    hasValidRepo({ context }) {
      return context.owner.length > 0 && context.repo.length > 0 && context.ref.length > 0;
    },
    hasValidRepoWithoutError({ context }) {
      return (
        context.owner.length > 0 && context.repo.length > 0 && context.ref.length > 0 && context.error === undefined
      );
    },
    shouldFetchRepoInfo({ context }) {
      // Only fetch if we have a valid repo AND we haven't fetched metadata yet (or encountered a blocking error)
      return (
        context.owner.length > 0 &&
        context.repo.length > 0 &&
        context.ref.length > 0 &&
        context.repoMetadata === undefined &&
        context.fetchErrors.metadata === undefined
      );
    },
    hasSelectedMainFile({ context }) {
      return context.selectedMainFile !== undefined && context.selectedMainFile.length > 0;
    },
    hasCriticalFetchError({ context }) {
      // Critical errors are 404 or rate limit on metadata (means repo doesn't exist or is inaccessible)
      const metadataError = context.fetchErrors.metadata;
      if (!metadataError) {
        return false;
      }

      const errorMessage = metadataError.message;
      return errorMessage.includes('404') || errorMessage.includes('403') || errorMessage.includes('rate limit');
    },
    canLoadMoreBranches({ context }) {
      return context.hasMoreBranches && !context.isLoadingMoreBranches;
    },
  },
}).createMachine({
  id: 'importGitHub',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    repoUrl: input.owner && input.repo ? `https://github.com/${input.owner}/${input.repo}` : '',
    owner: input.owner ?? '',
    repo: input.repo ?? '',
    ref: input.ref ?? 'main',
    requestedMainFile: input.mainFile ?? '',
    selectedMainFile: undefined,
    repoMetadata: undefined,
    branches: [],
    selectedBranch: input.ref ?? 'main',
    branchesPage: 1,
    hasMoreBranches: false,
    isLoadingMoreBranches: false,
    downloadProgress: { loaded: 0, total: 0 },
    extractProgress: { processed: 0, total: 0 },
    unzipRef: undefined,
    unzipSubscription: undefined,
    files: new Map(),
    buildId: undefined,
    error: undefined,
    fetchErrors: {
      metadata: undefined,
      branches: undefined,
    },
  }),
  initial: 'enteringDetails',
  states: {
    enteringDetails: {
      always: [
        {
          target: 'checkingRepo',
          guard: 'shouldFetchRepoInfo',
        },
      ],
      on: {
        updateRepoUrl: {
          actions: ['clearError', 'updateRepoUrl', 'parseRepoUrl'],
          target: 'checkingRepo',
          reenter: true,
        },
        selectBranch: {
          actions: 'setSelectedBranch',
        },
        startImport: {
          target: 'downloading',
          guard: 'hasValidRepo',
        },
        loadMoreBranches: {
          target: 'loadingMoreBranches',
          guard: 'canLoadMoreBranches',
        },
      },
    },
    loadingMoreBranches: {
      entry: 'setLoadingMoreBranches',
      invoke: {
        id: 'loadMoreBranches',
        src: 'getBranchesActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          page: context.branchesPage + 1,
        }),
        onDone: {
          target: 'enteringDetails',
          actions: 'appendBranches',
        },
        onError: {
          target: 'enteringDetails',
          actions: assign({
            isLoadingMoreBranches: false,
          }),
        },
      },
      on: {
        updateRepoUrl: {
          actions: ['clearError', 'updateRepoUrl', 'parseRepoUrl'],
          target: 'checkingRepo',
          reenter: true,
        },
        selectBranch: {
          actions: 'setSelectedBranch',
        },
      },
    },
    checkingRepo: {
      after: {
        debounceDelay: {
          target: 'fetchingRepoInfo',
          guard: 'hasValidRepo',
        },
      },
      on: {
        updateRepoUrl: {
          actions: ['updateRepoUrl', 'parseRepoUrl'],
          target: 'checkingRepo',
          reenter: true,
        },
        startImport: {
          target: 'downloading',
          guard: 'hasValidRepo',
        },
      },
    },
    fetchingRepoInfo: {
      type: 'parallel',
      states: {
        metadata: {
          initial: 'fetching',
          states: {
            fetching: {
              invoke: {
                id: 'fetchMetadata',
                src: 'getRepoMetadataActor',
                input: ({ context }) => ({
                  owner: context.owner,
                  repo: context.repo,
                }),
                onDone: {
                  target: 'success',
                  actions: assign({
                    repoMetadata: ({ event }) => event.output.metadata,
                    ref: ({ context, event }) =>
                      context.ref === 'main' && event.output.metadata.defaultBranch
                        ? event.output.metadata.defaultBranch
                        : context.ref,
                    fetchErrors: ({ context }) => ({
                      ...context.fetchErrors,
                      metadata: undefined,
                    }),
                    error: undefined,
                  }),
                },
                onError: {
                  target: 'error',
                  actions: [
                    'setMetadataError',
                    assign({
                      repoMetadata: undefined,
                      error: ({ event }) => toMetadataFetchError(event.error),
                    }),
                  ],
                },
              },
            },
            success: {
              type: 'final',
            },
            error: {
              type: 'final',
            },
          },
        },
        branches: {
          initial: 'fetching',
          states: {
            fetching: {
              invoke: {
                id: 'fetchBranches',
                src: 'getBranchesActor',
                input: ({ context }) => ({
                  owner: context.owner,
                  repo: context.repo,
                  page: 1,
                }),
                onDone: {
                  target: 'success',
                  actions: 'setBranches',
                },
                onError: {
                  target: 'error',
                  actions: [
                    'setBranchesError',
                    assign({
                      branches: [],
                      hasMoreBranches: false,
                    }),
                  ],
                },
              },
            },
            success: {
              type: 'final',
            },
            error: {
              type: 'final',
            },
          },
        },
      },
      onDone: {
        target: 'enteringDetails',
      },
      on: {
        updateRepoUrl: {
          actions: ['updateRepoUrl', 'parseRepoUrl'],
          target: 'checkingRepo',
          reenter: true,
        },
      },
    },
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
        cancelDownload: {
          target: 'enteringDetails',
          actions: 'clearError',
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
        cancelDownload: {
          target: 'enteringDetails',
          actions: 'clearError',
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
        retry: 'enteringDetails',
      },
    },
  },
});

export type ImportGitHubMachineActor = typeof importGitHubMachine;
