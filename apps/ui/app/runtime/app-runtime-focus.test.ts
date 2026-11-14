// @vitest-environment jsdom
/**
 * The wiring contract between focus and the registry (A5b, plan § 4): the ports the runtime composes, over a real
 * registry. The focus machine's own rows are A5a's; these hold what the wiring owes it.
 *
 * - The registry's channel is ordered: facts the open produced come before its answer, and the facts after a live
 *   answer follow it, so focus never reads a fact about a session its open has not reached (rule 11).
 * - An open sent while the registry is still telling its observers about an earlier event is queued behind it; its
 *   answer comes from the snapshot that shows it, never from the one before it.
 * - The registry hears every library epoch before any open that names it (A5c's fail-safe drops one it does not know).
 * - A pending open the registry drops as stale is re-sent from a fresh answer.
 * - A chat the route switches to while the open is out reaches the session once it is live.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { InspectionEvent } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { createProjectFixture } from '@taucad/ui-core/lib/project.fixture';
import type { FocusAccessAnswer } from '#machines/focus.machine.js';
import { startFocusHost } from '#runtime/app-runtime-focus.fixture.js';
import type { FocusHostFixture } from '#runtime/app-runtime-focus.fixture.js';
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

type Composition = Readonly<{
  registry: ReturnType<typeof createRegistry>;
  host: FocusHostFixture;
  /** Every event focus took, in order. */
  focusEvents: Array<Readonly<{ type: string } & Record<string, unknown>>>;
  /** Every event the registry root took, in order. */
  registryEvents: Array<Readonly<{ type: string } & Record<string, unknown>>>;
  /** Move the library to its next epoch, as `ProjectLibrary`'s change does. */
  bumpEpoch: () => void;
  route: (projectId: string, chatId?: string) => void;
}>;

const createRegistry = (budget: number) =>
  createActor(createSessionsRegistryLogic({ sharedWorker: () => undefined }), {
    input: { budget },
    clock: new StepClock(),
  }).start();

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const compose = ({
  budget = 8,
  access = async (projectId: string) => ready(projectId),
}: Readonly<{ budget?: number; access?: (projectId: string) => Promise<FocusAccessAnswer> }> = {}): Composition => {
  const registryEvents: Array<Readonly<{ type: string } & Record<string, unknown>>> = [];
  const focusEvents: Array<Readonly<{ type: string } & Record<string, unknown>>> = [];
  const registry = createRegistry(budget);
  let epoch = 0;
  const listeners = new Set<(next: number) => void>();
  /* `unknown`: an inspection's ref is an `ActorRefLike`, compared by identity. */
  const focusRef: { current: unknown } = { current: undefined };
  /* The registry's own inspection: the order it processed events in, whoever sent them. */
  registry.system.inspect({
    next: (inspection: InspectionEvent) => {
      if (inspection.type === '@xstate.transition' && inspection.actorRef === registry) {
        registryEvents.push(inspection.event as { type: string });
      }
    },
  });
  const host = startFocusHost({
    sessions: registry,
    library: {
      routeAccess: access,
      epoch: () => epoch,
      onEpochChanged: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    loadModule: async () => undefined,
    inspect: (inspection) => {
      if (inspection.type === '@xstate.transition' && inspection.actorRef === focusRef.current) {
        focusEvents.push(inspection.event as { type: string });
      }
    },
  });
  focusRef.current = host.focus;
  let serial = 0;
  cleanups.push(() => {
    host.stop();
    registry.stop();
  });
  return {
    registry,
    host,
    focusEvents,
    registryEvents,
    bumpEpoch: () => {
      epoch += 1;
      for (const listener of listeners) {
        listener(epoch);
      }
    },
    route: (projectId, chatId) => {
      serial += 1;
      host.focus.send({
        type: 'routeRequested',
        requestId: `route:${String(serial)}`,
        slugs: { workspaceSlug: 'ws', projectSlug: projectId },
        projectId,
        ...(chatId === undefined ? {} : { chatId }),
      });
    },
  };
};

/** A session's services, so its close settles; the runtime region reports ready when a row says so. */
const servicesFor = (projectId: string): void => {
  cleanups.push(
    registerProjectSessionServices(projectId, {
      cancelRuns: async () => undefined,
      flushProducers: async () => undefined,
      flushSync: async () => undefined,
      closeRuntime: async () => undefined,
    }),
  );
};

const flushTasks = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
};

