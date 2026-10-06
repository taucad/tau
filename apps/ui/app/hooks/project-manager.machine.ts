import { setup, types } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { safeDispose } from '@taucad/utils/dispose';
// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- web worker default import
import ObjectStoreWorker from '#hooks/object-store.worker.js?worker';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';

/** Actual suspended steps of one private project creation; never a work-progress estimate. */
export type ProjectCreationPhase =
  | 'worker-ready'
  | 'storage-root'
  | 'allocate-directory'
  | 'prepare-journal'
  | 'pin-backend'
  | 'resolve-storage-scope'
  | 'commit-directory'
  | 'persist-route'
  | 'sync-roots'
  | 'resume-resources'
  | 'promote-attachments'
  | 'persist-chats'
  | 'complete-journal'
  | 'prior-discovery'
  | 'invalidate-projects'
  | 'persist-location';

/** One live observation; the original argument is kept only by reference and is never serialized. */
export type ProjectCreationObservation = Readonly<{
  owner: CreateProjectOptions;
  phase: ProjectCreationPhase;
  projectId?: string;
  operationId?: string;
  backend?: 'indexeddb' | 'opfs' | 'node' | 'webaccess';
}>;

type ProjectManagerContext = {
  worker: Worker | undefined;
  wrappedWorker: Remote<ObjectStoreWorkerType> | undefined;
  error: Error | undefined;
  creation: ProjectCreationObservation | undefined;
  creationUnavailable: boolean;
};

type WorkerInitializedEvent = {
  type: 'workerInitialized';
  worker: Worker;
  wrappedWorker: Remote<ObjectStoreWorkerType>;
};

const initializeWorkerActor = fromSafeAsync<WorkerInitializedEvent, { context: ProjectManagerContext }>(
  async ({ input, signal }) => {
    const { context } = input;
    console.debug('[ProjectManager] initializeWorkerActor: start');

    if (context.worker) {
      safeDispose(() => context.worker?.terminate());
    }

    signal.throwIfAborted();

    const worker = new ObjectStoreWorker();
    const wrappedWorker = wrap<ObjectStoreWorkerType>(worker);

    console.debug('[ProjectManager] initializeWorkerActor: success');
    return { type: 'workerInitialized', worker, wrappedWorker };
  },
);

const projectManagerActors = {
  initializeWorkerActor,
} as const;

type ProjectManagerEvent =
  | { type: 'initialize' }
  | WorkerInitializedEvent
  | { type: 'creationStarted'; owner: CreateProjectOptions }
  | { type: 'creationObserved'; observation: ProjectCreationObservation }
  | { type: 'creationsDrained' };

/**
 * Project Manager Machine
 *
 * This machine manages the object-store WebWorker for project operations:
 * - Initializes the worker that wraps IndexedDB operations
 * - Provides access to the wrapped worker for performing CRUD operations
 */
export const projectManagerMachine = setup({
  schemas: {
    context: types<ProjectManagerContext>(),
    events: eventSchemas<ProjectManagerEvent>(),
  },
  actors: projectManagerActors,
}).createMachine({
  id: 'projectManager',
  context: {
    worker: undefined,
    wrappedWorker: undefined,
    error: undefined,
    creation: undefined,
    creationUnavailable: false,
  },
  on: {
    creationStarted: {
      context: ({ context, event }) =>
        context.creation !== undefined || context.creationUnavailable
          ? { creation: undefined, creationUnavailable: true }
          : { creation: { owner: event.owner, phase: 'worker-ready' }, creationUnavailable: false },
    },
    creationObserved: {
      context: ({ context, event }) =>
        context.creation?.owner === event.observation.owner && !context.creationUnavailable
          ? { creation: event.observation }
          : {}, // Foreign/overlapping scopes cannot supply an observation.
    },
    creationsDrained: { context: { creation: undefined, creationUnavailable: false } },
  },
  initial: 'initializing',
  exit: ({ context }, enq) => {
    enq(() => {
      safeDispose(() => context.worker?.terminate());
    });
    return {
      context: { worker: undefined, wrappedWorker: undefined, creation: undefined, creationUnavailable: false },
    };
  },
  states: {
    initializing: {
      entry: (_, enq) => {
        enq(() => {
          console.debug('[ProjectManager] state → initializing');
        });
      },
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },

    creatingWorker: {
      entry: (_, enq) => {
        enq(() => {
          console.debug('[ProjectManager] state → creatingWorker');
        });
        return { context: { error: undefined } };
      },
      on: {
        workerInitialized: {
          context: ({ event }) => ({ worker: event.worker, wrappedWorker: event.wrappedWorker }),
        },
      },
      invoke: {
        id: 'initializeWorkerActor',
        src: 'initializeWorkerActor',
        input({ context }) {
          return { context };
        },
        onDone: { target: 'ready' },
        onError: {
          target: 'error',
          context: ({ event }) => ({ error: event.error instanceof Error ? event.error : undefined }),
        },
      },
    },

    ready: {
      entry: (_, enq) => {
        enq(() => {
          console.debug('[ProjectManager] state → ready');
        });
      },
    },

    error: {
      entry: ({ context }, enq) => {
        enq(() => {
          console.error('[ProjectManager] state → error', context.error);
        });
      },
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },
  },
});

/** Select current authority only; XState retains immutable context in a stopped snapshot. */
export const selectProjectCreation = (
  snapshot: SnapshotFrom<typeof projectManagerMachine>,
  owner: CreateProjectOptions | undefined,
): ProjectCreationObservation | undefined =>
  snapshot.status === 'active' && snapshot.context.creation?.owner === owner ? snapshot.context.creation : undefined;

export type ProjectManagerMachine = typeof projectManagerMachine;
