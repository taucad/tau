import { createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef, EnqueueObject, SystemRegistry } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import { getGitHubClient } from '#lib/github-api.js';
import type { ImportWorkerRequest, ImportWorkerResponse } from '#workers/import.worker.js';

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
  branches: Array<{ name: string; sha: string; updatedAt: number }>;
  selectedBranch: string;
  branchesCursor: string | undefined;
  hasMoreBranches: boolean;
  isLoadingMoreBranches: boolean;
  /** List of files in the repository (fetched via GitHub Trees API) */
  repoFiles: Array<{ path: string; size: number }>;
  isLoadingFiles: boolean;
  downloadProgress: { loaded: number; total: number };
  extractProgress: { processed: number; total: number };
  files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  /** File paths from import worker (lighter than full file contents) */
  importedFilePaths: string[];
  importWorker: Worker | undefined;
  projectId: string | undefined;
  error: Error | undefined;
  fetchErrors: {
    metadata: Error | undefined;
    branches: Error | undefined;
    files: Error | undefined;
  };
  /** Flag to track if last URL change was from navigation (syncLocation) */
  urlFromNavigation: boolean;
};

function toMetadataFetchError(error: unknown): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('404')) {
    return new Error('Repository not found. Please check the URL and try again.');
  }

  if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
    return new Error(
      'GitHub API authentication failed. Your access token may be invalid or expired. ' +
        'Public repository information could not be fetched.',
    );
  }

  if (errorMessage.includes('403') || errorMessage.includes('rate limit')) {
    return new Error('GitHub API rate limit exceeded. Please wait a few minutes and try again.');
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
  | { type: 'cancelReview' }
  | { type: 'updateRepoUrl'; url: string }
  | { type: 'selectBranch'; branch: string }
  | { type: 'selectMainFile'; file: string }
  | {
      type: 'syncLocation';
      owner: string;
      repo: string;
      ref: string;
      mainFile: string;
    }
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
  | { type: 'confirmImport' }
  | {
      type: 'workerExtractComplete';
      filePaths: string[];
      files: Array<{ path: string; content: Uint8Array<ArrayBuffer> }>;
    }
  | {
      type: 'workerError';
      message: string;
      phase: 'download' | 'extract' | 'write';
    };

/**
 * Events emitted by the machine for external listeners (e.g., URL sync)
 *
 * - urlReplaced: Update URL bar without affecting back/forward stack (for typing)
 * - urlPushed: Push to history stack for meaningful navigation points
 */
type ImportGitHubEmitted =
  | {
      type: 'urlReplaced';
      url: string;
    }
  | {
      type: 'urlPushed';
      url: string;
    };

type ImportGitHubEvent =
  | ImportGitHubEventInternal
  | RepoMetadataResult
  | BranchesResult
  | FilesResult
  | ProjectCreatedResult;
type RepoMetadataResult = {
  type: 'metadataRetrieved';
  metadata: {
    avatarUrl: string | undefined;
    description: string | undefined;
    stars: number;
    forks: number;
    watchers: number;
    license: string | undefined;
    defaultBranch: string;
    isPrivate: boolean;
    lastUpdated: string;
  };
};
type BranchesResult = {
  type: 'branchesRetrieved';
  branches: Array<{ name: string; sha: string; updatedAt: number }>;
  hasMore: boolean;
  endCursor: string | undefined;
};

/**
 * Build the URL string for the current machine state
 */
function buildImportUrl({
  owner,
  repo,
  selectedBranch,
  selectedMainFile,
}: {
  owner: string;
  repo: string;
  selectedBranch: string;
  selectedMainFile: string | undefined;
}): string {
  if (!owner || !repo) {
    return '/import';
  }

  // Use github.com/owner/repo without protocol to avoid browser normalizing // to /
  // The full https:// is implied and added when parsing
  const repoUrl = `github.com/${owner}/${repo}`;
  const path = `/import/${repoUrl}`;

  const parameters = new URLSearchParams();

  if (selectedBranch && selectedBranch !== 'main') {
    parameters.set('ref', selectedBranch);
  }

  if (selectedMainFile) {
    parameters.set('main', selectedMainFile);
  }

  const queryString = parameters.size > 0 ? `?${parameters.toString()}` : '';

  return `${path}${queryString}`;
}

const getRepoMetadataActor = fromSafeAsync<RepoMetadataResult, { owner: string; repo: string }>(async ({ input }) => {
  const client = getGitHubClient();
  const metadata = await client.getRepository(input.owner, input.repo);

  return {
    type: 'metadataRetrieved',
    metadata,
  };
});

const getBranchesActor = fromSafeAsync<BranchesResult, { owner: string; repo: string; cursor?: string }>(
  async ({ input }) => {
    const client = getGitHubClient();
    const result = await client.listBranches({
      owner: input.owner,
      repo: input.repo,
      pageSize: 100,
      cursor: input.cursor,
    });

    return {
      type: 'branchesRetrieved',
      branches: result.branches,
      hasMore: result.hasMore,
      endCursor: result.endCursor,
    };
  },
);

// Get files actor - lists files in the repository tree without downloading content
type FilesResult = {
  type: 'filesRetrieved';
  files: Array<{ path: string; size: number }>;
};

const getFilesActor = fromSafeAsync<FilesResult, { owner: string; repo: string; ref: string }>(async ({ input }) => {
  const client = getGitHubClient();
  const files = await client.listFiles(input.owner, input.repo, input.ref);

  return {
    type: 'filesRetrieved',
    files,
  };
});

type ProjectCreatedResult = { type: 'projectCreated'; projectId: string };

const createProjectActor = fromSafeAsync<
  ProjectCreatedResult,
  {
    owner: string;
    repo: string;
    ref: string;
    mainFile: string;
    files: Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>;
  }
>(async () => {
  throw new Error('Not implemented');
});

type ImportWorkerCallbackInput = {
  downloadUrl: string;
  headers?: Record<string, string>;
};

type ImportWorkerCallbackEvents =
  | { type: 'updateDownloadProgress'; loaded: number; total: number }
  | { type: 'updateExtractProgress'; processed: number; total: number }
  | {
      type: 'workerExtractComplete';
      filePaths: string[];
      files: Array<{ path: string; content: Uint8Array<ArrayBuffer> }>;
    }
  | { type: 'workerError'; message: string; phase: 'download' | 'extract' | 'write' };

const importWorkerActor = createCallbackLogic<ImportWorkerCallbackEvents, ImportWorkerCallbackInput>(
  ({ sendBack, input }) => {
    const worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<ImportWorkerResponse>) => {
      const message = event.data;
      switch (message.type) {
        case 'downloadProgress': {
          sendBack({ type: 'updateDownloadProgress', loaded: message.loaded, total: message.total });
          break;
        }
        case 'extractProgress': {
          sendBack({ type: 'updateExtractProgress', processed: message.processed, total: message.total });
          break;
        }
        case 'extractComplete': {
          sendBack({
            type: 'workerExtractComplete',
            filePaths: message.filePaths,
            files: message.files,
          });
          break;
        }
        case 'error': {
          sendBack({ type: 'workerError', message: message.message, phase: message.phase });
          break;
        }
      }
    });

    worker.addEventListener('error', (event) => {
      sendBack({ type: 'workerError', message: event.message, phase: 'download' });
    });

    const startMessage: ImportWorkerRequest = {
      type: 'startDownload',
      url: input.downloadUrl,
      headers: input.headers,
    };
    worker.postMessage(startMessage);

    return () => {
      const cancelMessage: ImportWorkerRequest = { type: 'cancel' };
      worker.postMessage(cancelMessage);
      worker.terminate();
    };
  },
);

