/**
 * The registry, its sessions and the route composed together (S48).
 *
 * The unit suites drive each machine on its own. This one renders the real
 * provider over the real `sessions-store` singleton and the real seams the
 * project route uses — region reports, registered services, compute admission
 * on the shared worker — because the invariants W19 owes are about the
 * *composition*: navigating opens and never closes (I22), a session's children
 * die with it (I23), a policy never touches a running, dirty or unpushed
 * project (I24, I25), and quit completes every closing before it quiesces
 * (D31).
 *
 * The registry is a module singleton by design, so each test uses its own
 * project ids and `afterEach` closes what it opened. The quit pin is last: a
 * quiesced registry is final.
 */

/* eslint-disable no-await-in-loop -- settling and closing are sequential by
   nature here: each microtask turn and each project's close has to land before
   the next one starts. */
/* eslint-disable no-restricted-imports -- a composition test is the one place
   the machines and the hooks that mount them are exercised together; that is
   what S48 asks for. The layering rule still holds for the machines themselves. */

import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionsProvider, useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import {
  forgetProjectRegions,
  registerProjectSessionServices,
  reportRegionReady,
  sessionsActor,
} from '#services/sessions-store.js';
import { browserLiveProjectBudget } from '#machines/sessions.machine.js';
import type { SessionsMachineEmitted } from '#machines/sessions.machine.js';

/** What the shared file-manager worker was told, in order. */
const { workerFrames, fakeWorker } = vi.hoisted(() => {
  const frames: Array<{ type: string; projectId?: string }> = [];
  return {
    workerFrames: frames,
    fakeWorker: {
      postMessage: (frame: { type: string; projectId?: string }) => {
        frames.push(frame);
      },
    } as unknown as Worker,
  };
});

/* The provider mirrors the app's shared worker into the store; in jsdom there
 * is no `SharedWorkerContext`, so the one hook it reads is the seam to stand
 * in for. Compute admission is then the real path, on a recording worker. */
vi.mock('#hooks/use-file-manager.js', () => ({
  useSharedFileManagerWorker: () => fakeWorker,
}));

/** What each project's registered services were asked to do, in order. */
const serviceCalls: string[] = [];

/**
 * The project route's subtree, reduced to the seams the session depends on.
 *
 * Rendering it is what "this project's resources exist" means; unmounting it
 * is what the route does when the registry stops saying the project is live.
 *
 * @param props - The project this subtree belongs to.
 * @returns The subtree marker.
 */
function ProjectSubtree({ projectId }: { readonly projectId: string }): React.JSX.Element {
  useEffect(() => {
    for (const region of ['views', 'runtime', 'agentHost'] as const) {
      reportRegionReady(projectId, region);
    }
    return () => {
      forgetProjectRegions(projectId);
    };
  }, [projectId]);

  useEffect(
    () =>
      registerProjectSessionServices(projectId, {
        awaitPull: async () => {
          serviceCalls.push(`${projectId}:awaitPull`);
        },
        cancelRuns: async () => {
          serviceCalls.push(`${projectId}:cancelRuns`);
        },
        flushSync: async () => {
          serviceCalls.push(`${projectId}:flushSync`);
        },
        releaseLeases: async () => {
          serviceCalls.push(`${projectId}:releaseLeases`);
        },
      }),
    [projectId],
  );

  return <div data-testid={`subtree-${projectId}`} />;
}

/**
 * The route gate: it opens the project it is showing and renders every project
 * the registry still calls live.
 *
 * @param props - The project the person navigated to.
 * @returns The retained set.
 */
function RouteGate({ projectId }: { readonly projectId: string }): React.JSX.Element {
  const sessions = useSessions();
  const liveProjectIds = useLiveProjectIds();

  useEffect(() => {
    sessions.send({ type: 'open', projectId });
    sessions.send({ type: 'touch', projectId });
  }, [projectId, sessions]);

  return (
    <>
      {liveProjectIds.map((liveProjectId) => (
        <ProjectSubtree key={liveProjectId} projectId={liveProjectId} />
      ))}
    </>
  );
}

