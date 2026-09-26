import { createActor, createCallbackLogic } from 'xstate';
import type { AnyActorRef, EventObject } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSafeAsync } from '#lib/xstate.lib.js';

import * as machineModule from './project-session.machine.js';
import {
  isProjectSessionClosable,
  projectSessionCloseRefusal,
  projectSessionMachine,
} from './project-session.machine.js';
import type { ProjectSessionRegion } from './project-session.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const regions: readonly ProjectSessionRegion[] = ['views', 'runtime', 'agentHost', 'compute'];

/** A started parent that records what the session sends it. */
const recordingParent = (): { ref: AnyActorRef; received: Array<EventObject & Record<string, unknown>> } => {
  const received: Array<EventObject & Record<string, unknown>> = [];
  const ref = createActor(
    createCallbackLogic<EventObject>(({ receive }) => {
      receive((event) => received.push(event as EventObject & Record<string, unknown>));
    }),
  );
  ref.start();
  return { ref, received };
};

/**
 * One session over scripted children.
 *
 * Every child is a callback actor that records that it started and stopped, so
 * "stops every child" is asserted against the actor system rather than a flag.
 */
const harness = (options?: {
  readonly readyRegions?: readonly ProjectSessionRegion[];
  readonly parentRef?: AnyActorRef;
  readonly failCloseStep?: 'cancelRuns' | 'flushProducers' | 'flushSync' | 'releaseLeases' | 'releaseAgentHost';
}) => {
  const order: string[] = [];
  const live = new Set<string>();
  const child = (name: string, region?: ProjectSessionRegion) =>
    createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
      order.push(`start:${name}`);
      live.add(name);
      if (region !== undefined && (options?.readyRegions ?? regions).includes(region)) {
        sendBack({ type: 'childReady', region });
      }
      return () => {
        order.push(`stop:${name}`);
        live.delete(name);
      };
    });

  const actor = createActor(
    projectSessionMachine.provide({
      actors: {
        cancelRuns: fromSafeAsync<void, { projectId: string; runs: readonly string[] }>(async ({ input }) => {
          order.push(`cancelRuns:${input.runs.join(',')}`);
          if (options?.failCloseStep === 'cancelRuns') {
            throw new Error('cancelRuns failed');
          }
        }),
        flushProducers: fromSafeAsync<void, { projectId: string }>(async () => {
          order.push('flushProducers');
          if (options?.failCloseStep === 'flushProducers') {
            throw new Error('flushProducers failed');
          }
        }),
        flushSync: fromSafeAsync<void, { projectId: string; boundMilliseconds: number }>(async () => {
          order.push('flushSync');
          if (options?.failCloseStep === 'flushSync') {
            throw new Error('flushSync failed');
          }
        }),
        releaseLeases: fromSafeAsync<void, { projectId: string }>(async () => {
          order.push('releaseLeases');
          if (options?.failCloseStep === 'releaseLeases') {
            throw new Error('releaseLeases failed');
          }
        }),
        releaseAgentHost: fromSafeAsync<void, { projectId: string }>(async () => {
          order.push('releaseAgentHost');
          if (options?.failCloseStep === 'releaseAgentHost') {
            throw new Error('releaseAgentHost failed');
          }
        }),
        fileManager: child('fileManager', 'views'),
        project: child('project', 'runtime'),
        agentHost: child('agentHost', 'agentHost'),
        compute: child('compute', 'compute'),
      },
    }),
    {
      input: {
        projectId: 'proj_a',
        idleWindowMilliseconds: 1000,
        parkWindowMilliseconds: 200,
        startBoundMilliseconds: 500,
        closeFlushMilliseconds: 100,
        ...(options?.parentRef === undefined ? {} : { parentRef: options.parentRef }),
      },
    },
  );
  /* R3: what the session told its project's runtime to do, in order. */
  const parking: boolean[] = [];
  actor.on('runtimeParking', (event) => parking.push(event.parked));
  actor.start();
  return { actor, order, live, parking };
};

const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