const importGitHubActors = {
  getRepoMetadataActor,
  getBranchesActor,
  getFilesActor,
  createProjectActor,
  importWorkerActor,
} as const;

type ImportGitHubEnqueue = EnqueueObject<
  ImportGitHubEvent,
  ImportGitHubEmitted,
  SystemRegistry,
  typeof importGitHubActors
>;
type ImportGitHubPatch = Partial<ImportGitHubContext>;
type ImportGitHubArgs<EventType extends ImportGitHubEvent['type']> = Readonly<{
  context: ImportGitHubContext;
  event: Extract<ImportGitHubEvent, { type: EventType }>;
}>;

const noFetchErrors = { metadata: undefined, branches: undefined, files: undefined } as const;

const errorOr = (error: unknown, fallback: string): Error => (error instanceof Error ? error : new Error(fallback));

/** Parse the typed GitHub URL into owner/repo/ref, clearing whatever the old repo left. */
const parseRepoUrl = (context: ImportGitHubContext): ImportGitHubPatch => {
  // If URL is empty, reset all repo-related state
  if (!context.repoUrl) {
    return {
      owner: '',
      repo: '',
      ref: 'main',
      repoMetadata: undefined,
      branches: [],
      selectedBranch: 'main',
      branchesCursor: undefined,
      hasMoreBranches: false,
      repoFiles: [],
      selectedMainFile: undefined,
    };
  }

  // Parse GitHub URL and extract owner/repo/ref
  try {
    const url = new URL(context.repoUrl);
    if (url.hostname !== 'github.com') {
      return { owner: '', repo: '', repoMetadata: undefined, branches: [], repoFiles: [] };
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return { owner: '', repo: '', repoMetadata: undefined, branches: [], repoFiles: [] };
    }

    const [owner, repoRaw] = pathParts;
    if (!owner || !repoRaw) {
      return { owner: '', repo: '', repoMetadata: undefined, branches: [] };
    }

    const repo = repoRaw.replace(/\.git$/, '');
    const ref = 'main'; // Default to main, could be extended later

    // If the repo changed, clear metadata and branches
    if (owner !== context.owner || repo !== context.repo) {
      return {
        owner,
        repo,
        ref,
        repoMetadata: undefined,
        branches: [],
        selectedBranch: 'main',
        branchesCursor: undefined,
        hasMoreBranches: false,
      };
    }

    return { owner, repo, ref };
  } catch {
    return { owner: '', repo: '', repoMetadata: undefined, branches: [] };
  }
};

