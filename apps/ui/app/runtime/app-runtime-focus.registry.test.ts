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
import { createSessionsOpenAhead, createSessionsRegistryLogic } from '#services/sessions-store.js';
import type { SessionRevisionsAheadModule } from '#services/sessions-store.js';
import type { SessionRevisionsAheadInput } from '#runtime/session-revisions.js';
import { openAheadPorts } from '#runtime/app-runtime.js';
import { sessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import type { SessionRuntimeOpenerStandIn } from '#runtime/project-runtime.session.fixture.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';

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

/** A one-project registry whose sessions build their runtime on `opener`, so a row can hold or refuse a close (A7c). */
const createRegistry = (opener: SessionRuntimeOpenerStandIn) =>
  createActor(
    createSessionsRegistryLogic({
      sharedWorker: () => undefined,
      openRuntime: opener,
      openFileManager: (id: string) => openSessionFileManagerStandIn(id),
    }),
    { input: { budget: 1 }, clock: new StepClock() },
  ).start();

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
  const opener = sessionRuntimeOpenerStandIn();
  const registry = createRegistry(opener);
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
  /* Project p1's close is slow: its close flush holds until the row releases it, while its leave flush settles at once. */
  let release: () => void = () => undefined;
  opener.onBuilt('p1', (standIn) => {
    release = standIn.hold((signal) => signal === 'flush:close');
  });
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
  /* A7c: the leave flush runs through p1's session (`flushAsked` → `flushSettled`) and its answer reaches focus before
   * the open it releases reaches the registry, so p1's leave flush lands before its close flush starts. */
  const leftAt = focusEvents.findIndex((event) => event.type === 'leaveFlushSettled');
  expect(leftAt).toBeGreaterThan(-1);
  expect(leftAt).toBeLessThan(closingAt);
  expect(opener.latest('p1')?.signals.filter((signal) => signal.startsWith('flush:'))).toEqual([
    'flush:leave',
    'flush:close',
  ]);

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
  const opener = sessionRuntimeOpenerStandIn();
  const registry = createRegistry(opener);
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
  /* How many times p1's runtime was asked to flush for its close. */
  const p1Closes = (): number => opener.latest('p1')?.signals.filter((signal) => signal === 'flush:close').length ?? 0;
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
  await flushTasks();
  expect(registry.getSnapshot().context.status['p1']?.state).toBe('live');

  /* The ninth open: the budget closes p1 (idle), whose producer refuses, so p1 stays live and the budget refuses p2. */
  opener.latest('p1')?.refuse('unsaved parameter drafts');
  route(2, 'p2');
  await vi.waitFor(() => {
    expect(refusals).toEqual(['p2']);
  });
  await flushTasks();

  /* The refusal is the dialog's to answer: focus's open still waits, and nothing closes p1 behind the person's back. */
  expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  expect(registryEvents.filter((event) => event.type === 'cancelPendingOpen')).toEqual([]);
  expect(p1Closes()).toBe(1);
  expect(refusals).toEqual(['p2']);

  /* The person picks p1 in the dialog, whose drafts are now saved: p1 closes and p2 opens. */
  opener.latest('p1')?.refuse(undefined);
  registry.send({ type: 'close', projectId: 'p1', reason: 'user' });
  registry.getSnapshot().context.refs['p1']?.send({ type: 'confirmClose' });
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
  });
  expect(registry.getSnapshot().context.refs['p1']).toBeUndefined();
});

/*
 * STO-25 SP6: the click's early open, over the app runtime's own view of a real focus and registry (`openAheadPorts`).
 * A renamed focus tag or answer shape would otherwise switch off these releases unseen.
 */
const startOpenAhead = (registry: ReturnType<typeof createRegistry>, host: ReturnType<typeof startFocusHost>) => {
  const released: string[] = [];
  const module = {
    openRevisionsAheadOfSession: () => (input: SessionRevisionsAheadInput) => () => {
      released.push(input.projectId);
    },
    createSessionRevisionsAheadPorts: () => ({}),
  } as unknown as SessionRevisionsAheadModule;
  const openAhead = createSessionsOpenAhead({
    loadRevisions: async () => module,
    worker: () => ({ name: 'shared-worker' }) as unknown as Worker,
    desktop: false,
    ...openAheadPorts(host.focus, registry),
  });
  return { openAhead, released };
};

it("should release the click's early open when the person declines the budget's choice (STO-25 SP6)", async () => {
  const opener = sessionRuntimeOpenerStandIn();
  const registry = createRegistry(opener);
  const host = startFocusHost({
    sessions: registry,
    library: { routeAccess: async (id) => ready(id), epoch: () => 0, onEpochChanged: () => () => undefined },
    loadModule: async () => undefined,
  });
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
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
    expect(registry.getSnapshot().context.status['p1']?.state).toBe('live');
  });
  await flushTasks();
  /* Project p1 cannot close (unsaved drafts), so the one-project budget asks the person about p2. */
  opener.latest('p1')?.refuse('unsaved parameter drafts');
  const { openAhead, released } = startOpenAhead(registry, host);
  openAhead({ projectId: 'p2', slugs: { workspaceSlug: 'ws', projectSlug: 'p2' } });
  route(2, 'p2');
  await vi.waitFor(() => {
    expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
  });
  await flushTasks();
  expect(released).toStrictEqual([]);

  /* *Not now*: focus settles on p2 with the reopen offer and no session for it. */
  registry.send({ type: 'cancelPendingOpen' });
  await flushTasks();
  expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
  expect(registry.getSnapshot().context.refs['p2']).toBeUndefined();
  expect(released).toStrictEqual(['p2']);
});

it("should release the click's early open when focus holds the project on an answer that opens nothing (STO-25 SP6)", async () => {
  const registry = createRegistry(sessionRuntimeOpenerStandIn());
  const host = startFocusHost({
    sessions: registry,
    /* The access check fails: focus holds the project, as it holds a session start that failed. */
    library: {
      routeAccess: async () => ({ status: 'error', message: 'Tau could not check this project. Try again.' }),
      epoch: () => 0,
      onEpochChanged: () => () => undefined,
    },
    loadModule: async () => undefined,
  });
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
  const { openAhead, released } = startOpenAhead(registry, host);
  openAhead({ projectId: 'p3', slugs: { workspaceSlug: 'ws', projectSlug: 'p3' } });
  /* The session module has loaded and the connection is open before the route is heard. */
  await flushTasks();
  host.focus.send({
    type: 'routeRequested',
    requestId: 'route:1',
    slugs: { workspaceSlug: 'ws', projectSlug: 'p3' },
    projectId: 'p3',
  });
  await vi.waitFor(() => {
    expect(host.focus.getSnapshot().hasTag('held')).toBe(true);
  });
  await flushTasks();
  expect(released).toStrictEqual(['p3']);
});
