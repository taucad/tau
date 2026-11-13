import { setup, types } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import { safeDispose } from '@taucad/utils/dispose';
// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- web worker default import
import ObjectStoreWorker from '#hooks/object-store.worker.js?worker';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';

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

/** Events accepted by projectManagerMachine. @public */
export type ProjectManagerEvent = { type: 'initialize' } | WorkerInitializedEvent;

/**
 * The project manager machine's public alphabet: every {@link ProjectManagerEvent} type, in the union's order. The
 * totality test samples each one and fails when this list and the union differ.
 *
 * @public
 */
export const projectManagerEventTypes = ['initialize', 'workerInitialized'] as const satisfies ReadonlyArray<
  ProjectManagerEvent['type']
>;

/**
 * The (state, event) pairs this machine leaves unanswered today (MC-R17): the totality baseline, one pair per
 * state where no transition takes the event.
 *
 * - `initialize` while a worker is being created or is ready: a second start has nothing to restart.
 * - `workerInitialized` outside `creatingWorker`: the worker's report only lands while its invoke runs.
 *
 * @public
 */
export const projectManagerIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['creatingWorker', 'initialize'],
  ['ready', 'initialize'],
  ['initializing', 'workerInitialized'],
  ['ready', 'workerInitialized'],
  ['error', 'workerInitialized'],
];

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
