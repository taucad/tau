/**
 * The registry's early open (STO-25 SP6): one *Open* gesture at a time, through the session module's own loader, alive
 * until the project's session takes it or the person is elsewhere, with no timer.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSessionsOpenAhead } from '#services/sessions-store.js';
import type {
  SessionRevisionsAheadModule,
  SessionsAheadFocusView,
  SessionsAheadRegistryView,
  SessionsAheadRouteRequest,
} from '#services/sessions-store.js';
import type { SessionRevisionsAheadInput } from '#runtime/session-revisions.js';

const worker = { name: 'shared-worker' } as unknown as Worker;
const slugsOf = (projectSlug: string) => ({ workspaceSlug: 'acme', projectSlug });

const compose = (options: Readonly<{ desktop?: boolean; worker?: Worker }> = {}) => {
  const opened: SessionRevisionsAheadInput[] = [];
  const released: string[] = [];
  const module = {
    openRevisionsAheadOfSession: () => (input: SessionRevisionsAheadInput) => {
      opened.push(input);
      return () => {
        released.push(input.projectId);
      };
    },
    createSessionRevisionsAheadPorts: () => ({}),
  } as unknown as SessionRevisionsAheadModule;
  const loadRevisions = vi.fn(async () => module);
  let view: SessionsAheadFocusView = { request: { requestId: 'r0', home: true } };
  let registry: SessionsAheadRegistryView = { refs: {}, status: {} };
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const tell = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const openAhead = createSessionsOpenAhead({
    loadRevisions,
    worker: () => ('worker' in options ? options.worker : worker),
    desktop: options.desktop ?? false,
    focus: { get: () => view, subscribe },
    registry: { get: () => registry, subscribe },
  });
  return {
    openAhead,
    opened,
    released,
    loadRevisions,
    listeners,
    route: (next: SessionsAheadRouteRequest) => {
      view = { ...view, request: next };
      tell();
    },
    /** Focus settles: focused on a project, or held on an answer that opens nothing. */
    settle: (next: Omit<SessionsAheadFocusView, 'request'>) => {
      view = { request: view.request, ...next };
      tell();
    },
    /** The registry's sessions: `opening`, `live`, `failed`, … per project, or none. */
    sessions: (states: Readonly<Record<string, 'opening' | 'live' | 'closing' | 'failed' | undefined>>) => {
      const live = Object.entries(states).filter(([, state]) => state !== undefined);
      registry = {
        refs: Object.fromEntries(live.map(([id]) => [id, {}])),
        status: Object.fromEntries(live.map(([id, state]) => [id, { state }])),
      } as unknown as SessionsAheadRegistryView;
      tell();
    },
  };
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('createSessionsOpenAhead (STO-25 SP6)', () => {
  it('opens through the session module, in the workspace the route names, on the shared worker', async () => {
    const harness = compose();
    harness.openAhead({ projectId: 'p1', slugs: slugsOf('one'), asserted: true });
    await settle();
    expect(harness.opened).toStrictEqual([{ projectId: 'p1', workspace: 'acme', worker, asserted: true }]);
  });

  it('starts nothing on the desktop or before the shared worker exists', async () => {
    for (const harness of [compose({ desktop: true }), compose({ worker: undefined })]) {
      harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
      // oxlint-disable-next-line no-await-in-loop -- each composition is checked on its own.
      await settle();
      expect(harness.loadRevisions).not.toHaveBeenCalled();
    }
  });

  it('keeps the route on the way to the project and on it, and releases once the route names elsewhere', async () => {
    const harness = compose();
    harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
    await settle();
    /* The route resolving its slugs, then naming the project, then a chat in it. */
    harness.route({ requestId: 'r1', home: false, slugs: slugsOf('one') });
    harness.route({ requestId: 'r2', home: false, projectId: 'p1', slugs: slugsOf('one') });
    harness.route({ requestId: 'r3', home: false, projectId: 'p1', slugs: slugsOf('one') });
    expect(harness.released).toStrictEqual([]);
    harness.route({ requestId: 'r4', home: true });
    expect(harness.released).toStrictEqual(['p1']);
    expect(harness.listeners.size).toBe(0);
  });

  it('releases a route that never reached the project once it names another one', async () => {
    const harness = compose();
    harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
    await settle();
    harness.route({ requestId: 'r1', home: false, projectId: 'p2', slugs: slugsOf('two') });
    expect(harness.released).toStrictEqual(['p1']);
  });

  it('holds one gesture at a time: a newer project releases the last, the same project is one gesture', async () => {
    const harness = compose();
    harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
    harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
    await settle();
    expect(harness.opened).toHaveLength(1);
    harness.openAhead({ projectId: 'p2', slugs: slugsOf('two') });
    await settle();
    expect(harness.released).toStrictEqual(['p1']);
    expect(harness.opened.map((input) => input.projectId)).toStrictEqual(['p1', 'p2']);
  });

  it('lets a failed navigation release its gesture, even before the module has loaded', async () => {
    const harness = compose();
    const release = harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
    release();
    await settle();
    expect(harness.opened).toStrictEqual([]);
    release();
    expect(harness.released).toStrictEqual([]);
  });
  it('survives a focus port that calls back as it is subscribed to, and releases what it took', async () => {
    const released: string[] = [];
    const module = {
      openRevisionsAheadOfSession: () => (input: SessionRevisionsAheadInput) => () => {
        released.push(input.projectId);
      },
      createSessionRevisionsAheadPorts: () => ({}),
    } as unknown as SessionRevisionsAheadModule;
    let view: SessionsAheadFocusView = { request: { requestId: 'r0', home: true } };
    let subscribed = 0;
    const openAhead = createSessionsOpenAhead({
      loadRevisions: async () => module,
      worker: () => worker,
      desktop: false,
      focus: {
        get: () => view,
        subscribe: (listener) => {
          subscribed += 1;
          /* The person is already elsewhere when the gesture subscribes. */
          view = { request: { requestId: 'r1', home: true } };
          listener();
          return () => {
            subscribed -= 1;
          };
        },
      },
      registry: { get: () => ({ refs: {}, status: {} }), subscribe: () => () => undefined },
    });
    expect(() => openAhead({ projectId: 'p1', slugs: slugsOf('one') })).not.toThrow();
    await settle();
    expect(subscribed).toBe(0);
    expect(released).toStrictEqual([]);
  });

  /* Review of d158d3e7 (MEDIUM): an open that settles without a session leaves no connection or download behind. */
  describe('releases when the open settles without a session', () => {
    const onTheRoute = async () => {
      const harness = compose();
      harness.openAhead({ projectId: 'p1', slugs: slugsOf('one') });
      await settle();
      harness.route({ requestId: 'r1', home: false, projectId: 'p1', slugs: slugsOf('one') });
      return harness;
    };

    it('keeps the connection while the registry opens the session and once it is live', async () => {
      const harness = await onTheRoute();
      harness.sessions({ p1: 'opening' });
      harness.settle({ focusedOn: 'p1' });
      harness.sessions({ p1: 'live' });
      expect(harness.released).toStrictEqual([]);
    });

    it('releases a budget decline: focus settles on the project with no session for it', async () => {
      const harness = await onTheRoute();
      harness.settle({ focusedOn: 'p1' });
      expect(harness.released).toStrictEqual(['p1']);
    });

    it('releases a start failure: focus holds the project on an answer that opens nothing', async () => {
      const harness = await onTheRoute();
      harness.settle({ heldOn: 'p1' });
      expect(harness.released).toStrictEqual(['p1']);
    });

    it('releases when the registry’s session fails or closes, whatever focus says', async () => {
      const failed = await onTheRoute();
      failed.sessions({ p1: 'opening' });
      failed.sessions({ p1: 'failed' });
      expect(failed.released).toStrictEqual(['p1']);

      const closed = await onTheRoute();
      closed.sessions({ p1: 'opening' });
      closed.sessions({});
      expect(closed.released).toStrictEqual(['p1']);
    });

    it('ignores what the registry and focus say of other projects', async () => {
      const harness = await onTheRoute();
      harness.sessions({ p2: 'failed' });
      harness.settle({ heldOn: 'p2' });
      expect(harness.released).toStrictEqual([]);
    });
  });
});
