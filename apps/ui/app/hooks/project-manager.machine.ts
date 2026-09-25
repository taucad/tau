import { setup, types } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { safeDispose } from '@taucad/utils/dispose';
// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- web worker default import
import ObjectStoreWorker from '#hooks/object-store.worker.js?worker';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';

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
  },
  initial: 'initializing',
  exit: ({ context }, enq) => {
    enq(() => {
      safeDispose(() => context.worker?.terminate());
    });
    return { context: { worker: undefined, wrappedWorker: undefined } };
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

export type ProjectManagerMachine = typeof projectManagerMachine;
