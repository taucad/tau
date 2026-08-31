import { assign, assertEvent, setup, enqueueActions, fromCallback } from 'xstate';
import type { AnyActorRef } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
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

const importWorkerActor = fromCallback<ImportWorkerCallbackEvents, ImportWorkerCallbackInput>(({ sendBack, input }) => {
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
});

const importGitHubActors = {
  getRepoMetadataActor,
  getBranchesActor,
  getFilesActor,
  createProjectActor,
  importWorkerActor,
} as const;

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
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ImportGitHubContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ImportGitHubEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as ImportGitHubInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as ImportGitHubEmitted,
  },
  actors: {
    ...importGitHubActors,
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
        files: undefined,
      },
    }),
    /** Clear repo selection and extracted files; return to empty entry-details (`/import`). */
    resetReview: assign(({ context }) => ({
      parentRef: context.parentRef,
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
      fetchErrors: {
        metadata: undefined,
        branches: undefined,
        files: undefined,
      },
      urlFromNavigation: false,
    })),
    updateRepoUrl: assign({
      repoUrl({ event }) {
        assertEvent(event, 'updateRepoUrl');
        return event.url;
      },
      // Clear navigation flag - this is a user-driven change
      urlFromNavigation: false,
    }),
    parseRepoUrl: assign(({ context }) => {
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
          return {
            owner: '',
            repo: '',
            repoMetadata: undefined,
            branches: [],
            repoFiles: [],
          };
        }

        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) {
          return {
            owner: '',
            repo: '',
            repoMetadata: undefined,
            branches: [],
            repoFiles: [],
          };
        }

        const [owner, repoRaw] = pathParts;
        if (!owner || !repoRaw) {
          return {
            owner: '',
            repo: '',
            repoMetadata: undefined,
            branches: [],
          };
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
        return {
          owner: '',
          repo: '',
          repoMetadata: undefined,
          branches: [],
        };
      }
    }),
    setRepoMetadata: assign({
      repoMetadata({ event }) {
        assertEvent(event, 'metadataRetrieved');
        return event.metadata;
      },
      selectedBranch({ event }) {
        assertEvent(event, 'metadataRetrieved');
        return event.metadata.defaultBranch;
      },
      ref({ event, context }) {
        assertEvent(event, 'metadataRetrieved');
        return context.ref === 'main' && event.metadata.defaultBranch ? event.metadata.defaultBranch : context.ref;
      },
      fetchErrors({ context }) {
        return {
          ...context.fetchErrors,
          metadata: undefined,
        };
      },
      error: undefined,
    }),
    setBranches: assign({
      branches({ event }) {
        assertEvent(event, 'branchesRetrieved');
        return event.branches;
      },
      hasMoreBranches({ event }) {
        assertEvent(event, 'branchesRetrieved');
        return event.hasMore;
      },
      branchesCursor({ event }) {
        assertEvent(event, 'branchesRetrieved');
        return event.endCursor;
      },
    }),
    appendBranches: assign({
      branches({ event, context }) {
        assertEvent(event, 'branchesRetrieved');
        const existingNames = new Set(context.branches.map((b) => b.name));
        const newBranches = event.branches.filter((b) => !existingNames.has(b.name));
        return [...context.branches, ...newBranches];
      },
      hasMoreBranches({ event }) {
        assertEvent(event, 'branchesRetrieved');
        return event.hasMore;
      },
      branchesCursor({ event }) {
        assertEvent(event, 'branchesRetrieved');
        return event.endCursor;
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
    setProjectId: assign({
      projectId({ event }) {
        assertEvent(event, 'projectCreated');
        return event.projectId;
      },
    }),
    initializeSelectedMainFile: assign({
      selectedMainFile({ context }) {
        const fileNames = context.importedFilePaths.length > 0 ? context.importedFilePaths : [...context.files.keys()];

        if (context.requestedMainFile.length > 0 && fileNames.includes(context.requestedMainFile)) {
          return context.requestedMainFile;
        }

        const cadExtensions = ['.scad', '.jscad', '.ts', '.js', '.kcl'];
        // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- ext is conventional abbreviation for extension
        const foundFile = fileNames.find((filename) => cadExtensions.some((ext) => filename.endsWith(ext)));

        return foundFile;
      },
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
    setRepoFiles: assign({
      repoFiles({ event }) {
        assertEvent(event, 'filesRetrieved');
        return event.files;
      },
      isLoadingFiles: false,
    }),
    setRepoFilesError: assign({
      fetchErrors: ({ context, event }) => ({
        ...context.fetchErrors,
        files: 'error' in event && event.error instanceof Error ? event.error : new Error('Failed to fetch files'),
      }),
      isLoadingFiles: false,
    }),
    setLoadingRepoFiles: assign({
      isLoadingFiles: true,
    }),
    setSelectedMainFile: assign({
      selectedMainFile({ event }) {
        assertEvent(event, 'selectMainFile');
        return event.file;
      },
    }),
    // Sync location from React Router (for back/forward navigation)
    syncLocation: assign(({ event }) => {
      assertEvent(event, 'syncLocation');

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
    }),
    // Emit URL replacement for real-time typing updates (no history change)
    emitUrlReplaced: enqueueActions(({ enqueue, context }) => {
      const url = buildImportUrl({
        owner: context.owner,
        repo: context.repo,
        selectedBranch: context.selectedBranch,
        selectedMainFile: context.selectedMainFile,
      });
      enqueue.emit({ type: 'urlReplaced', url });
    }),
    // Emit URL push for meaningful navigation points (adds to history)
    emitUrlPushed: enqueueActions(({ enqueue, context }) => {
      const url = buildImportUrl({
        owner: context.owner,
        repo: context.repo,
        selectedBranch: context.selectedBranch,
        selectedMainFile: context.selectedMainFile,
      });
      enqueue.emit({ type: 'urlPushed', url });
    }),
    // Emit URL based on whether we're clearing or setting a full repo URL
    // Clearing (empty URL) → push to history
    // Valid repo detected → push to history (for back button support)
    // Partial/incomplete URL → replace (for real-time typing feedback)
    emitUrlChange: enqueueActions(({ enqueue, context }) => {
      const url = buildImportUrl({
        owner: context.owner,
        repo: context.repo,
        selectedBranch: context.selectedBranch,
        selectedMainFile: context.selectedMainFile,
      });
      // If owner/repo are empty, this is a clear action - push to history
      if (!context.owner || !context.repo) {
        enqueue.emit({ type: 'urlPushed', url });
      } else {
        // Valid repo - always replace during typing; we'll push on debounce completion
        enqueue.emit({ type: 'urlReplaced', url });
      }
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
    // Check if location sync would change the current state
    locationDiffersFromState({ context, event }) {
      assertEvent(event, 'syncLocation');
      const currentRepoUrl = context.owner && context.repo ? `https://github.com/${context.owner}/${context.repo}` : '';
      const newRepoUrl = event.owner && event.repo ? `https://github.com/${event.owner}/${event.repo}` : '';
      return currentRepoUrl !== newRepoUrl || context.selectedBranch !== (event.ref || 'main');
    },
    // Only push URL to history if not from navigation (avoids double-push)
    shouldPushUrl({ context }) {
      return !context.urlFromNavigation;
    },
    // Combined guard: valid repo AND should push URL
    hasValidRepoAndShouldPush({ context }) {
      return (
        context.owner.length > 0 && context.repo.length > 0 && context.ref.length > 0 && !context.urlFromNavigation
      );
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
    fetchErrors: {
      metadata: undefined,
      branches: undefined,
      files: undefined,
    },
    // If we have owner and repo from input, this is from URL navigation
    urlFromNavigation: Boolean(input.owner && input.repo),
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
          actions: ['clearError', 'updateRepoUrl', 'parseRepoUrl', 'emitUrlChange'],
          target: 'checkingRepo',
          reenter: true,
        },
        selectBranch: {
          // When branch changes, re-fetch files for the new branch
          actions: ['setSelectedBranch', 'emitUrlReplaced'],
          target: 'fetchingFiles',
        },
        selectMainFile: {
          actions: ['setSelectedMainFile', 'emitUrlReplaced'],
        },
        syncLocation: {
          actions: 'syncLocation',
          guard: 'locationDiffersFromState',
          target: 'checkingRepo',
          reenter: true,
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
          cursor: context.branchesCursor,
        }),
        onDone: {
          target: 'enteringDetails',
        },
        onError: {
          target: 'enteringDetails',
          actions: assign({
            isLoadingMoreBranches: false,
          }),
        },
      },
      on: {
        branchesRetrieved: {
          actions: 'appendBranches',
        },
        updateRepoUrl: {
          actions: ['clearError', 'updateRepoUrl', 'parseRepoUrl', 'emitUrlChange'],
          target: 'checkingRepo',
          reenter: true,
        },
        selectBranch: {
          actions: ['setSelectedBranch', 'emitUrlReplaced'],
          target: 'fetchingFiles',
        },
        selectMainFile: {
          actions: ['setSelectedMainFile', 'emitUrlReplaced'],
        },
        syncLocation: {
          actions: 'syncLocation',
          guard: 'locationDiffersFromState',
          target: 'checkingRepo',
          reenter: true,
        },
      },
    },
    checkingRepo: {
      after: {
        debounceDelay: [
          {
            target: 'fetchingRepoInfo',
            guard: 'hasValidRepoAndShouldPush',
            // Push URL when valid repo is detected via typing (debounce completed)
            // Only push if NOT from navigation (avoids double-push)
            actions: 'emitUrlPushed',
          },
          {
            target: 'fetchingRepoInfo',
            guard: 'hasValidRepo',
            // From navigation - don't push URL (already pushed by React Router)
          },
        ],
      },
      on: {
        updateRepoUrl: {
          actions: ['updateRepoUrl', 'parseRepoUrl', 'emitUrlChange'],
          target: 'checkingRepo',
          reenter: true,
        },
        syncLocation: {
          actions: 'syncLocation',
          guard: 'locationDiffersFromState',
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
              on: {
                metadataRetrieved: {
                  actions: 'setRepoMetadata',
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
                  cursor: undefined,
                }),
                onDone: {
                  target: 'success',
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
              on: {
                branchesRetrieved: {
                  actions: 'setBranches',
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
        files: {
          initial: 'fetching',
          states: {
            fetching: {
              entry: 'setLoadingRepoFiles',
              invoke: {
                id: 'fetchFiles',
                src: 'getFilesActor',
                input: ({ context }) => ({
                  owner: context.owner,
                  repo: context.repo,
                  ref: context.selectedBranch,
                }),
                onDone: {
                  target: 'success',
                },
                onError: {
                  target: 'error',
                  actions: [
                    'setRepoFilesError',
                    assign({
                      repoFiles: [],
                    }),
                  ],
                },
              },
              on: {
                filesRetrieved: {
                  actions: 'setRepoFiles',
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
          actions: ['updateRepoUrl', 'parseRepoUrl', 'emitUrlChange'],
          target: 'checkingRepo',
          reenter: true,
        },
        syncLocation: {
          actions: 'syncLocation',
          guard: 'locationDiffersFromState',
          target: 'checkingRepo',
          reenter: true,
        },
      },
    },
    // Fetch files only (when branch changes)
    fetchingFiles: {
      entry: 'setLoadingRepoFiles',
      invoke: {
        id: 'fetchFilesOnBranchChange',
        src: 'getFilesActor',
        input: ({ context }) => ({
          owner: context.owner,
          repo: context.repo,
          ref: context.selectedBranch,
        }),
        onDone: {
          target: 'enteringDetails',
        },
        onError: {
          target: 'enteringDetails',
          actions: [
            'setRepoFilesError',
            assign({
              repoFiles: [],
            }),
          ],
        },
      },
      on: {
        filesRetrieved: {
          actions: 'setRepoFiles',
        },
        updateRepoUrl: {
          actions: ['updateRepoUrl', 'parseRepoUrl', 'emitUrlChange'],
          target: 'checkingRepo',
          reenter: true,
        },
        selectBranch: {
          actions: ['setSelectedBranch', 'emitUrlReplaced'],
          target: 'fetchingFiles',
          reenter: true,
        },
        syncLocation: {
          actions: 'syncLocation',
          guard: 'locationDiffersFromState',
          target: 'checkingRepo',
          reenter: true,
        },
      },
    },
    downloading: {
      entry: 'clearError',
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
          actions: 'applyDownloadProgressImmediately',
        },
        updateExtractProgress: {
          actions: 'applyExtractProgressImmediately',
        },
        workerExtractComplete: {
          target: 'selectingMainFile',
          actions: [
            assign({
              importedFilePaths({ event }) {
                assertEvent(event, 'workerExtractComplete');
                return event.filePaths;
              },
              files({ event }) {
                assertEvent(event, 'workerExtractComplete');
                const map = new Map<string, { filename: string; content: Uint8Array<ArrayBuffer> }>();
                for (const entry of event.files) {
                  const filename = entry.path.split('/').pop() ?? entry.path;
                  map.set(entry.path, { filename, content: entry.content });
                }

                return map;
              },
            }),
            'initializeSelectedMainFile',
          ],
        },
        workerError: {
          target: 'error',
          actions: assign({
            error({ event }) {
              assertEvent(event, 'workerError');
              return new Error(`Import failed (${event.phase}): ${event.message}`);
            },
          }),
        },
        cancelDownload: {
          target: 'enteringDetails',
          actions: 'clearError',
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
        cancelReview: {
          target: 'enteringDetails',
          actions: 'resetReview',
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
        onDone: {
          target: 'success',
        },
        onError: {
          target: 'error',
          actions: 'setError',
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
        retry: 'enteringDetails',
      },
    },
  },
});

export type ImportGitHubMachineActor = typeof importGitHubMachine;