describe('projectSessionMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports exactly one machine value', () => {
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([projectSessionMachine]);
  });

  /* P48: `opening` has no `pulling`. The open pull's gate is `sync.machine`'s
   * and the Files tree's; a second copy here waited on nothing. */
  it('starts its regions as soon as it opens, with nothing to wait for (P48)', async () => {
    const { actor, order } = harness();

    /* No `opening.pulling`: the children are spawned on the first tick and the
     * only thing that has run is starting them. */
    expect(order.filter((entry) => entry.startsWith('start:'))).toEqual([
      'start:fileManager',
      'start:project',
      'start:agentHost',
      'start:compute',
    ]);
    expect(order.filter((entry) => !entry.startsWith('start:'))).toEqual([]);
    actor.stop();
  });

  it('starts the four regions, then goes live when each child reports ready', async () => {
    const { actor, order } = harness();
    await settle();

    expect(order.filter((entry) => entry.startsWith('start:'))).toEqual([
      'start:fileManager',
      'start:project',
      'start:agentHost',
      'start:compute',
    ]);
    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);
    actor.stop();
  });

  it('fails the session when a region never comes up, naming the region', async () => {
    const { actor } = harness({ readyRegions: ['views', 'runtime', 'compute'] });
    await settle();
    await vi.advanceTimersByTimeAsync(600);

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.failures).toEqual({ agentHost: 'timeout' });
    actor.stop();
  });

  it('fails the session when a child reports its own failure', async () => {
    const { actor } = harness({ readyRegions: ['views', 'runtime', 'compute'] });
    await settle();
    actor.send({ type: 'childFailed', region: 'agentHost', reason: 'worker refused' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.failures).toEqual({ agentHost: 'worker refused' });
    actor.stop();
  });

  /* R4: the desktop's fork guard refuses a kernel utility long after the
   * project opened, so a failure reported while live has to be recorded — the
   * sidebar row reads `failures` — without moving the session. */
  it('records a region failure reported while it is live, and clears it when the region returns', async () => {
    const { actor } = harness();
    await settle();
    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);

    actor.send({
      type: 'childFailed',
      region: 'runtime',
      reason:
        'Electron main refused the tau:runtime:port request: registerElectronRuntimeMain: refusing to exceed 64 utility processes',
    });

    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.failures['runtime']).toContain('refusing to exceed 64 utility processes');

    actor.send({ type: 'childReady', region: 'runtime' });
    expect(actor.getSnapshot().context.failures).toEqual({});
    actor.stop();
  });

  /*
   * V2-1, and the blueprint's own case: the ninth project's fork is refused
   * milliseconds after the unit mounts, while the session is still `opening`
   * and its runtime region has already reported ready off the manifest load.
   * The refusal has to survive that window, and the project still opens —
   * everything but its kernel came up.
   */
  it('records a refusal that arrives while it is still opening, and still goes live', async () => {
    const { actor } = harness({ readyRegions: ['views', 'runtime'] });
    await settle();
    expect(actor.getSnapshot().matches({ opening: 'starting' })).toBe(true);

    actor.send({ type: 'childFailed', region: 'runtime', reason: 'refusing to exceed 64 utility processes' });
    actor.send({ type: 'childReady', region: 'agentHost' });
    actor.send({ type: 'childReady', region: 'compute' });
    await settle();

    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.failures['runtime']).toBe('refusing to exceed 64 utility processes');

    actor.send({ type: 'childReady', region: 'runtime' });
    expect(actor.getSnapshot().context.failures).toEqual({});
    actor.stop();
  });

  /* A session that never opened keeps the reason it failed with: `failed` is
   * terminal for admission — the person reopens the project, which is a new
   * session — so a region coming back must not leave a red row saying nothing. */
  it('keeps its reason after it failed to open, whatever a region reports later', async () => {
    const { actor } = harness({ readyRegions: ['views', 'runtime', 'compute'] });
    await settle();
    actor.send({ type: 'childFailed', region: 'agentHost', reason: 'worker refused' });
    await settle();
    expect(actor.getSnapshot().matches('failed')).toBe(true);

    actor.send({ type: 'childReady', region: 'agentHost' });

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.failures).toEqual({ agentHost: 'worker refused' });
    actor.stop();
  });

  /* V2-9: a region that failed during `opening` may report ready before the
   * last sibling finalises the open; the session still fails, and must still
   * say why. */
  it("keeps a failed region's reason when it reports ready before the open settles", async () => {
    const { actor } = harness({ readyRegions: ['views', 'runtime'] });
    await settle();
    actor.send({ type: 'childFailed', region: 'agentHost', reason: 'worker refused' });
    await settle();
    expect(actor.getSnapshot().matches('opening')).toBe(true);

    actor.send({ type: 'childReady', region: 'agentHost' });
    actor.send({ type: 'childReady', region: 'compute' });
    await settle();

    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.failures).toEqual({ agentHost: 'worker refused' });
    actor.stop();
  });

  it('is busy while a run is in flight and idle again when the last one settles', async () => {
    const { actor } = harness();
    await settle();

    actor.send({ type: 'runStarted', chatId: 'chat-1' });
    actor.send({ type: 'runStarted', chatId: 'chat-2' });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);

    actor.send({ type: 'runSettled', chatId: 'chat-1' });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);

    actor.send({ type: 'runSettled', chatId: 'chat-2' });
    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);
    expect(actor.getSnapshot().context.runs).toEqual([]);
    actor.stop();
  });

  it('tells the registry the idle window expired, and restarts it on activity', async () => {
    const parent = recordingParent();
    const { actor } = harness({ parentRef: parent.ref });
    await settle();

    await vi.advanceTimersByTimeAsync(900);
    actor.send({ type: 'activity' });
    await vi.advanceTimersByTimeAsync(900);

    expect(parent.received.filter((event) => event.type === 'idleExpired')).toEqual([]);

    await vi.advanceTimersByTimeAsync(200);
    expect(parent.received).toContainEqual({ type: 'idleExpired', projectId: 'proj_a' });
    actor.stop();
  });

  it('suspends hidden-idle expiry while visible and restarts it when hidden', async () => {
    const parent = recordingParent();
    const { actor } = harness({ parentRef: parent.ref });
    await settle();
    actor.send({ type: 'visibilityChanged', visible: true });

    await vi.advanceTimersByTimeAsync(2000);
    expect(parent.received.some((event) => event.type === 'idleExpired')).toBe(false);

    actor.send({ type: 'visibilityChanged', visible: false });
    await vi.advanceTimersByTimeAsync(999);
    expect(parent.received.some((event) => event.type === 'idleExpired')).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(parent.received).toContainEqual({ type: 'idleExpired', projectId: 'proj_a' });
    actor.stop();
  });

  /* R3: process memory, not session state. The 30-minute window above closes the
   * session; this releases the kernel processes of a project nobody is looking at
   * and keeps the session, its editor and its sidebar row exactly as they were. */
  it('parks a hidden idle runtime once the grace elapses, and only once', async () => {
    const { actor, parking } = harness();
    await settle();

    await vi.advanceTimersByTimeAsync(199);
    expect(parking).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(parking).toEqual([true]);

    /* Still hidden, still idle: no second park before the idle window re-arms. */
    await vi.advanceTimersByTimeAsync(700);
    expect(parking).toEqual([true]);
    actor.stop();
  });

  /* V1-7: `visible` is `focused && the window is on screen`, so minimising Tau
   * hides every project. The one the person navigated to keeps its kernels. */
  it('never parks the focused project when the window itself is hidden', async () => {
    const { actor, parking } = harness();
    await settle();
    actor.send({ type: 'visibilityChanged', visible: false, focused: true });

    await vi.advanceTimersByTimeAsync(900);

    expect(parking.includes(true)).toBe(false);
    /* EQ15 still sees a hidden session: the close window is untouched. */
    expect(actor.getSnapshot().context.visible).toBe(false);
    actor.stop();
  });

  it('never parks a visible project (Q2 — visibility is the intent)', async () => {
    const { actor, parking } = harness();
    await settle();
    actor.send({ type: 'visibilityChanged', visible: true });

    await vi.advanceTimersByTimeAsync(900);

    expect(parking.includes(true)).toBe(false);
    actor.stop();
  });

  it('resumes the runtime when the person comes back, and not on another hidden report', async () => {
    const { actor, parking } = harness();
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    expect(parking).toEqual([true]);

    actor.send({ type: 'visibilityChanged', visible: false });
    expect(parking).toEqual([true]);

    actor.send({ type: 'visibilityChanged', visible: true });
    expect(parking).toEqual([true, false]);
    actor.stop();
  });

  it('resumes the runtime when a run starts, looked at or not', async () => {
    const { actor, parking } = harness();
    await settle();
    await vi.advanceTimersByTimeAsync(200);

    actor.send({ type: 'runStarted', chatId: 'chat-1' });

    expect(parking).toEqual([true, false]);
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);
    actor.stop();
  });

  it('re-offers the park when the idle window re-arms, so a busy unit gets another chance', async () => {
    const { actor, parking } = harness();
    await settle();

    /* The 30-minute window fires, re-enters `idle` and rearms both delays. */
    await vi.advanceTimersByTimeAsync(1200);

    expect(parking).toEqual([true, true]);
    actor.stop();
  });

  it('asks before closing a project with a live run, and a cancel keeps it live', async () => {
    const { actor } = harness();
    await settle();
    actor.send({ type: 'runStarted', chatId: 'chat-1' });

    actor.send({ type: 'close', reason: 'user' });
    expect(actor.getSnapshot().matches({ closing: 'asking' })).toBe(true);

    actor.send({ type: 'cancelClose' });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);
    actor.stop();
  });

  it('cancels, flushes, releases and stops every child in that order (pin d)', async () => {
    const parent = recordingParent();
    const { actor, order, live } = harness({ parentRef: parent.ref });
    await settle();
    actor.send({ type: 'runStarted', chatId: 'chat-1' });
    actor.send({ type: 'openChat', chatId: 'chat-1' });
    expect(Object.keys(actor.getSnapshot().children).length).toBe(5);

    actor.send({ type: 'close', reason: 'user' });
    actor.send({ type: 'confirmClose' });
    await settle();
    await settle();
    await settle();

    expect(order.filter((entry) => !entry.startsWith('start:'))).toEqual([
      'cancelRuns:chat-1',
      'flushProducers',
      'flushSync',
      'releaseLeases',
      'releaseAgentHost',
      'stop:fileManager',
      'stop:project',
      'stop:agentHost',
      'stop:compute',
    ]);
    expect(live.size).toBe(0);
    expect(Object.keys(actor.getSnapshot().children)).toEqual([]);
    expect(actor.getSnapshot().matches('closed')).toBe(true);
    expect(parent.received).toContainEqual({ type: 'sessionClosed', projectId: 'proj_a', reason: 'user' });
    actor.stop();
  });

  it('never asks on a policy or quit close', async () => {
    const { actor } = harness();
    await settle();
    actor.send({ type: 'runStarted', chatId: 'chat-1' });

    actor.send({ type: 'close', reason: 'quit' });
    await settle();

    expect(actor.getSnapshot().matches({ closing: 'asking' })).toBe(false);
    actor.stop();
  });

  it('closes straight through when nothing is running', async () => {
    const { actor, order } = harness();
    await settle();

    actor.send({ type: 'close', reason: 'idle' });
    await settle();
    await settle();
    await settle();

    expect(order).toContain('flushSync');
    expect(actor.getSnapshot().matches('closed')).toBe(true);
    actor.stop();
  });

  it('stays live with a retryable close when a producer refuses to flush', async () => {
    const parent = recordingParent();
    const { actor, live, order } = harness({ parentRef: parent.ref, failCloseStep: 'flushProducers' });
    await settle();
    actor.send({ type: 'close', reason: 'quit' });
    await settle();
    await settle();

    expect(actor.getSnapshot().matches('live')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      closeReason: undefined,
      failures: { close: 'flushProducers failed' },
    });
    expect(live.size).toBe(4);
    actor.send({ type: 'close', reason: 'quit' });
    await settle();
    await settle();
    expect(order.filter((entry) => entry === 'flushProducers')).toHaveLength(2);
    expect(parent.received.some((event) => event.type === 'sessionClosed')).toBe(false);
    actor.stop();
  });

  it.each(['cancelRuns', 'flushSync', 'releaseLeases', 'releaseAgentHost'] as const)(
    'keeps resources live and reports failure when %s fails',
    async (failCloseStep) => {
      const parent = recordingParent();
      const { actor, live } = harness({ parentRef: parent.ref, failCloseStep });
      await settle();
      actor.send({ type: 'runStarted', chatId: 'chat-1' });
      actor.send({ type: 'close', reason: 'quit' });
      await settle();
      await settle();
      await settle();

      expect(actor.getSnapshot().matches('failed')).toBe(true);
      expect(actor.getSnapshot().context.failures['close']).toBe(`${failCloseStep} failed`);
      expect(live.size).toBe(4);
      expect(parent.received.some((event) => event.type === 'sessionClosed')).toBe(false);
      actor.stop();
    },
  );

  it('owns one chat session per chat, and drops it when the chat closes', async () => {
    const { actor } = harness();
    await settle();

    actor.send({ type: 'openChat', chatId: 'chat-1' });
    actor.send({ type: 'openChat', chatId: 'chat-1' });
    expect(Object.keys(actor.getSnapshot().context.chatRefs)).toEqual(['chat-1']);

    actor.send({ type: 'chatClosed', chatId: 'chat-1' });
    expect(actor.getSnapshot().context.chatRefs).toEqual({});
    actor.stop();
  });

  it('fans the revision facet out to its chat sessions', async () => {
    const { actor } = harness();
    await settle();
    actor.send({ type: 'openChat', chatId: 'chat-1' });

    actor.send({ type: 'revisionState', dirty: true, pushed: false });

    const chatRef = actor.getSnapshot().context.chatRefs['chat-1']!;
    const value = chatRef.getSnapshot().value as { revision: Record<string, string> };
    expect(value.revision['tree']).toBe('dirty');
    expect(value.revision['sync']).toBe('pending');
    expect(actor.getSnapshot().context.dirty).toBe(true);
    expect(actor.getSnapshot().context.pushed).toBe(false);
    actor.stop();
  });

  it('reports every state it reaches to the registry', async () => {
    const parent = recordingParent();
    const { actor } = harness({ parentRef: parent.ref });
    await settle();
    actor.send({ type: 'close', reason: 'budget' });
    await settle();
    await settle();
    await settle();

    expect(parent.received.filter((event) => event.type === 'sessionState').map((event) => event['state'])).toEqual([
      'opening',
      'live',
      'closing',
      'closed',
    ]);
    actor.stop();
  });

  it('stops every child when the actor itself is stopped', async () => {
    const { actor, live } = harness();
    await settle();
    expect(live.size).toBe(4);

    actor.stop();

    expect(live.size).toBe(0);
  });

  it('answers the registry policies from its own facts', () => {
    const base = {
      runs: [] as readonly string[],
      dirty: false,
      pushed: true,
    } as unknown as Parameters<typeof isProjectSessionClosable>[0];

    expect(isProjectSessionClosable(base)).toBe(true);
    expect(projectSessionCloseRefusal(base)).toBeUndefined();
    expect(projectSessionCloseRefusal({ ...base, runs: ['chat-1'] })).toBe('running');
    expect(projectSessionCloseRefusal({ ...base, dirty: true })).toBe('dirty');
    expect(projectSessionCloseRefusal({ ...base, pushed: false })).toBe('unpushed');
  });

  it('holds no function in context', async () => {
    const { actor } = harness();
    await settle();

    for (const [key, value] of Object.entries(actor.getSnapshot().context)) {
      expect(typeof value, key).not.toBe('function');
    }
    actor.stop();
  });
});
