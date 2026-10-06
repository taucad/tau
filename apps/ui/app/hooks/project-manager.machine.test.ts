import { describe, it, expect, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createActor, waitFor } from 'xstate';
import type { Remote } from 'comlink';
import type { ObjectStoreWorker as ObjectStoreWorkerType } from '#hooks/object-store.worker.js';
import { projectManagerMachine, selectProjectCreation } from '#hooks/project-manager.machine.js';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';

vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

vi.mock('comlink', () => ({
  wrap: vi.fn(() => ({})),
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

const creationInput = (): CreateProjectOptions => ({
  project: { name: 'Creation observation', description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } },
  files: {},
  location: { kind: 'home' },
});

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

  describe('private live creation observation', () => {
    it('should bind actual argument identity and reject a foreign phase', async () => {
      const actor = await startAndInit();
      const owner = creationInput();
      actor.send({ type: 'creationStarted', owner });
      actor.send({
        type: 'creationObserved',
        observation: { owner, phase: 'prepare-journal', projectId: 'proj_owned' },
      });
      expect(selectProjectCreation(actor.getSnapshot(), owner)?.owner).toBe(owner);
      expect(actor.getSnapshot().context.creation?.phase).toBe('prepare-journal');
      expect(actor.getSnapshot().context.creation?.operationId).toBeUndefined();
      actor.send({
        type: 'creationObserved',
        observation: { owner: creationInput(), phase: 'commit-directory', operationId: 'foreign' },
      });
      expect(actor.getSnapshot().context.creation?.phase).toBe('prepare-journal');
      expect(actor.getSnapshot().context.creation?.operationId).toBeUndefined();
      expect(selectProjectCreation(actor.getSnapshot(), creationInput())).toBeUndefined();
      actor.send({ type: 'creationsDrained' });
      expect(actor.getSnapshot().context.creation).toBeUndefined();
      actor.stop();
    });

    it.each(['foreign argument', 'duplicate argument'])(
      'should deny %s overlap until all live scopes drain',
      async (overlap) => {
        const actor = await startAndInit();
        const owner = creationInput();
        actor.send({ type: 'creationStarted', owner });
        actor.send({ type: 'creationStarted', owner: overlap === 'duplicate argument' ? owner : creationInput() });
        expect(actor.getSnapshot().context.creation).toBeUndefined();
        expect(actor.getSnapshot().context.creationUnavailable).toBe(true);
        actor.send({ type: 'creationObserved', observation: { owner, phase: 'commit-directory' } });
        actor.send({ type: 'creationStarted', owner: creationInput() });
        expect(actor.getSnapshot().context.creation).toBeUndefined();
        expect(actor.getSnapshot().context.creationUnavailable).toBe(true);
        actor.send({ type: 'creationsDrained' });
        actor.send({ type: 'creationStarted', owner });
        expect(actor.getSnapshot().context.creation?.owner).toBe(owner);
        expect(actor.getSnapshot().context.creationUnavailable).toBe(false);
        actor.stop();
      },
    );

    it('should revoke the slot on actor exit and reject a stale settle in its replacement', async () => {
      const actor = await startAndInit();
      const owner = creationInput();
      actor.send({ type: 'creationStarted', owner });
      expect(selectProjectCreation(actor.getSnapshot(), owner)?.owner).toBe(owner);
      actor.stop();
      expect(actor.getSnapshot().status).toBe('stopped');
      expect(selectProjectCreation(actor.getSnapshot(), owner)).toBeUndefined();
      const replacement = await startAndInit();
      replacement.send({ type: 'creationObserved', observation: { owner, phase: 'commit-directory' } });
      expect(selectProjectCreation(replacement.getSnapshot(), owner)).toBeUndefined();
      replacement.stop();
    });
  });
});
