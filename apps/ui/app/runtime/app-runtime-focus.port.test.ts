// @vitest-environment jsdom
/**
 * The registry port's answers to focus over a real one-slot registry (A5b review round 13): a queued open that lands
 * waiting is answered once resumed, the budget dialog's Not now answers start-failed, and a return refused by a close
 * that came back live answers refused (rule 12).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { AnyActorRef, AnyEventObject } from 'xstate';
import { mock } from 'vitest-mock-extended';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createFocusComposition } from '#runtime/app-runtime-focus.js';
import { createSessionsRegistryLogic } from '#services/sessions-store.js';
import { sessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});
/** Focus's `open` command, as focus's own `sendTo` hands it to the port. */
type OpenCommand = Readonly<{ type: 'open'; requestId: string; projectId: string }>;
const open = (requestId: string, projectId: string): OpenCommand => ({ type: 'open', requestId, projectId });
const flushTasks = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
};

it('should an open that displaces the waiting one answers only itself (one slot, order of replies)', async () => {
  const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget: 1 },
    clock: new StepClock(),
  }).start();
  const told: Array<{ type: string } & Record<string, unknown>> = [];
  const fakeFocus = mock<AnyActorRef>();
  fakeFocus.send.mockImplementation((event: AnyEventObject) => {
    told.push(event);
  });
  const composition = createFocusComposition({
    library: {
      routeAccess: async () => ({ status: 'missing' }),
      epoch: () => 0,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
  const port = createActor(composition.logics.registry, {
    input: { sessions: registry, focus: () => fakeFocus },
  }).start();
  cleanups.push(() => {
    port.stop();
    registry.stop();
  });
  port.send(open('r1', 'p1'));
  await flushTasks();
  registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: ['run'], stoppableRuns: [] });
  await flushTasks();
  port.send(open('r2', 'p2'));
  await flushTasks();
  expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  port.send(open('r3', 'p3'));
  await flushTasks();
  const settled = told
    .filter((event) => event.type === 'openSettled')
    .map((event) => `${String(event['requestId'])}:${String(event['result'])}`);
  expect(settled).toEqual(['r1:live', 'r2:waiting', 'r3:waiting']);
});

it('should a queued open that lands waiting is answered when the registry resumes it', async () => {
  const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget: 1 },
    clock: new StepClock(),
  }).start();
  const told: Array<{ type: string } & Record<string, unknown>> = [];
  const fakeFocus = mock<AnyActorRef>();
  fakeFocus.send.mockImplementation((event: AnyEventObject) => {
    told.push(event);
  });
  const composition = createFocusComposition({
    library: {
      routeAccess: async () => ({ status: 'missing' }),
      epoch: () => 0,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
  const port = createActor(composition.logics.registry, {
    input: { sessions: registry, focus: () => fakeFocus },
  }).start();
  cleanups.push(() => {
    port.stop();
    registry.stop();
  });
  port.send(open('r1', 'p1'));
  await flushTasks();
  registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: ['run'], stoppableRuns: [] });
  await flushTasks();
  /* Focus answers the registry's notification of an earlier event with its next open: the registry queues it. */
  let armed = true;
  const inside = registry.subscribe(() => {
    if (armed) {
      armed = false;
      port.send(open('r2', 'p2'));
    }
  });
  registry.send({ type: 'touch', projectId: 'p1' });
  inside.unsubscribe();
  await flushTasks();
  expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
  registry.send({ type: 'close', projectId: 'p1', reason: 'user' });
  registry.getSnapshot().context.refs['p1']?.send({ type: 'confirmClose' });
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
  });
  await flushTasks();
  const settled = told
    .filter((event) => event.type === 'openSettled')
    .map((event) => `${String(event['requestId'])}:${String(event['result'])}`);
  expect(settled).toEqual(['r1:live', 'r2:waiting', 'r2:live']);
});

it("should the person's Not now on the budget dialog answers focus's waiting open declined", async () => {
  const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget: 1 },
    clock: new StepClock(),
  }).start();
  const told: Array<{ type: string } & Record<string, unknown>> = [];
  const fakeFocus = mock<AnyActorRef>();
  fakeFocus.send.mockImplementation((event: AnyEventObject) => {
    told.push(event);
  });
  const composition = createFocusComposition({
    library: {
      routeAccess: async () => ({ status: 'missing' }),
      epoch: () => 0,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
  const port = createActor(composition.logics.registry, {
    input: { sessions: registry, focus: () => fakeFocus },
  }).start();
  cleanups.push(() => {
    port.stop();
    registry.stop();
  });
  port.send(open('r1', 'p1'));
  await flushTasks();
  registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: ['run'], stoppableRuns: [] });
  await flushTasks();
  port.send(open('r2', 'p2'));
  await flushTasks();
  expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  /* `BudgetRefusedDialog`'s Not now: straight to the registry, not through focus. */
  registry.send({ type: 'cancelPendingOpen' });
  await flushTasks();
  const settled = told
    .filter((event) => event.type === 'openSettled')
    .map((event) => `${String(event['requestId'])}:${String(event['result'])}`);
  expect(settled).toEqual(['r1:live', 'r2:waiting', 'r2:declined']);
});

it('should a return to a closing project refused by another close that came back live is answered refused (rule 12)', async () => {
  const opener = sessionRuntimeOpenerStandIn();
  const registry = createActor(
    createSessionsRegistryLogic({
      sharedWorker: () => undefined,
      openRuntime: opener,
      openFileManager: (id: string) => openSessionFileManagerStandIn(id),
    }),
    {
      input: { budget: 2 },
      clock: new StepClock(),
    },
  ).start();
  const told: Array<{ type: string } & Record<string, unknown>> = [];
  const fakeFocus = mock<AnyActorRef>();
  fakeFocus.send.mockImplementation((event: AnyEventObject) => {
    told.push(event);
  });
  const composition = createFocusComposition({
    library: {
      routeAccess: async () => ({ status: 'missing' }),
      epoch: () => 0,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
  const port = createActor(composition.logics.registry, {
    input: { sessions: registry, focus: () => fakeFocus },
  }).start();
  cleanups.push(() => {
    port.stop();
    registry.stop();
  });
  /* Project px's close never settles, so px stays closing; py's is held until the row refuses it. */
  opener.onBuilt('px', (standIn) => {
    standIn.hold();
  });
  let refuse: () => void = () => undefined;
  opener.onBuilt('py', (standIn) => {
    const release = standIn.hold();
    refuse = () => {
      standIn.refuse('producer refused');
      release();
    };
  });
  port.send(open('r1', 'px'));
  port.send(open('r2', 'py'));
  await flushTasks();
  await flushTasks();
  for (const id of ['px', 'py']) {
    registry.send({ type: 'close', projectId: id, reason: 'user' });
    registry.getSnapshot().context.refs[id]?.send({ type: 'confirmClose' });
  }
  await flushTasks();
  port.send(open('r3', 'px'));
  await flushTasks();
  refuse();
  await flushTasks();
  await flushTasks();
  const settled = told
    .filter((event) => event.type === 'openSettled')
    .map((event) => `${String(event['requestId'])}:${String(event['result'])}`);
  expect(settled).toEqual(['r1:live', 'r2:live', 'r3:waiting', 'r3:refused']);
});
