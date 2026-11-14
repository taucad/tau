// @vitest-environment jsdom
/**
 * The registry port over a real one-project registry (A5b review round 9): the ordered channel tells focus the facts
 * an open produced before the open's answer, and a budget refusal raised because the victim's close came back live is
 * the person's to answer in the dialog, never a refusal of focus's waiting open.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { InspectionEvent } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import type { FocusAccessAnswer } from '#machines/focus.machine.js';
import { startFocusHost } from '#runtime/app-runtime-focus.fixture.js';
import {
  createSessionsRegistryLogic,
  registerProjectSessionServices,
  reportRegionReady,
} from '#services/sessions-store.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const ready = (projectId: string): FocusAccessAnswer => ({
  status: 'ready',
  project: createProjectFixture({
    id: projectId,
    name: projectId,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const flushTasks = async (turns = 5): Promise<void> => {
  if (turns === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
  await flushTasks(turns - 1);
};

it('should tell focus the victim the open closed before answering the open that closed it (rule 11)', async () => {
  const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget: 1 },
    clock: new StepClock(),
  }).start();
  const focusEvents: Array<{ type: string; projectId?: string; status?: string; result?: string }> = [];
  const focusRef: { current: unknown } = { current: undefined };
  const host = startFocusHost({
    sessions: registry,
    library: { routeAccess: async (id) => ready(id), epoch: () => 0, onEpochChanged: () => () => undefined },
    loadModule: async () => undefined,
    inspect: (inspection: InspectionEvent) => {
      if (inspection.type === '@xstate.transition' && inspection.actorRef === focusRef.current) {
        focusEvents.push(inspection.event as { type: string });
      }
    },
  });
  focusRef.current = host.focus;
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
  let release: () => void = () => undefined;
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  for (const id of ['p1', 'p2']) {
    cleanups.push(
      registerProjectSessionServices(id, {
        cancelRuns: async () => undefined,
        flushProducers: async () => undefined,
        flushSync: async () => (id === 'p1' ? slow : undefined),
        closeRuntime: async () => undefined,
      }),
    );
  }
  const route = (serial: number, projectId: string): void => {
    host.focus.send({
      type: 'routeRequested',
      requestId: `route:${serial}`,
      slugs: { workspaceSlug: 'ws', projectSlug: projectId },
      projectId,
    });
  };
  route(1, 'p1');
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p1']).toBeDefined();
  });
  reportRegionReady('p1', 'runtime');
  await flushTasks();
  route(2, 'p2');
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  });
  await flushTasks();
  const waitingAt = focusEvents.findIndex((event) => event.type === 'openSettled' && event.result === 'waiting');
  const closingAt = focusEvents.findIndex(
    (event) => event.type === 'sessionFacts' && event.projectId === 'p1' && event.status === 'closing',
  );
  expect(waitingAt).toBeGreaterThan(-1);
  expect(closingAt).toBeGreaterThan(-1);
  expect(closingAt).toBeLessThan(waitingAt);

  release();
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
  });
  await flushTasks();
  const liveAt = focusEvents.findLastIndex((event) => event.type === 'openSettled' && event.result === 'live');
  const goneAt = focusEvents.findIndex(
    (event) => event.type === 'sessionFacts' && event.projectId === 'p1' && event.status === 'absent',
  );
  expect(liveAt).toBeGreaterThan(-1);
  expect(goneAt).toBeGreaterThan(-1);
  expect(goneAt).toBeLessThan(liveAt);
});

it("should keep focus's open waiting through a refused budget close, so the person's choice in the dialog opens it", async () => {
  const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget: 1 },
    clock: new StepClock(),
  }).start();
  const registryEvents: Array<{ type: string; projectId?: string; reason?: string }> = [];
  registry.system.inspect({
    next: (inspection: InspectionEvent) => {
      if (inspection.type === '@xstate.transition' && inspection.actorRef === registry) {
        registryEvents.push(inspection.event as { type: string });
      }
    },
  });
  const host = startFocusHost({
    sessions: registry,
    library: { routeAccess: async (id) => ready(id), epoch: () => 0, onEpochChanged: () => () => undefined },
    loadModule: async () => undefined,
  });
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
  let p1Refuses = false;
  let p1Closes = 0;
  cleanups.push(
    registerProjectSessionServices('p1', {
      cancelRuns: async () => undefined,
      flushProducers: async () => {
        p1Closes += 1;
        if (p1Refuses) {
          throw new Error('unsaved parameter drafts');
        }
      },
      flushSync: async () => undefined,
      closeRuntime: async () => undefined,
    }),
    registerProjectSessionServices('p2', {
      cancelRuns: async () => undefined,
      flushProducers: async () => undefined,
      flushSync: async () => undefined,
      closeRuntime: async () => undefined,
    }),
  );
  const refusals: string[] = [];
  registry.on('budgetRefused', (event) => refusals.push(event.projectId));
  const route = (serial: number, projectId: string): void => {
    host.focus.send({
      type: 'routeRequested',
      requestId: `route:${serial}`,
      slugs: { workspaceSlug: 'ws', projectSlug: projectId },
      projectId,
    });
  };

  route(1, 'p1');
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p1']).toBeDefined();
  });
  reportRegionReady('p1', 'runtime');
  await flushTasks();
  expect(registry.getSnapshot().context.status['p1']?.state).toBe('live');

  /* The ninth open: the budget closes p1 (idle), whose producer refuses, so p1 stays live and the budget refuses p2. */
  p1Refuses = true;
  route(2, 'p2');
  await vi.waitFor(() => {
    expect(refusals).toEqual(['p2']);
  });
  await flushTasks();

  /* The refusal is the dialog's to answer: focus's open still waits, and nothing closes p1 behind the person's back. */
  expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  expect(registryEvents.filter((event) => event.type === 'cancelPendingOpen')).toEqual([]);
  expect(p1Closes).toBe(1);
  expect(refusals).toEqual(['p2']);

  /* The person picks p1 in the dialog, whose drafts are now saved: p1 closes and p2 opens. */
  p1Refuses = false;
  registry.send({ type: 'close', projectId: 'p1', reason: 'user' });
  registry.getSnapshot().context.refs['p1']?.send({ type: 'confirmClose' });
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
  });
  expect(registry.getSnapshot().context.refs['p1']).toBeUndefined();
});
