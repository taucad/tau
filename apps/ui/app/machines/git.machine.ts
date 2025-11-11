import { assign, assertEvent, setup, fromPromise, emit, fromCallback } from 'xstate';
import type { OutputFrom, DoneActorEvent, AnyActorRef } from 'xstate';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { lightningFs } from '#db/storage.js';
import { assertActorDoneEvent } from '#lib/xstate.js';
import { getBuildDirectory } from '#lib/lightning-fs.lib.js';
import { gitAttributesTemplate } from '#constants/gitattributes-template.js';

/**
 * Git File Status
 */
export type GitFileStatus = {
  path: string;
  status: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
};

/**
 * Git Repository Info
 */
export type GitRepository = {
  owner: string;
  name: string;
  url: string;
  branch: string;
};

/**
 * Git Machine Context
 */
export type GitContext = {
  parentRef: AnyActorRef | undefined;
  buildId: string | undefined;
  accessToken: string | undefined;
  provider: 'github' | undefined;
  repository: GitRepository | undefined;
  fileStatuses: Map<string, GitFileStatus>;
  stagedFiles: Set<string>;
  commitMessage: string | undefined;
  error: Error | undefined;
  isInitialized: boolean;
  username: string | undefined;
  email: string | undefined;
};

/**
 * Git Machine Input
 */
type GitInput = {
  buildId?: string;
  parentRef?: AnyActorRef;
};

// Define the actors that the machine can invoke
const initGitActor = fromPromise<{ buildId: string }, { buildId: string; repository: GitRepository }>(
  async ({ input }) => {
    if (!lightningFs) {
      throw new Error('LightningFS not initialized');
    }

    const fs = lightningFs;
    const dir = getBuildDirectory(input.buildId);

    // Initialize git repository
    await git.init({ fs, dir, defaultBranch: input.repository.branch });

    // Add remote
    await git.addRemote({
      fs,
      dir,
      remote: 'origin',
      url: input.repository.url,
    });

    // Create .gitattributes file for binary file handling
    const gitAttributesPath = `${dir}/.gitattributes`;
    try {
      // Check if .gitattributes already exists
      await fs.promises.stat(gitAttributesPath);
    } catch {
      // Doesn't exist, create it
      await fs.promises.writeFile(gitAttributesPath, gitAttributesTemplate, 'utf8');
    }

    return { buildId: input.buildId };
  },
);

const cloneRepositoryActor = fromPromise<
  { buildId: string },
  { buildId: string; repository: GitRepository; accessToken: string; username: string }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  await git.clone({
    fs,
    http,
    dir,
    url: input.repository.url,
    ref: input.repository.branch,
    singleBranch: true,
    depth: 1,
    onAuth: () => ({
      username: input.username,
      password: input.accessToken,
    }),
  });

  return { buildId: input.buildId };
});

const stageFileActor = fromPromise<string, { buildId: string; path: string }>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  await git.add({
    fs,
    dir,
    filepath: input.path,
  });

  return input.path;
});

const unstageFileActor = fromPromise<string, { buildId: string; path: string }>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  await git.remove({
    fs,
    dir,
    filepath: input.path,
  });

  return input.path;
});

const commitChangesActor = fromPromise<string, { buildId: string; message: string; username: string; email: string }>(
  async ({ input }) => {
    if (!lightningFs) {
      throw new Error('LightningFS not initialized');
    }

    const fs = lightningFs;
    const dir = getBuildDirectory(input.buildId);

    const sha = await git.commit({
      fs,
      dir,
      message: input.message,
      author: {
        name: input.username,
        email: input.email,
      },
    });

    return sha;
  },
);

const pushChangesActor = fromPromise<
  boolean,
  { buildId: string; repository: GitRepository; accessToken: string; username: string }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    ref: input.repository.branch,
    onAuth: () => ({
      username: input.username,
      password: input.accessToken,
    }),
  });

  return true;
});

const pullChangesActor = fromPromise<
  boolean,
  { buildId: string; repository: GitRepository; accessToken: string; username: string }
