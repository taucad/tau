import { setup, types } from 'xstate';
import { safeDispose } from '@taucad/utils/dispose';
import { eventSchemas, fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import type { ProjectLibraryObjectStore } from '#types/project-library-io.types.js';

/**
 * A started object-store worker: the worker itself, which the machine terminates, and the store its callers use.
 *
 * @public
 */
export type StartedObjectStore = {
  readonly worker: Worker;
  readonly wrappedWorker: ProjectLibraryObjectStore;
};

/**
 * What the project manager machine is given: how to start the object-store worker and how to report. The app passes
 * its worker factory and its reporters; nothing here names an app module.
 *
 * @public
 */
export type ProjectManagerServices = {
  /** Start the object-store worker and wrap it. */
  startObjectStore(): StartedObjectStore;
  /** Report the machine's first fault once (D23): the app's runtime fault reporter. */
  reportFault(error: unknown): void;
  /** Report that the library's worker failed to start (D5): by name, never by message. */
  reportWorkerFailed(error: unknown): void;
};

type ProjectManagerContext = {
  readonly services: ProjectManagerServices;
  worker: Worker | undefined;
  wrappedWorker: ProjectLibraryObjectStore | undefined;
  error: Error | undefined;
  /** The first defect the root `onError` caught (MC-R12, D23); later ones are its consequences and are not kept. */
  fault: string | undefined;
};

type WorkerInitializedEvent = {
  type: 'workerInitialized';
} & StartedObjectStore;

/** Events accepted by the project manager machine. @public */
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

const initializeWorkerActor = fromSafeAsync<WorkerInitializedEvent, { context: ProjectManagerContext }>(
  async ({ input, signal }) => {
    const { context } = input;
    console.debug('[ProjectManager] initializeWorkerActor: start');

    if (context.worker) {
      safeDispose(() => context.worker?.terminate());
    }

    signal.throwIfAborted();

    const { worker, wrappedWorker } = context.services.startObjectStore();

    console.debug('[ProjectManager] initializeWorkerActor: success');
    return { type: 'workerInitialized', worker, wrappedWorker };
  },
);

/**
 * Project Manager Machine
 *
 * This machine manages the object-store WebWorker for project operations:
 * - Starts the worker that wraps IndexedDB operations through the injected `startObjectStore`
 * - Provides access to the wrapped worker for performing CRUD operations
 *
 * The app passes {@link ProjectManagerServices} as the actor's input: its object-store worker factory, its runtime
 * fault reporter and its worker-failure report.
 *
 * @public
 */
export const projectManagerMachine = setup({
  schemas: {
    context: types<ProjectManagerContext>(),
    events: eventSchemas<ProjectManagerEvent>(),
    input: types<ProjectManagerServices>(),
  },
  actors: { initializeWorkerActor },
}).createMachine({
  id: 'projectManager',
  /* A defect no transition modelled is recorded and reported once, and the machine stays where it was and keeps
   * answering (MC-R12, D23, B2). Its host objects in context are accepted debt (D4): the machine is not rewritten. */
  onError: ({ context, event }, enq) => {
    if (context.fault !== undefined) {
      return {};
    }
    const { services } = context;
    enq(() => {
      services.reportFault(event.error);
    });
    return { context: { fault: event.error instanceof Error ? event.error.message : 'project manager fault' } };
  },
  context: ({ input }) => ({
    services: input,
    worker: undefined,
    wrappedWorker: undefined,
    error: undefined,
    fault: undefined,
  }),
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
        const { services, error } = context;
        enq(() => {
          console.error('[ProjectManager] state → error', error);
          /* D5: the library's worker failing is reported by name, never by message. */
          services.reportWorkerFailed(error);
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

/** The project manager machine. @public */
export type ProjectManagerMachine = typeof projectManagerMachine;