describe('focus and the registry, wired (A5b)', () => {
  it('should answer every open after the facts it produced, and report facts after every live answer', async () => {
    const { focusEvents, route } = compose();
    servicesFor('p1');
    route('p1');
    await vi.waitFor(() => {
      expect(focusEvents.some((event) => event.type === 'openSettled')).toBe(true);
    });

    const answerAt = focusEvents.findIndex((event) => event.type === 'openSettled');
    expect(focusEvents[answerAt]).toMatchObject({ result: 'live' });
    /* The session the live answer reached is described after it, never only before it. */
    expect(
      focusEvents.slice(answerAt + 1).some((event) => event.type === 'sessionFacts' && event['projectId'] === 'p1'),
    ).toBe(true);
  });

  it('should answer an open the registry queued behind the event it was processing from the snapshot that shows it', async () => {
    /* Budget 1 and a memory release (the registry's own close) in flight: focus hears the left session go absent
     * while the registry is still notifying, and sends its next open from inside that notification. */
    const { registry, focusEvents, route } = compose({ budget: 1 });
    servicesFor('p1');
    servicesFor('p2');
    route('p1');
    await vi.waitFor(() => {
      expect(Object.keys(registry.getSnapshot().context.refs)).toEqual(['p1']);
    });
    reportRegionReady('p1', 'runtime');
    await flushTasks();

    route('p2');
    registry.send({ type: 'releaseMemory', keepProjectId: 'p2' });
    await vi.waitFor(() => {
      expect(Object.keys(registry.getSnapshot().context.refs)).toEqual(['p2']);
    });

    const results = focusEvents.filter((event) => event.type === 'openSettled').map((event) => event['result']);
    expect(results).not.toContain('start-failed');
    expect(results.at(-1)).toBe('live');
  });

  it('should tell the registry each library epoch before any open that names it', async () => {
    const { registryEvents, bumpEpoch, route, registry } = compose();
    servicesFor('p1');
    servicesFor('p2');
    route('p1');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p1']).toBeDefined();
    });
    bumpEpoch();
    route('p2');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
    });

    const told = (epoch: number): number =>
      registryEvents.findIndex((event) => event.type === 'libraryEpochChanged' && event['epoch'] === epoch);
    const opened = (projectId: string): number =>
      registryEvents.findIndex((event) => event.type === 'open' && event['projectId'] === projectId);
    expect(told(0)).toBeGreaterThan(-1);
    expect(told(0)).toBeLessThan(opened('p1'));
    expect(told(1)).toBeGreaterThan(-1);
    expect(told(1)).toBeLessThan(opened('p2'));
    expect(registryEvents[opened('p2')]).toMatchObject({ request: { epoch: 1 } });
  });

  it('should re-send an open the registry dropped as stale', async () => {
    const { registry, registryEvents, focusEvents, host, route, bumpEpoch } = compose({ budget: 1 });
    servicesFor('p1');
    servicesFor('p2');
    route('p1');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p1']).toBeDefined();
    });
    reportRegionReady('p1', 'runtime');
    /* Project p1 is running, so the budget cannot close it: p2 waits in the pending slot. */
    registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: ['run'], stoppableRuns: [] });
    await flushTasks();
    route('p2');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.pendingOpen?.projectId).toBe('p2');
    });

    /* The window `target-resume-window` names: the registry hears a library change before focus does, and the slot
     * frees inside it, so the registry drops the resume as stale (A5c) and tells focus. */
    const dropped: string[] = [];
    registry.on('pendingOpenDropped', (event) => dropped.push(event.projectId));
    registry.send({ type: 'libraryEpochChanged', epoch: 1 });
    registry.getSnapshot().context.refs['p1']?.send({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
    registry.send({ type: 'close', projectId: 'p1', reason: 'user' });
    registry.getSnapshot().context.refs['p1']?.send({ type: 'confirmClose' });
    await vi.waitFor(() => {
      expect(dropped).toEqual(['p2']);
    });
    expect(registry.getSnapshot().context.refs['p2']).toBeUndefined();
    /* A drop is not a failed start: focus holds no notice for it and waits for the epoch to ask again. */
    expect(focusEvents.findLast((event) => event.type === 'openSettled')).toMatchObject({ result: 'dropped' });
    expect(host.focus.getSnapshot().hasTag('held')).toBe(false);

    /* The library's change reaches focus: it asks again at the new epoch and sends the open the drop cost it. */
    bumpEpoch();
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p2']).toBeDefined();
    });
    const opens = registryEvents.filter((event) => event.type === 'open' && event['projectId'] === 'p2');
    expect(opens).toHaveLength(2);
    expect(opens.at(-1)).toMatchObject({ request: { epoch: 1 } });
  });

  it('should hand the session a chat the route switched to while the open was out, once the session is live', async () => {
    const { registry, route } = compose();
    servicesFor('p1');
    route('p1', 'chat-1');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p1']).toBeDefined();
    });
    /* Still opening: the runtime region has not reported. */
    route('p1', 'chat-2');
    await flushTasks();
    reportRegionReady('p1', 'runtime');
    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.status['p1']?.state).toBe('live');
    });

    await vi.waitFor(() => {
      expect(registry.getSnapshot().context.refs['p1']?.getSnapshot().context.request).toMatchObject({
        chatId: 'chat-2',
      });
    });
  });
});
