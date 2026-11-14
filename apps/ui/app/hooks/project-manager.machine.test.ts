import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { Remote } from 'comlink';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { projectManagerMachine } from '#hooks/project-manager.machine.js';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

vi.mock('comlink', () => ({
  wrap: vi.fn(() => ({})),
}));

const faults = vi.hoisted(() => ({ reported: [] as unknown[] }));

vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reportAppRuntimeFault: (error: unknown) => {
    faults.reported.push(error);
  },
}));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkerInitializedEvent = {
  type: 'workerInitialized';
  worker: Worker;
  wrappedWorker: Remote<ObjectStoreWorkerType>;
};

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

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
          wrappedWorker: mock<Remote<ObjectStoreWorkerType>>(),
        };
        return event;
      }),
    },
  });

  return createActor(machine);
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
    afterEach(() => {
      faults.reported.length = 0;
    });

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
});
