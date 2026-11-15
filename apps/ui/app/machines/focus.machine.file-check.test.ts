// @vitest-environment jsdom
/**
 * A14: the open waits for the first file check (plan § 4 A14; U13 and the race part of U20; I15, I20, D25).
 *
 * Focus and a real registry, composed as the runtime composes them, with each session's `revisions` child a stand-in
 * the row drives: its module loads when the row says so, and it reports the file check when the row says so. Both
 * bounds run on step clocks: focus's open bound (`openPatienceMilliseconds`) and the session's check patience
 * (`modelCheckPatienceMilliseconds`).
 *
 * - The session is `pending` from the moment it starts its `revisions` child, so a module that has not loaded yet
 *   cannot let focus join on a `settled` from before it.
 * - While it is `pending`, `opening` holds and the route state is `resolving`.
 * - Once it settles, focus settles and the route state is `editor`.
 * - A check that never settles holds the open only up to the open bound; it then goes on, and turns `slow` at its own
 *   patience, which the registry carries.
 * - A check that begins after the open moves no focus: the viewer's own swap handles it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import { openPatienceMilliseconds } from '#machines/focus.machine.js';
import type { FocusAccessAnswer } from '#machines/focus.machine.js';
import type { ProjectSessionMachineEvent } from '#machines/project-session.machine.js';
import { selectProjectRouteState } from '#machines/focus.route-state.js';
import { modelCheckPatienceMilliseconds } from '#machines/session-file-check.machine.js';
import { startFocusHost } from '#runtime/app-runtime-focus.fixture.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import type { SessionRevisionsCallback, SessionRevisionsPorts } from '#runtime/session-revisions.js';
import { createSessionsRegistryLogic } from '#services/sessions-store.js';
import type { SessionWiring } from '#services/sessions-store.js';

vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

const projectId = 'p1';

const ready = (id: string): FocusAccessAnswer => ({
  status: 'ready',
  project: createProjectFixture({
    id,
    name: id,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
});

/** The `revisions` children the row drives: each one's report, and the module load they wait behind. */
const createRevisionsStandIn = () => {
  const module = Promise.withResolvers<void>();
  const children: Array<(event: ProjectSessionMachineEvent) => void> = [];
  const byProject = new Map<string, (event: ProjectSessionMachineEvent) => void>();
  const callback: SessionRevisionsCallback = ({ input, sendBack }) => {
    children.push(sendBack as (event: ProjectSessionMachineEvent) => void);
    byProject.set(input.projectId, sendBack as (event: ProjectSessionMachineEvent) => void);
    return () => undefined;
  };
  return {
    load: () => {
      module.resolve();
    },
    /** Report the file check from the newest child, as `session-revisions.ts` does on each projection. */
    report: (settled: boolean) => {
      children.at(-1)?.({ type: 'fileCheckChanged', settled, judged: true });
    },
    /** Report the file check from one project's newest child. */
    reportFor: (id: string, settled: boolean) => {
      byProject.get(id)?.({ type: 'fileCheckChanged', settled, judged: true });
    },
    children,
    loadRevisions: async () => {
      await module.promise;
      return {
        sessionRevisionsCallback: () => callback,
        createSessionRevisionsPorts: (ports: unknown) => ports as SessionRevisionsPorts,
      };
    },
  };
};

const unwiredChatSessions = {
  setRevisionFacts: () => undefined,
  publishProjectHostConnector: () => () => undefined,
} as unknown as SessionWiring['chatSessions'];

const flushTasks = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each turn lets one more task land, in order
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  }
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/** A registry whose sessions start the stand-in `revisions` child on a stand-in file manager, and focus over it. */
const compose = () => {
  const revisions = createRevisionsStandIn();
  const registryClock = new StepClock();
  const focusClock = new StepClock();
  const wiring: SessionWiring = {
    loadRevisions: revisions.loadRevisions,
    loadHostConnector: async () => ({ hostConnectorCallback: () => () => () => undefined }),
    registerCloseCut: () => () => undefined,
    registerProducer: () => () => undefined,
    focusedProject: { get: () => undefined, subscribe: () => () => undefined },
    documentVisible: { get: () => true, subscribe: () => () => undefined },
    chatSessions: unwiredChatSessions,
    choices: () => {
      throw new Error('no chat attaches in these rows');
    },
    rootSync: () => ({ syncProjectRoots: async () => undefined, close: () => undefined }),
  };
  const registry = createActor(
    createSessionsRegistryLogic({
      sharedWorker: () => undefined,
      openFileManager: (id) => openSessionFileManagerStandIn(id),
      wiring,
    }),
    { input: { budget: 8 }, clock: registryClock },
  ).start();
  const host = startFocusHost({
    sessions: registry,
    library: { routeAccess: async (id) => ready(id), epoch: () => 0, onEpochChanged: () => () => undefined },
    loadModule: async () => undefined,
    clock: focusClock,
  });
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
  let committed = { slugs: { workspaceSlug: 'ws', projectSlug: projectId }, projectId, chatId: undefined };
  let requests = 0;
  return {
    registry,
    host,
    revisions,
    registryClock,
    focusClock,
    route: (id: string = projectId) => {
      requests += 1;
      committed = { slugs: { workspaceSlug: 'ws', projectSlug: id }, projectId: id, chatId: undefined };
      host.focus.send({
        type: 'routeRequested',
        requestId: `route:${requests}`,
        slugs: committed.slugs,
        projectId: id,
      });
    },
    routeState: () =>
      selectProjectRouteState(host.focus.getSnapshot(), registry.getSnapshot().context, committed)?.kind,
    status: () => registry.getSnapshot().context.status[projectId],
  };
};

