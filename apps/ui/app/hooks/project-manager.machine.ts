import { assign, assertEvent, setup } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { safeDispose } from '@taucad/utils/dispose';
// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- web worker default import
import ObjectStoreWorker from '#hooks/object-store.worker.js?worker';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

type ProjectManagerContext = {
  worker: Worker | undefined;
  wrappedWorker: Remote<ObjectStoreWorkerType> | undefined;
  error: Error | undefined;
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

type ProjectManagerEvent = { type: 'initialize' } | WorkerInitializedEvent;

/**
 * Project Manager Machine
 *
 * This machine manages the object-store WebWorker for project operations:
 * - Initializes the worker that wraps IndexedDB operations
 * - Provides access to the wrapped worker for performing CRUD operations
 */
export const projectManagerMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as ProjectManagerContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as ProjectManagerEvent,
  },
  actors: projectManagerActors,
  actions: {
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }
        return undefined;
      },
    }),

    clearError: assign({
      error: undefined,
    }),

    destroyWorker: assign(({ context }) => {
      safeDispose(() => context.worker?.terminate());
      return {
        worker: undefined,
        wrappedWorker: undefined,
      };
    }),

    assignWorkerResources: assign({
      worker({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.worker;
      },
      wrappedWorker({ event }) {
        assertEvent(event, 'workerInitialized');
        return event.wrappedWorker;
      },
    }),
  },
}).createMachine({
  id: 'projectManager',
  context: {
    worker: undefined,
    wrappedWorker: undefined,
    error: undefined,
  },
  initial: 'initializing',
  exit: ['destroyWorker'],
  states: {
    initializing: {
      entry() {
        console.debug('[ProjectManager] state → initializing');
      },
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },

    creatingWorker: {
      entry: [
        'clearError',
        () => {
          console.debug('[ProjectManager] state → creatingWorker');
        },
      ],
      on: {
        workerInitialized: {
          actions: ['assignWorkerResources'],
        },
      },
      invoke: {
        id: 'initializeWorkerActor',
        src: 'initializeWorkerActor',
        input({ context }) {
          return { context };
        },
        onDone: 'ready',
        onError: {
          target: 'error',
          actions: ['setError'],
        },
      },
    },

    ready: {
      entry() {
        console.debug('[ProjectManager] state → ready');
      },
    },

    error: {
      entry({ context }) {
        console.error('[ProjectManager] state → error', context.error);
      },
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },
  },
});

export type ProjectManagerMachine = typeof projectManagerMachine;