>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  await git.pull({
    fs,
    http,
    dir,
    ref: input.repository.branch,
    author: {
      name: input.username,
      email: input.username,
    },
    onAuth: () => ({
      username: input.username,
      password: input.accessToken,
    }),
  });

  return true;
});

// eslint-disable-next-line complexity -- TODO: address
const refreshGitStatusActor = fromPromise<Map<string, GitFileStatus>, { buildId: string }>(async ({ input }) => {
  if (!lightningFs) {
    throw new Error('LightningFS not initialized');
  }

  const fs = lightningFs;
  const dir = getBuildDirectory(input.buildId);

  try {
    // Get list of all files in the working directory
    const statusMatrix = await git.statusMatrix({ fs, dir });
    const fileStatuses = new Map<string, GitFileStatus>();

    for (const [filepath, headStatus, workdirStatus, stageStatus] of statusMatrix) {
      let status: 'clean' | 'modified' | 'added' | 'deleted' | 'untracked' = 'clean';
      let staged = false;

      // Determine file status based on statusMatrix values
      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        status = 'untracked';
      } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
        status = 'clean';
      } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
        status = 'modified';
        staged = false;
      } else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
        status = 'added';
        staged = true;
      } else if (headStatus === 1 && workdirStatus === 0) {
        status = 'deleted';
      } else if (stageStatus === 2) {
        staged = true;
        if (headStatus === 1 && workdirStatus === 2) {
          status = 'modified';
        }
      }

      fileStatuses.set(filepath, {
        path: filepath,
        status,
        staged,
      });
    }

    return fileStatuses;
  } catch {
    // Git not initialized or other error
    return new Map<string, GitFileStatus>();
  }
});

const buildListenerActor = fromCallback<{ type: 'refreshStatus' }, { parentRef: AnyActorRef | undefined }>(
  ({ input, sendBack }) => {
    if (!input.parentRef) {
      return () => {
        // No cleanup needed
      };
    }

    const { parentRef } = input;

    const fileCreatedSub = parentRef.on('fileCreated', () => {
      sendBack({ type: 'refreshStatus' });
    });

    const fileUpdatedSub = parentRef.on('fileUpdated', () => {
      sendBack({ type: 'refreshStatus' });
    });

    const fileDeletedSub = parentRef.on('fileDeleted', () => {
      sendBack({ type: 'refreshStatus' });
    });

    return () => {
      fileCreatedSub.unsubscribe();
      fileUpdatedSub.unsubscribe();
      fileDeletedSub.unsubscribe();
    };
  },
);

const gitActors = {
  initGitActor,
  cloneRepositoryActor,
  stageFileActor,
  unstageFileActor,
  commitChangesActor,
  pushChangesActor,
  pullChangesActor,
  refreshGitStatusActor,
  buildListener: buildListenerActor,
} as const;

type GitActorNames = keyof typeof gitActors;

/**
 * Git Machine Events
 */
type GitEventInternal =
  | { type: 'connect'; buildId: string }
  | { type: 'authenticate'; accessToken: string; username: string; email: string }
  | { type: 'selectRepository'; repository: GitRepository }
  | { type: 'createRepository'; name: string; isPrivate: boolean }
  | { type: 'clone'; repository: GitRepository }
  | { type: 'stageFile'; path: string }
  | { type: 'unstageFile'; path: string }
  | { type: 'commit'; message: string }
  | { type: 'push' }
  | { type: 'pull' }
  | { type: 'refreshStatus' }
  | { type: 'disconnect' }
  | { type: 'retry' };

export type GitEventExternal = OutputFrom<(typeof gitActors)[GitActorNames]>;
type GitEventExternalDone = DoneActorEvent<GitEventExternal, GitActorNames>;

type GitEvent = GitEventExternalDone | GitEventInternal;

/**
 * Git Machine Emitted Events
 */
type GitEmitted =
  | { type: 'authenticationRequired' }
  | { type: 'authenticated'; username: string }
  | { type: 'repositorySelected'; repository: GitRepository }
  | { type: 'repositoryCreated'; repository: GitRepository }
  | { type: 'cloneComplete' }
  | { type: 'fileStaged'; path: string }
  | { type: 'fileUnstaged'; path: string }
  | { type: 'commitCreated'; sha: string }
  | { type: 'pushComplete' }
  | { type: 'pullComplete' }
  | { type: 'statusUpdated'; fileStatuses: Map<string, GitFileStatus> }
  | { type: 'error'; error: Error };