const importUrlOf = (context: ImportGitHubContext): string =>
  buildImportUrl({
    owner: context.owner,
    repo: context.repo,
    selectedBranch: context.selectedBranch,
    selectedMainFile: context.selectedMainFile,
  });

/**
 * A typed URL: take it, parse it, and tell the route. Clearing (empty URL)
 * pushes to history; a partial or valid repo replaces during typing, and the
 * debounce completing is what pushes (for back button support).
 */
const updateRepoUrl =
  (options: Readonly<{ clearError: boolean }>) =>
  ({ context, event }: ImportGitHubArgs<'updateRepoUrl'>, enq: ImportGitHubEnqueue) => {
    const typed: ImportGitHubPatch = {
      ...(options.clearError ? { error: undefined, fetchErrors: noFetchErrors } : {}),
      repoUrl: event.url,
      // Clear navigation flag - this is a user-driven change
      urlFromNavigation: false,
    };
    const patch = { ...typed, ...parseRepoUrl({ ...context, ...typed }) };
    const parsed = { ...context, ...patch };
    const url = importUrlOf(parsed);
    enq.emit(!parsed.owner || !parsed.repo ? { type: 'urlPushed', url } : { type: 'urlReplaced', url });
    return { target: 'checkingRepo', reenter: true, context: patch };
  };

const selectBranch =
  (options: Readonly<{ reenter: boolean }>) =>
  ({ context, event }: ImportGitHubArgs<'selectBranch'>, enq: ImportGitHubEnqueue) => {
    // When branch changes, re-fetch files for the new branch
    const patch = { selectedBranch: event.branch, ref: event.branch };
    enq.emit({ type: 'urlReplaced', url: importUrlOf({ ...context, ...patch }) });
    return { target: 'fetchingFiles', ...(options.reenter ? { reenter: true } : {}), context: patch };
  };

const selectMainFileAndReplaceUrl = (
  { context, event }: ImportGitHubArgs<'selectMainFile'>,
  enq: ImportGitHubEnqueue,
) => {
  const patch = { selectedMainFile: event.file };
  enq.emit({ type: 'urlReplaced', url: importUrlOf({ ...context, ...patch }) });
  return { context: patch };
};

// Sync location from React Router (for back/forward navigation)
const syncLocationPatch = (event: Extract<ImportGitHubEvent, { type: 'syncLocation' }>): ImportGitHubPatch => {
  // If no owner/repo from location, reset to empty state
  if (!event.owner || !event.repo) {
    return {
      repoUrl: '',
      owner: '',
      repo: '',
      ref: 'main',
      selectedBranch: 'main',
      repoMetadata: undefined,
      branches: [],
      branchesCursor: undefined,
      hasMoreBranches: false,
      repoFiles: [],
      selectedMainFile: undefined,
      urlFromNavigation: true, // Mark as navigation-driven
    };
  }

  return {
    repoUrl: `https://github.com/${event.owner}/${event.repo}`,
    owner: event.owner,
    repo: event.repo,
    ref: event.ref || 'main',
    selectedBranch: event.ref || 'main',
    requestedMainFile: event.mainFile || '',
    selectedMainFile: event.mainFile || undefined,
    urlFromNavigation: true, // Mark as navigation-driven
  };
};