describe('the open waits for the first file check (A14)', () => {
  it('should hold the open in resolving while the file check is pending, even before the revisions module loads, and show the editor once it settles', async () => {
    const { host, revisions, route, routeState, status } = compose();
    route();
    await flushTasks();

    /* Live, chat ready, module loaded: only the file check is out, and its child has not even started. */
    expect(status()).toMatchObject({ state: 'live', chatReady: true, availability: 'pending' });
    expect(revisions.children).toHaveLength(0);
    expect(host.focus.getSnapshot().matches('opening')).toBe(true);
    expect(routeState()).toBe('resolving');

    revisions.load();
    await flushTasks();
    expect(revisions.children).toHaveLength(1);
    expect(routeState()).toBe('resolving');

    revisions.report(true);
    await flushTasks();

    expect(status()?.availability).toBe('settled');
    expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
    expect(routeState()).toBe('editor');
  });

  it('should hold the open only up to the open bound for a check that does not settle, then turn it slow at its own patience', async () => {
    const { host, revisions, registryClock, focusClock, route, routeState, status } = compose();
    route();
    revisions.load();
    await flushTasks();
    revisions.report(false);
    await flushTasks();

    focusClock.advance(openPatienceMilliseconds - 1);
    await flushTasks();
    expect(routeState()).toBe('resolving');

    focusClock.advance(1);
    await flushTasks();
    expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
    expect(routeState()).toBe('editor');
    expect(status()?.availability).toBe('pending');

    registryClock.advance(modelCheckPatienceMilliseconds);
    await flushTasks();
    expect(status()?.availability).toBe('slow');

    /* The slow check settles: the "Preparing model" view gives way to the viewer, and focus stays where it is. */
    revisions.report(true);
    await flushTasks();
    expect(status()?.availability).toBe('settled');
    expect(routeState()).toBe('editor');
  });

  it('should move no focus for a check that begins after the open', async () => {
    const { host, revisions, route, routeState, status } = compose();
    route();
    revisions.load();
    await flushTasks();
    revisions.report(true);
    await flushTasks();
    expect(routeState()).toBe('editor');

    revisions.report(false);
    await flushTasks();

    expect(status()?.availability).toBe('settled');
    expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
    expect(routeState()).toBe('editor');
  });

  /* Opens A, settles it, starts a later check on A, and moves to B, which settles. */
  const leaveWhileChecking = async () => {
    const composed = compose();
    const { revisions, route, routeState } = composed;
    route(projectId);
    revisions.load();
    await flushTasks();
    revisions.reportFor(projectId, true);
    await flushTasks();
    revisions.reportFor(projectId, false);
    route('p2');
    await flushTasks();
    revisions.reportFor('p2', true);
    await flushTasks();
    expect(routeState()).toBe('editor');
    expect(composed.host.focus.getSnapshot().hasTag('focused')).toBe(true);
    return composed;
  };

  it('should show the editor at once on a return to a live project whose later check still runs (I20, B6)', async () => {
    const { host, route, routeState, status } = await leaveWhileChecking();

    route(projectId);
    await flushTasks();

    expect(status()?.availability).toBe('settled');
    expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
    expect(routeState()).toBe('editor');
  });

  /* D14: a later check stuck past its patience is `slow`, which focus reads as pending, so a return waits the bound. */
  it('should wait at most the open bound on a return to a live project whose later check has turned slow', async () => {
    const { focusClock, host, registryClock, route, routeState, status } = await leaveWhileChecking();
    registryClock.advance(modelCheckPatienceMilliseconds);
    await flushTasks();
    expect(status()?.availability).toBe('slow');

    route(projectId);
    await flushTasks();
    expect(routeState()).toBe('resolving');

    focusClock.advance(openPatienceMilliseconds);
    await flushTasks();
    expect(host.focus.getSnapshot().hasTag('focused')).toBe(true);
    expect(routeState()).toBe('editor');
  });
});

describe('a session with no revision client (A14)', () => {
  it('should report its file check settled at once, so nothing waits out the open bound', async () => {
    const registry = createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
      input: { budget: 8 },
      clock: new StepClock(),
    }).start();
    cleanups.push(() => {
      registry.stop();
    });
    registry.send({ type: 'open', projectId });
    await flushTasks();

    expect(registry.getSnapshot().context.status[projectId]).toMatchObject({ state: 'live', availability: 'settled' });
  });

  it('should settle the check of a composition with a file manager and no wiring', async () => {
    const registry = createActor(
      createSessionsRegistryLogic({
        sharedWorker: () => undefined,
        openFileManager: (id) => openSessionFileManagerStandIn(id),
      }),
      { input: { budget: 8 }, clock: new StepClock() },
    ).start();
    cleanups.push(() => {
      registry.stop();
    });
    registry.send({ type: 'open', projectId });
    await flushTasks();

    expect(registry.getSnapshot().context.status[projectId]).toMatchObject({ state: 'live', availability: 'settled' });
  });
});