const emitted: SessionsMachineEmitted[] = [];

/** Let the sessions' own promise actors and effects settle. */
const settle = async (): Promise<void> => {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
};

const liveProjectIds = (): readonly string[] => Object.keys(sessionsActor.getSnapshot().context.refs);

/** Send to the registry the way the app does — inside React's act scope. */
const send = async (event: Parameters<typeof sessionsActor.send>[0]): Promise<void> => {
  await act(async () => {
    sessionsActor.send(event);
    await Promise.resolve();
  });
};

describe('sessions composition', () => {
  beforeEach(() => {
    workerFrames.length = 0;
    serviceCalls.length = 0;
    emitted.length = 0;
    for (const type of ['liveSetChanged', 'budgetRefused', 'quiesced'] as const) {
      sessionsActor.on(type, (event) => emitted.push(event));
    }
  });

  afterEach(async () => {
    for (const [projectId, ref] of Object.entries(sessionsActor.getSnapshot().context.refs)) {
      await send({ type: 'close', projectId, reason: 'user' });
      await act(async () => {
        ref.send({ type: 'confirmClose' });
        await Promise.resolve();
      });
    }
    await settle();
    vi.restoreAllMocks();
  });

  it('keeps a project live across navigation away and back (pin a, I22)', async () => {
    const view = render(
      <SessionsProvider>
        <RouteGate projectId='pin-a-1' />
      </SessionsProvider>,
    );
    await settle();
    const first = sessionsActor.getSnapshot().context.refs['pin-a-1'];
    const firstChildren = first?.getSnapshot().context;

    view.rerender(
      <SessionsProvider>
        <RouteGate projectId='pin-a-2' />
      </SessionsProvider>,
    );
    await settle();
    view.rerender(
      <SessionsProvider>
        <RouteGate projectId='pin-a-1' />
      </SessionsProvider>,
    );
    await settle();

    const back = sessionsActor.getSnapshot().context.refs['pin-a-1'];
    expect(back).toBe(first);
    expect(firstChildren?.computeRef).toBeDefined();
    expect(back?.getSnapshot().context.computeRef).toBe(firstChildren?.computeRef);
    expect(back?.getSnapshot().context.fileManagerRef).toBe(firstChildren?.fileManagerRef);
    /* The kernel is not rebooted on return: compute was admitted once and
     * never released while the project stayed live (V21). */
    expect(workerFrames.filter((frame) => frame.projectId === 'pin-a-1')).toEqual([
      { type: 'computeStoreAdmission', projectId: 'pin-a-1' },
    ]);
    expect(liveProjectIds()).toEqual(['pin-a-1', 'pin-a-2']);
    view.unmount();
  });

  it('refuses the ninth project, naming the idle one to close (pin b, I28)', async () => {
    render(
      <SessionsProvider>
        <RouteGate projectId='pin-b-0' />
      </SessionsProvider>,
    );
    await settle();
    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      await send({ type: 'open', projectId: `pin-b-${index}` });
      await send({ type: 'touch', projectId: `pin-b-${index}` });
    }
    await settle();

    await send({ type: 'open', projectId: 'pin-b-ninth' });

    const refusal = emitted.find((event) => event.type === 'budgetRefused');
    expect(refusal?.projectId).toBe('pin-b-ninth');
    expect(refusal?.suggestions[0]).toBe('pin-b-0');
    expect(liveProjectIds()).not.toContain('pin-b-ninth');

    await send({ type: 'close', projectId: 'pin-b-0', reason: 'user' });
    await settle();
    await send({ type: 'open', projectId: 'pin-b-ninth' });
    await settle();

    expect(liveProjectIds()).toContain('pin-b-ninth');
    /* Closing released exactly the closed project's compute, nobody else's. */
    expect(workerFrames.filter((frame) => frame.type === 'computeStoreRelease')).toEqual([
      { type: 'computeStoreRelease', projectId: 'pin-b-0' },
    ]);
  });

  it.each<[string, { runs?: number; dirty?: boolean; pushed?: boolean }]>([
    ['running', { runs: 1 }],
    ['dirty', { dirty: true }],
    ['unpushed', { pushed: false }],
  ])('never closes a %s project on the idle window (pin c, I24/I25)', async (reason, facts) => {
    const projectId = `pin-c-${reason}`;
    render(
      <SessionsProvider>
        <RouteGate projectId={projectId} />
      </SessionsProvider>,
    );
    await settle();
    const session = sessionsActor.getSnapshot().context.refs[projectId];
    await act(async () => {
      if (facts.runs === undefined) {
        session?.send({ type: 'revisionState', dirty: facts.dirty === true, pushed: facts.pushed !== false });
      } else {
        session?.send({ type: 'runStarted', chatId: 'chat-1' });
      }
      await Promise.resolve();
    });

    await send({ type: 'idleExpired', projectId });
    await settle();

    expect(liveProjectIds()).toContain(projectId);
    expect(sessionsActor.getSnapshot().context.refusals[projectId]).toBe(reason);
    expect(sessionsActor.getSnapshot().context.closed[projectId]).toBeUndefined();
  });

  it('asks, cancels, flushes, releases and stops every child on Close (pin d)', async () => {
    render(
      <SessionsProvider>
        <RouteGate projectId='pin-d' />
      </SessionsProvider>,
    );
    await settle();
    const session = sessionsActor.getSnapshot().context.refs['pin-d'];
    expect(session).toBeDefined();
    await act(async () => {
      session?.send({ type: 'runStarted', chatId: 'chat-1' });
      await Promise.resolve();
    });
    const childCount = Object.keys(session?.getSnapshot().children ?? {}).length;
    expect(childCount).toBeGreaterThan(0);

    await send({ type: 'close', projectId: 'pin-d', reason: 'user' });
    await settle();
    /* A live run makes Close a question, not an action (A35). */
    expect(session?.getSnapshot().matches({ closing: 'asking' })).toBe(true);
    expect(liveProjectIds()).toContain('pin-d');

    await act(async () => {
      session?.send({ type: 'confirmClose' });
      await Promise.resolve();
    });
    await settle();

    expect(serviceCalls).toEqual(['pin-d:cancelRuns', 'pin-d:flushSync', 'pin-d:releaseLeases']);
    expect(Object.keys(session?.getSnapshot().children ?? {})).toEqual([]);
    expect(liveProjectIds()).not.toContain('pin-d');
    /* The worker count is back to baseline: every admission has its release. */
    expect(workerFrames).toEqual([
      { type: 'computeStoreAdmission', projectId: 'pin-d' },
      { type: 'computeStoreRelease', projectId: 'pin-d' },
    ]);
  });

  it('runs every session closing before it is quiesced (pin e, D31)', async () => {
    render(
      <SessionsProvider>
        <RouteGate projectId='pin-e-1' />
      </SessionsProvider>,
    );
    await settle();
    await send({ type: 'open', projectId: 'pin-e-2' });
    await settle();
    expect(liveProjectIds()).toEqual(['pin-e-1', 'pin-e-2']);

    await send({ type: 'quit' });
    await settle();

    expect(sessionsActor.getSnapshot().matches('quiesced')).toBe(true);
    expect(emitted).toContainEqual({ type: 'quiesced' });
    /* Quit runs the closing with the sync flush, per session, before it is
     * quiesced — never a bare stop (D31). */
    expect(serviceCalls).toContain('pin-e-1:flushSync');
    expect(serviceCalls.indexOf('pin-e-1:flushSync')).toBeLessThan(serviceCalls.indexOf('pin-e-1:releaseLeases'));
    expect(workerFrames.filter((frame) => frame.type === 'computeStoreRelease')).toHaveLength(2);
  });
});