/* Only a location that would change the current state re-enters the check. */
const syncLocation = ({ context, event }: ImportGitHubArgs<'syncLocation'>) => {
  const currentRepoUrl = context.owner && context.repo ? `https://github.com/${context.owner}/${context.repo}` : '';
  const newRepoUrl = event.owner && event.repo ? `https://github.com/${event.owner}/${event.repo}` : '';
  if (currentRepoUrl === newRepoUrl && context.selectedBranch === (event.ref || 'main')) {
    return undefined;
  }
  return { target: 'checkingRepo', reenter: true, context: syncLocationPatch(event) };
};

const hasValidRepo = (context: ImportGitHubContext): boolean =>
  context.owner.length > 0 && context.repo.length > 0 && context.ref.length > 0;

const startImport = ({ context }: Readonly<{ context: ImportGitHubContext }>) =>
  hasValidRepo(context) ? { target: 'downloading' } : undefined;

const fetchErrorPatch = (
  context: ImportGitHubContext,
  failure: Readonly<{ key: keyof ImportGitHubContext['fetchErrors']; error: unknown; fallback: string }>,
): ImportGitHubPatch => ({
  fetchErrors: { ...context.fetchErrors, [failure.key]: errorOr(failure.error, failure.fallback) },
});

/** Prefer the file the URL asked for, else the first file with a CAD extension. */
const initialMainFile = (context: ImportGitHubContext): string | undefined => {
  const fileNames = context.importedFilePaths.length > 0 ? context.importedFilePaths : [...context.files.keys()];

  if (context.requestedMainFile.length > 0 && fileNames.includes(context.requestedMainFile)) {
    return context.requestedMainFile;
  }

  const cadExtensions = ['.scad', '.jscad', '.ts', '.js', '.kcl'];
  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
  return fileNames.find((filename) => cadExtensions.some((ext) => filename.endsWith(ext)));
};

/**
 * Import GitHub Machine
 *
 * Manages importing a GitHub repository as a project.
 *
 * States:
 * - downloading: Download and extract via import worker (ZIP stream) with progress tracking
 * - selectingMainFile: User reviews files and selects main file
 * - creating: Creating the project with selected main file
 * - success: Import completed successfully
 * - error: An error occurred during import
 *
 * Progress Tracking:
 * - Download progress is tracked via contentLength header or receivedLength
 * - Extract progress is tracked via processed/total file counts
 * - Progress updates are applied immediately for responsive UI feedback
 */
