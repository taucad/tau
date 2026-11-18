/**
 * The registry's early open (STO-25 SP6): one *Open* gesture at a time, through the session module's own loader, alive
 * until the project's session takes it or the person is elsewhere, with no timer.
 */
import { describe, expect, it, vi } from 'vitest';
import { createSessionsOpenAhead } from '#services/sessions-store.js';
import type { SessionRevisionsAheadModule, SessionsAheadRouteRequest } from '#services/sessions-store.js';
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
  let request: SessionsAheadRouteRequest | undefined = { requestId: 'r0', home: true };
  const listeners = new Set<() => void>();
  const openAhead = createSessionsOpenAhead({
    loadRevisions,
    worker: () => ('worker' in options ? options.worker : worker),
    desktop: options.desktop ?? false,
    routeRequest: {
      get: () => request,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  });
  return {
    openAhead,
    opened,
    released,
    loadRevisions,
    listeners,
    route: (next: SessionsAheadRouteRequest) => {
      request = next;
      for (const listener of listeners) {
        listener();
      }
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
});