/**
 * Git Machine
 *
 * Orchestrates Git operations using isomorphic-git.
 * Manages authentication, repository connections, and version control operations.
 *
 * States:
 * - disconnected: No repository connected
 * - authenticating: OAuth flow in progress
 * - selectingRepo: Choosing or creating a repository
 * - cloning: Initial repository clone
 * - ready: Working directory ready for operations
 * - staging: Managing staged files
 * - committing: Creating a commit
 * - pushing: Uploading to remote
 * - pulling: Downloading from remote
 * - error: An error occurred
 */
export const gitMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as GitContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as GitEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as GitEmitted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as GitInput,
  },
  actors: gitActors,
  guards: {
    hasAccessToken({ context }) {
      return Boolean(context.accessToken);
    },
    isAuthError({ context }) {
      return Boolean(context.error?.message.includes('auth'));
    },
    isCloneError({ context }) {
      return Boolean(context.error?.message.includes('clone'));
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
    setBuildId: assign({
      buildId({ event }) {
        assertEvent(event, 'connect');
        return event.buildId;
      },
    }),
    setAuthentication: assign({
      accessToken({ event }) {
        assertEvent(event, 'authenticate');
        return event.accessToken;
      },
      username({ event }) {
        assertEvent(event, 'authenticate');
        return event.username;
      },
      email({ event }) {
        assertEvent(event, 'authenticate');
        return event.email;
      },
    }),
    setRepository: assign({
      repository({ event }) {
        assertEvent(event, ['selectRepository', 'clone']);
        return event.repository;
      },
    }),
    updateFileStatuses: assign({
      fileStatuses({ event }) {
        assertActorDoneEvent(event);
        return event.output as Map<string, GitFileStatus>;
      },
      stagedFiles({ event }) {
        assertActorDoneEvent(event);
        const statuses = event.output as Map<string, GitFileStatus>;
        const staged = new Set<string>();
        for (const [path, status] of statuses) {
          if (status.staged) {
            staged.add(path);
          }
        }

        return staged;
      },
    }),
    addToStagedFiles: assign({
      stagedFiles({ context, event }) {
        assertActorDoneEvent(event);
        const path = event.output as string;
        const updated = new Set(context.stagedFiles);
        updated.add(path);
        return updated;
      },
    }),
    removeFromStagedFiles: assign({
      stagedFiles({ context, event }) {
        assertActorDoneEvent(event);
        const path = event.output as string;
        const updated = new Set(context.stagedFiles);
        updated.delete(path);
        return updated;
      },
    }),
    setCommitMessage: assign({
      commitMessage({ event }) {
        assertEvent(event, 'commit');
        return event.message;
      },
    }),
    clearCommitMessage: assign({
      commitMessage: undefined,
    }),
    markInitialized: assign({
      isInitialized: true,
    }),
    disconnect: assign({
      repository: undefined,
      fileStatuses: new Map(),
      stagedFiles: new Set(),
      commitMessage: undefined,
      isInitialized: false,
    }),
  },
}).createMachine({
  id: 'git',
  context: ({ input }) => ({
    parentRef: input.parentRef,
    buildId: input.buildId,
    accessToken: undefined,
    provider: undefined,
    repository: undefined,
    fileStatuses: new Map(),
    stagedFiles: new Set(),
    commitMessage: undefined,
    error: undefined,
    isInitialized: false,
    username: undefined,
    email: undefined,
  }),
  initial: 'disconnected',
  states: {
    disconnected: {
      on: {
        connect: {
          target: 'checkingAuthentication',
          actions: 'setBuildId',
        },
      },
    },
    checkingAuthentication: {
      always: [
        {
          guard: 'hasAccessToken',
          target: 'selectingRepo',
        },
        {
          target: 'authenticating',
          actions: emit({ type: 'authenticationRequired' as const }),
        },
      ],
    },
    authenticating: {
      on: {
        authenticate: {
          target: 'selectingRepo',
          actions: [
            'setAuthentication',
            emit(({ event }) => ({
              type: 'authenticated' as const,
              username: event.username,
            })),
          ],
        },
        disconnect: {
          target: 'disconnected',
        },
      },
    },
    selectingRepo: {
      on: {
        selectRepository: {
          target: 'cloning',
          actions: [
            'setRepository',
            emit(({ event }) => ({
              type: 'repositorySelected' as const,
              repository: event.repository,
            })),
          ],
        },
        createRepository: {
          // Repository creation would be handled externally via GitHub API
          // then the created repo would be selected
          actions: emit(({ event }) => ({
            type: 'repositoryCreated' as const,
            repository: {
              owner: '',
              name: event.name,
              url: '',
              branch: 'main',
            },
          })),
        },
        disconnect: {
          target: 'disconnected',
          actions: 'disconnect',
        },
      },
    },
    cloning: {
      entry: 'clearError',
      invoke: {
        src: 'cloneRepositoryActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
          repository: context.repository!,
          accessToken: context.accessToken!,
          username: context.username!,
        }),
        onDone: {
          target: 'refreshingStatus',
          actions: ['markInitialized', emit({ type: 'cloneComplete' as const })],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    ready: {
      invoke: {
        id: 'buildListener',
        src: 'buildListener',
        input: ({ context }) => ({ parentRef: context.parentRef }),
      },
      on: {
        stageFile: 'stagingFile',
        unstageFile: 'unstagingFile',
        commit: 'committing',
        push: 'pushing',
        pull: 'pulling',
        refreshStatus: 'refreshingStatus',
        disconnect: {
          target: 'disconnected',
          actions: 'disconnect',
        },
      },
    },
    stagingFile: {
      entry: 'clearError',
      invoke: {
        src: 'stageFileActor',
        input({ context, event }) {
          assertEvent(event, 'stageFile');
          return { buildId: context.buildId!, path: event.path };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'addToStagedFiles',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'fileStaged' as const,
                path: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    unstagingFile: {
      entry: 'clearError',
      invoke: {
        src: 'unstageFileActor',
        input({ context, event }) {
          assertEvent(event, 'unstageFile');
          return { buildId: context.buildId!, path: event.path };
        },
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'removeFromStagedFiles',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'fileUnstaged' as const,
                path: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    committing: {
      entry: ['clearError', 'setCommitMessage'],
      invoke: {
        src: 'commitChangesActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
          message: context.commitMessage!,
          username: context.username!,
          email: context.email!,
        }),
        onDone: {
          target: 'refreshingStatus',
          actions: [
            'clearCommitMessage',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'commitCreated' as const,
                sha: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    pushing: {
      entry: 'clearError',
      invoke: {
        src: 'pushChangesActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
          repository: context.repository!,
          accessToken: context.accessToken!,
          username: context.username!,
        }),
        onDone: {
          target: 'ready',
          actions: emit({ type: 'pushComplete' as const }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    pulling: {
      entry: 'clearError',
      invoke: {
        src: 'pullChangesActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
          repository: context.repository!,
          accessToken: context.accessToken!,
          username: context.username!,
        }),
        onDone: {
          target: 'refreshingStatus',
          actions: emit({ type: 'pullComplete' as const }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    refreshingStatus: {
      invoke: {
        src: 'refreshGitStatusActor',
        input: ({ context }) => ({
          buildId: context.buildId!,
        }),
        onDone: {
          target: 'ready',
          actions: [
            'updateFileStatuses',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'statusUpdated' as const,
                fileStatuses: event.output,
              };
            }),
          ],
        },
        onError: {
          // If status refresh fails, just go back to ready
          target: 'ready',
        },
      },
    },
    error: {
      on: {
        retry: [
          {
            guard: 'isAuthError',
            target: 'authenticating',
          },
          {
            guard: 'isCloneError',
            target: 'cloning',
          },
          {
            target: 'ready',
          },
        ],
        disconnect: {
          target: 'disconnected',
          actions: 'disconnect',
        },
      },
    },
  },
});