export const importGitHubMachine = setup({
  schemas: {
    context: types<ImportGitHubContext>(),
    events: eventSchemas<ImportGitHubEvent>(),
    input: types<ImportGitHubInput>(),
    emitted: eventSchemas<ImportGitHubEmitted>(),
  },
  actors: importGitHubActors,
  delays: {
    debounceDelay: 500,
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
    // Initialize selectedMainFile from input if provided (for URL loading with ?main=)
    // Empty string means no file selected, so treat as undefined
    // oxlint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentionally treat '' as falsy
    selectedMainFile: input.mainFile ?? undefined,
    repoMetadata: undefined,
    branches: [],
    selectedBranch: input.ref ?? 'main',
    branchesCursor: undefined,
    hasMoreBranches: false,
    isLoadingMoreBranches: false,
    repoFiles: [],
    isLoadingFiles: false,
    downloadProgress: { loaded: 0, total: 0 },
    extractProgress: { processed: 0, total: 0 },
    files: new Map(),
    importedFilePaths: [],
    importWorker: undefined,
    projectId: undefined,
    error: undefined,
    fetchErrors: noFetchErrors,
    // If we have owner and repo from input, this is from URL navigation
    urlFromNavigation: Boolean(input.owner && input.repo),
  }),
  initial: 'enteringDetails',
  states: {
    enteringDetails: {
      // Only fetch if we have a valid repo AND we haven't fetched metadata yet (or encountered a blocking error)
      always: ({ context }) =>
        hasValidRepo(context) && context.repoMetadata === undefined && context.fetchErrors.metadata === undefined
          ? { target: 'checkingRepo' }
          : undefined,
      on: {
        updateRepoUrl: updateRepoUrl({ clearError: true }),
        selectBranch: selectBranch({ reenter: false }),
        selectMainFile: selectMainFileAndReplaceUrl,
        syncLocation,
        startImport,
        loadMoreBranches: ({ context }) =>
          context.hasMoreBranches && !context.isLoadingMoreBranches ? { target: 'loadingMoreBranches' } : undefined,
      },
    },
    loadingMoreBranches: {
      entry: () => ({ context: { isLoadingMoreBranches: true } }),
      invoke: {
        id: 'loadMoreBranches',
        src: 'getBranchesActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          cursor: context.branchesCursor,
        }),
        onDone: { target: 'enteringDetails' },
        onError: { target: 'enteringDetails', context: { isLoadingMoreBranches: false } },
      },
      on: {
        branchesRetrieved: {
          context: ({ context, event }) => {
            const existingNames = new Set(context.branches.map((b) => b.name));
            return {
              branches: [...context.branches, ...event.branches.filter((b) => !existingNames.has(b.name))],
              hasMoreBranches: event.hasMore,
              branchesCursor: event.endCursor,
              isLoadingMoreBranches: false,
            };
          },
        },
        updateRepoUrl: updateRepoUrl({ clearError: true }),
        selectBranch: selectBranch({ reenter: false }),
        selectMainFile: selectMainFileAndReplaceUrl,
        syncLocation,
      },
    },
    checkingRepo: {
      after: {
        debounceDelay: ({ context }, enq) => {
          if (!hasValidRepo(context)) {
            return undefined;
          }
          // Push URL when valid repo is detected via typing (debounce completed).
          // From navigation - don't push URL (already pushed by React Router).
          if (!context.urlFromNavigation) {
            enq.emit({ type: 'urlPushed', url: importUrlOf(context) });
          }
          return { target: 'fetchingRepoInfo' };
        },
      },
      on: {
        updateRepoUrl: updateRepoUrl({ clearError: false }),
        syncLocation,
        startImport,
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
                onDone: { target: 'success' },
                onError: ({ context, event }) => ({
                  target: 'error',
                  context: {
                    ...fetchErrorPatch(context, {
                      key: 'metadata',
                      error: event.error,
                      fallback: 'Failed to fetch repository metadata',
                    }),
                    repoMetadata: undefined,
                    error: toMetadataFetchError(event.error),
                  },
                }),
              },
              on: {
                metadataRetrieved: {
                  context: ({ context, event }) => ({
                    repoMetadata: event.metadata,
                    selectedBranch: event.metadata.defaultBranch,
                    ref:
                      context.ref === 'main' && event.metadata.defaultBranch
                        ? event.metadata.defaultBranch
                        : context.ref,
                    fetchErrors: { ...context.fetchErrors, metadata: undefined },
                    error: undefined,
                  }),
                },
              },
            },
            success: { type: 'final' },
            error: { type: 'final' },
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
                  cursor: undefined,
                }),
                onDone: { target: 'success' },
                onError: ({ context, event }) => ({
                  target: 'error',
                  context: {
                    ...fetchErrorPatch(context, {
                      key: 'branches',
                      error: event.error,
                      fallback: 'Failed to fetch branches',
                    }),
                    branches: [],
                    hasMoreBranches: false,
                  },
                }),
              },
              on: {
                branchesRetrieved: {
                  context: ({ event }) => ({
                    branches: event.branches,
                    hasMoreBranches: event.hasMore,
                    branchesCursor: event.endCursor,
                  }),
                },
              },
            },
            success: { type: 'final' },
            error: { type: 'final' },
          },
        },
        files: {
          initial: 'fetching',
          states: {
            fetching: {
              entry: () => ({ context: { isLoadingFiles: true } }),
              invoke: {
                id: 'fetchFiles',
                src: 'getFilesActor',
                input: ({ context }) => ({
                  owner: context.owner,
                  repo: context.repo,
                  ref: context.selectedBranch,
                }),
                onDone: { target: 'success' },
                onError: ({ context, event }) => ({
                  target: 'error',
                  context: {
                    ...fetchErrorPatch(context, {
                      key: 'files',
                      error: event.error,
                      fallback: 'Failed to fetch files',
                    }),
                    isLoadingFiles: false,
                    repoFiles: [],
                  },
                }),
              },
              on: {
                filesRetrieved: { context: ({ event }) => ({ repoFiles: event.files, isLoadingFiles: false }) },
              },
            },
            success: { type: 'final' },
            error: { type: 'final' },
          },
        },
      },
      onDone: { target: 'enteringDetails' },
      on: {
        updateRepoUrl: updateRepoUrl({ clearError: false }),
        syncLocation,
      },
    },
    // Fetch files only (when branch changes)
    fetchingFiles: {
      entry: () => ({ context: { isLoadingFiles: true } }),
      invoke: {
        id: 'fetchFilesOnBranchChange',
        src: 'getFilesActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          ref: context.selectedBranch,
        }),
        onDone: { target: 'enteringDetails' },
        onError: ({ context, event }) => ({
          target: 'enteringDetails',
          context: {
            ...fetchErrorPatch(context, { key: 'files', error: event.error, fallback: 'Failed to fetch files' }),
            isLoadingFiles: false,
            repoFiles: [],
          },
        }),
      },
      on: {
        filesRetrieved: { context: ({ event }) => ({ repoFiles: event.files, isLoadingFiles: false }) },
        updateRepoUrl: updateRepoUrl({ clearError: false }),
        selectBranch: selectBranch({ reenter: true }),
        syncLocation,
      },
    },
    downloading: {
      entry: () => ({ context: { error: undefined, fetchErrors: noFetchErrors } }),
      invoke: {
        src: 'importWorkerActor',
        input: ({ context }) => {
          const client = getGitHubClient();
          return {
            downloadUrl: client.getArchiveUrl({
              owner: context.owner,
              repo: context.repo,
              ref: context.ref,
            }),
            headers: client.getAuthHeaders(),
          };
        },
      },
      on: {
        updateDownloadProgress: {
          context: ({ event }) => ({ downloadProgress: { loaded: event.loaded, total: event.total } }),
        },
        updateExtractProgress: {
          context: ({ event }) => ({ extractProgress: { processed: event.processed, total: event.total } }),
        },
        workerExtractComplete: ({ context, event }) => {
          const files = new Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>();
          for (const entry of event.files) {
            const filename = entry.path.split('/').pop() ?? entry.path;
            files.set(entry.path, { filename, content: entry.content });
          }
          const extracted = { importedFilePaths: event.filePaths, files };
          return {
            target: 'selectingMainFile',
            context: { ...extracted, selectedMainFile: initialMainFile({ ...context, ...extracted }) },
          };
        },
        workerError: {
          target: 'error',
          context: ({ event }) => ({ error: new Error(`Import failed (${event.phase}): ${event.message}`) }),
        },
        cancelDownload: { target: 'enteringDetails', context: { error: undefined, fetchErrors: noFetchErrors } },
      },
    },
    selectingMainFile: {
      on: {
        selectMainFile: { context: ({ event }) => ({ selectedMainFile: event.file }) },
        confirmImport: ({ context }) =>
          context.selectedMainFile !== undefined && context.selectedMainFile.length > 0
            ? { target: 'creating' }
            : undefined,
        /** Clear repo selection and extracted files; return to empty entry-details (`/import`). */
        cancelReview: {
          target: 'enteringDetails',
          context: {
            repoUrl: '',
            owner: '',
            repo: '',
            ref: 'main',
            requestedMainFile: '',
            selectedMainFile: undefined,
            repoMetadata: undefined,
            branches: [],
            selectedBranch: 'main',
            branchesCursor: undefined,
            hasMoreBranches: false,
            isLoadingMoreBranches: false,
            repoFiles: [],
            isLoadingFiles: false,
            downloadProgress: { loaded: 0, total: 0 },
            extractProgress: { processed: 0, total: 0 },
            files: new Map(),
            importedFilePaths: [],
            importWorker: undefined,
            projectId: undefined,
            error: undefined,
            fetchErrors: noFetchErrors,
            urlFromNavigation: false,
          },
        },
      },
    },
    creating: {
      invoke: {
        src: 'createProjectActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          ref: context.ref,
          mainFile: context.selectedMainFile!,
          files: context.files,
        }),
        onDone: { target: 'success' },
        onError: ({ event }) => ({ target: 'error', context: { error: errorOr(event.error, 'Unknown error') } }),
      },
      on: {
        projectCreated: { context: ({ event }) => ({ projectId: event.projectId }) },
      },
    },
    success: {
      type: 'final',
    },
    error: {
      on: {
        retry: { target: 'enteringDetails' },
      },
    },
  },
});

export type ImportGitHubMachineActor = typeof importGitHubMachine;
