import { assign, assertEvent, setup, fromPromise } from 'xstate';
import type { OutputFrom, DoneActorEvent } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import ObjectStoreWorker from '#hooks/object-store.worker.js?worker';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { assertActorDoneEvent } from '#lib/xstate.js';

type BuildManagerContext = {
  worker: Worker | undefined;
  wrappedWorker: Remote<ObjectStoreWorkerType> | undefined;
  error: Error | undefined;
};

const initializeWorkerActor = fromPromise<
  { type: 'workerInitialized' } | { type: 'workerInitializationFailed'; error: Error },
  { context: BuildManagerContext }
>(async ({ input }) => {
  const { context } = input;

  // Clean up any existing worker
  if (context.worker) {
    context.worker.terminate();
  }

  try {
    const worker = new ObjectStoreWorker();
    const wrappedWorker = wrap<ObjectStoreWorkerType>(worker);

    // Store references
    context.worker = worker;
    context.wrappedWorker = wrappedWorker;

    return { type: 'workerInitialized' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize worker';
    return {
      type: 'workerInitializationFailed',
      error: new Error(errorMessage),
    };
  }
});

const buildManagerActors = {
  initializeWorkerActor,
} as const;
type BuildManagerActorNames = keyof typeof buildManagerActors;

type BuildManagerEventInternal = { type: 'initialize' };

type BuildManagerEventExternal = OutputFrom<(typeof buildManagerActors)[BuildManagerActorNames]>;
type BuildManagerEventExternalDone = DoneActorEvent<BuildManagerEventExternal, BuildManagerActorNames>;

type BuildManagerEvent = BuildManagerEventExternalDone | BuildManagerEventInternal;

/**
 * Build Manager Machine
 *
 * This machine manages the object-store WebWorker for build operations:
 * - Initializes the worker that wraps IndexedDB operations
 * - Provides access to the wrapped worker for performing CRUD operations
 */
export const buildManagerMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as BuildManagerContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as BuildManagerEvent,
  },
  actors: buildManagerActors,
  actions: {
    setError: assign({
      error({ event }) {
        assertActorDoneEvent(event);
        assertEvent(event.output, 'workerInitializationFailed');
        return event.output.error;
      },
    }),

    clearError: assign({
      error: undefined,
    }),

    destroyWorker({ context }) {
      if (context.worker) {
        context.worker.terminate();
        context.worker = undefined;
        context.wrappedWorker = undefined;
      }
    },
  },
  guards: {
    isWorkerInitializationFailed({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'workerInitializationFailed';
    },
  },
}).createMachine({
  id: 'buildManager',
  context: {
    worker: undefined,
    wrappedWorker: undefined,
    error: undefined,
  },
  initial: 'initializing',
  exit: ['destroyWorker'],
  states: {
    initializing: {
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },

    creatingWorker: {
      entry: ['clearError'],
      invoke: {
        id: 'initializeWorkerActor',
        src: 'initializeWorkerActor',
        input({ context }) {
          return { context };
        },
        onDone: [
          {
            target: 'error',
            guard: 'isWorkerInitializationFailed',
            actions: ['setError'],
          },
          {
            target: 'ready',
          },
        ],
      },
    },

    ready: {
      // Worker is ready for use
    },

    error: {
      on: {
        initialize: {
          target: 'creatingWorker',
        },
      },
    },
  },
});

export type BuildManagerMachine = typeof buildManagerMachine;
