import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';
import { projectManagerMachine } from '#machines/project-manager.machine.js';
import type { ProjectManagerServices } from '#machines/project-manager.machine.js';
import type { ProjectLibraryObjectStore } from '#types/project-library-io.types.js';

const faults = { reported: [] as unknown[] };
const workerFailures = { reported: [] as unknown[] };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkerInitializedEvent = {
  type: 'workerInitialized';
  worker: Worker;
  wrappedWorker: ProjectLibraryObjectStore;
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const services: ProjectManagerServices = {
  startObjectStore: () => ({
    worker: mock<Worker>({ terminate: vi.fn() }),
    wrappedWorker: mock<ProjectLibraryObjectStore>(),
  }),
  reportFault(error) {
    faults.reported.push(error);
  },
  reportWorkerFailed(error) {
    workerFailures.reported.push(error);
  },
};

function createTestActor(options?: { initResult?: () => Promise<void>; initEmit?: WorkerInitializedEvent }) {
  const machine = projectManagerMachine.provide({
    actors: {
      initializeWorkerActor: fromSafeAsync(async () => {
        if (options?.initResult) {
          await options.initResult();
        }

        const event: WorkerInitializedEvent = options?.initEmit ?? {
          type: 'workerInitialized',
          worker: mock<Worker>({ terminate: vi.fn() }),
          wrappedWorker: mock<ProjectLibraryObjectStore>(),
        };
        return event;
      }),
    },
  });

  return createActor(machine, { input: services });
}

async function startAndInit(options?: Parameters<typeof createTestActor>[0]) {
  const actor = createTestActor(options);
  actor.start();
  actor.send({ type: 'initialize' });
  await waitFor(actor, (s) => s.value === 'ready');
  return actor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('projectManagerMachine', () => {
  beforeEach(() => {
    faults.reported.length = 0;
    workerFailures.reported.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // State: initializing
  // =========================================================================
  describe('initializing', () => {
    it('should start in initializing state', () => {
      const actor = createTestActor();
      actor.start();
      expect(actor.getSnapshot().value).toBe('initializing');
      actor.stop();
    });

    it('should transition to creatingWorker on initialize', () => {
      const actor = createTestActor({
        // oxlint-disable-next-line no-empty-function, typescript-eslint/promise-function-async -- mock never-resolving promise
        initResult: () => new Promise(() => {}),
      });
      actor.start();
      actor.send({ type: 'initialize' });
      expect(actor.getSnapshot().value).toBe('creatingWorker');
      actor.stop();
    });
  });

  // =========================================================================
  // State: creatingWorker
  // =========================================================================
  describe('creatingWorker', () => {
    it('should transition to ready after successful worker init', async () => {
      const actor = await startAndInit();
      expect(actor.getSnapshot().value).toBe('ready');
      actor.stop();
    });

    it('should have worker and wrappedWorker in context after init', async () => {
      const actor = await startAndInit();
      const { context } = actor.getSnapshot();
      expect(context.worker).toBeDefined();
      expect(context.wrappedWorker).toBeDefined();
      actor.stop();
    });

    it('should transition to error on init failure', async () => {
      const actor = createTestActor({
        initResult: async () => {
          throw new Error('worker init failed');
        },
      });
      actor.start();
      actor.send({ type: 'initialize' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error?.message).toBe('worker init failed');
      actor.stop();
    });
  });

  // =========================================================================
  // State: error
  // =========================================================================
  describe('error', () => {
    it('should recover from error via initialize event', async () => {
      let callCount = 0;
      const actor = createTestActor({
        initResult: async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('first attempt');
          }
        },
      });
      actor.start();

      actor.send({ type: 'initialize' });
      await waitFor(actor, (s) => s.value === 'error');
      expect(actor.getSnapshot().context.error).toBeDefined();

      actor.send({ type: 'initialize' });
      await waitFor(actor, (s) => s.value === 'ready');
      expect(actor.getSnapshot().context.error).toBeUndefined();
      actor.stop();
    });
  });

  // =========================================================================
  // Context initialization
  // =========================================================================
  describe('context initialization', () => {
    it('should have correct defaults', () => {
      const actor = createTestActor();
      actor.start();
      const { context } = actor.getSnapshot();
      expect(context.worker).toBeUndefined();
      expect(context.wrappedWorker).toBeUndefined();
      expect(context.error).toBeUndefined();
      actor.stop();
    });
  });

  // =========================================================================
  // Root onError (charter D23, B2; plan § 4 A4a)
  // =========================================================================
  describe('root onError', () => {
    it('should keep the first fault an effect throws, report it once, and keep answering', async () => {
      const first = new Error('first fault');
      const second = new Error('second fault');
      /* The failed start's error entry throws first; the retried start's ready entry throws second. */
      vi.spyOn(console, 'error').mockImplementation(() => {
        throw first;
      });
      vi.spyOn(console, 'debug').mockImplementation((message: unknown) => {
        if (message === '[ProjectManager] state → ready') {
          throw second;
        }
      });
      let attempts = 0;
      const actor = createTestActor({
        initResult: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('worker init failed');
          }
        },
      });
      actor.start();
      actor.send({ type: 'initialize' });
      const failed = await waitFor(actor, (state) => state.value === 'error' || state.status !== 'active');
      expect(failed.status).toBe('active');
      expect(failed.context.fault).toBe('first fault');

      /* It still answers: the retry starts the worker again. */
      actor.send({ type: 'initialize' });
      const ready = await waitFor(actor, (state) => state.value === 'ready' || state.status !== 'active');
      expect(ready.status).toBe('active');
      expect(ready.context.fault).toBe('first fault');
      expect(faults.reported).toEqual([first]);
      actor.stop();
    });
  });

  // T-R9.2 (D5): the library worker's failure is reported, not only logged.
  describe('reporting', () => {
    it('should report the worker failure once through the injected reporter when the worker throws', async () => {
      class WorkerConstructionError extends Error {
        public override readonly name = 'WorkerConstructionError';
      }
      const failure = new WorkerConstructionError('Failed to construct the worker at /Users/someone/app');
      const actor = createTestActor({
        initResult: async () => {
          throw failure;
        },
      });
      actor.start();
      actor.send({ type: 'initialize' });
      await waitFor(actor, (s) => s.value === 'error');

      expect(workerFailures.reported).toEqual([failure]);
      actor.stop();
    });
  });

  // The real worker start goes through the injected `startObjectStore`.
  describe('object store start', () => {
    it('should start the object store through the injected factory and hold what it returns', async () => {
      const worker = mock<Worker>({ terminate: vi.fn() });
      const wrappedWorker = mock<ProjectLibraryObjectStore>();
      const startObjectStore = vi.fn(() => ({ worker, wrappedWorker }));
      const actor = createActor(projectManagerMachine, { input: { ...services, startObjectStore } });
      actor.start();
      actor.send({ type: 'initialize' });
      const ready = await waitFor(actor, (s) => s.value === 'ready');
      expect(startObjectStore).toHaveBeenCalledOnce();
      expect(ready.context.worker).toBe(worker);
      expect(ready.context.wrappedWorker).toBe(wrappedWorker);
      actor.stop();
    });
  });
});
