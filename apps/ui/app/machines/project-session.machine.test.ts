import { createActor, createCallbackLogic } from 'xstate';
import type { AnyActorRef, AnyEventObject, EventObject } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmFlush, slowWriteMilliseconds } from '#workbench-records/record-health.js';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';

import * as machineModule from './project-session.machine.js';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { StepClock } from '@taucad/xstate-testing/clock';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import {
  isProjectSessionClosable,
  projectSessionCloseRefusal,
  projectSessionIgnoredEvents,
  projectSessionMachine,
} from './project-session.machine.js';
import type {
  ProjectSessionFileManagerInput,
  ProjectSessionMachineEvent,
  ProjectSessionOpenRequest,
  ProjectSessionRegion,
} from './project-session.machine.js';

/** A command the session sends its `project` and `revisions` children, as they read it. */
type Command = EventObject & Readonly<{ requestId: string; kind?: string }>;

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const regions: readonly ProjectSessionRegion[] = ['views', 'runtime', 'agentHost', 'compute'];

/** A started parent that records what the session sends it. */
const recordingParent = (): {
  ref: AnyActorRef & { stop(): void };
  received: Array<EventObject & Record<string, unknown>>;
} => {
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
  readonly flushProducers?: () => Promise<void>;
  readonly failCloseStep?:
    | 'cancelRuns'
    | 'flushProducers'
    | 'closeParameters'
    | 'flushSync'
    | 'closeRuntime'
    | 'releaseAgentHost';
  readonly inspect?: ReturnType<typeof guardActors>['inspect'];
  readonly request?: ProjectSessionOpenRequest;
  /** The session's clock; the test's fake timers by default. */
  readonly clock?: StepClock;
  /** The `project` child never answers a leave or unload flush. */
  readonly holdAskedFlushes?: boolean;
  /** The `project` child never answers the close's `closeParameters`. */
  readonly holdCloseParameters?: boolean;
}) => {
  const order: string[] = [];
  const live = new Set<string>();
  /* What the session handed each child, in order. */
  const received: string[] = [];
  /* A close step's scripted refusal, as its child answers it. */
  const failure = (step: NonNullable<typeof options>['failCloseStep']): { error?: string } =>
    options?.failCloseStep === step ? { error: `${step} failed` } : {};
  const child = (
    name: string,
    region?: ProjectSessionRegion,
    script?: (
      sendBack: (event: AnyEventObject) => void,
      receive: (listener: (event: EventObject) => void) => void,
    ) => void,
  ) =>
    createCallbackLogic<EventObject, { projectId: string }>(({ sendBack, receive }) => {
      receive((event) => {
        /* A6e's rows read the replacement traffic only. */
        if (event.type === 'replaceRuntime' || event.type === 'holdReplacement') {
          received.push(`${name}:${event.type}`);
        }
      });
      order.push(`start:${name}`);
      live.add(name);
      if (region !== undefined && (options?.readyRegions ?? regions).includes(region)) {
        sendBack({ type: 'childReady', region });
      }
      script?.(sendBack, receive);
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
        releaseAgentHost: fromSafeAsync<void, { projectId: string }>(async () => {
          order.push('releaseAgentHost');
          if (options?.failCloseStep === 'releaseAgentHost') {
            throw new Error('releaseAgentHost failed');
          }
        }),
        fileManager: child('fileManager', 'views', (sendBack) => {
          sendBack({ type: 'fileManagerChanged', fileManagerRef: createActor(createCallbackLogic(() => undefined)) });
        }),
        project: child('project', 'runtime', (sendBack, receive) => {
          receive((received) => {
            const event = received as Command;
            if (event.type === 'flushRuntime' && event.kind === 'close') {
              order.push('flushProducers');
              // async-iife: bootstrap -- `receive` is synchronous; the child answers through `sendBack`.
              void (async () => {
                try {
                  await options?.flushProducers?.();
                  sendBack({ type: 'runtimeFlushSettled', requestId: event.requestId, ...failure('flushProducers') });
                } catch (error) {
                  sendBack({
                    type: 'runtimeFlushSettled',
                    requestId: event.requestId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              })();
            } else if (event.type === 'flushRuntime' && options?.holdAskedFlushes !== true) {
              sendBack({ type: 'runtimeFlushSettled', requestId: event.requestId });
            } else if (event.type === 'closeParameters') {
              order.push('closeParameters');
              if (options?.holdCloseParameters !== true) {
                sendBack({ type: 'parametersClosed', requestId: event.requestId, ...failure('closeParameters') });
              }
            } else if (event.type === 'closeRuntime') {
              order.push('closeRuntime');
              sendBack({ type: 'runtimeClosed', requestId: event.requestId, ...failure('closeRuntime') });
            }
          });
        }),
        agentHost: child('agentHost', 'agentHost'),
        compute: child('compute', 'compute'),
        /* The revision client the file manager's change started: its first file check settles at once (A14), and it
         * quiesces the project's sync on the close. */
        revisions: createCallbackLogic<EventObject, ProjectSessionFileManagerInput>(({ sendBack, receive }) => {
          sendBack({ type: 'fileCheckChanged', settled: true, judged: true });
          receive((received) => {
            const event = received as Command;
            if (event.type === 'quiesce') {
              order.push('flushSync');
              sendBack({ type: 'syncQuiesced', requestId: event.requestId, ...failure('flushSync') });
            }
          });
        }),
        hostConnector: createCallbackLogic(() => undefined),
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
        ...(options?.request === undefined ? {} : { request: options.request }),
      },
      ...(options?.inspect === undefined ? {} : { inspect: options.inspect }),
      ...(options?.clock === undefined ? {} : { clock: options.clock }),
    },
  );
  /* R3: what the session told its project's runtime to do, in order. */
  const parking: boolean[] = [];
  actor.on('runtimeParking', (event) => parking.push(event.parked));
  actor.start();
  return { actor, order, live, parking, received };
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

  /* A7c (I15): the close's producer step is an `after` on the session's clock. On main the close awaited the React
   * provider's producer flush with no bound of the session's own, so a store that never settled held the close. */
  it('should leave the close and stay live when its producer flush runs past the bound on the clock (A7c, I15)', async () => {
    const clock = new StepClock();
    const { actor } = harness({
      clock,
      flushProducers: async () =>
        new Promise<void>(() => {
          /* Never lands. */
        }),
    });
    await settle();
    actor.send({ type: 'close', reason: 'user' });
    await settle();
    expect(actor.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    clock.advance(machineModule.projectSessionProducerFlushMilliseconds - 1);
    await settle();
    expect(actor.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);

    clock.advance(1);
    await settle();
    expect(actor.getSnapshot().matches('live')).toBe(true);
    expect(actor.getSnapshot().context.failures['close']).toBe('Project changes are not confirmed saved.');
    actor.stop();
  });

  it('should not close the parameter service when the close flush lands after its bound (A7c review round 1)', async () => {
    const clock = new StepClock();
    let land: () => void = () => undefined;
    const { actor, order } = harness({
      clock,
      flushProducers: async () =>
        new Promise<void>((resolve) => {
          land = resolve;
        }),
    });
    await settle();
    actor.send({ type: 'close', reason: 'user' });
    await settle();

    clock.advance(machineModule.projectSessionProducerFlushMilliseconds);
    await settle();
    expect(actor.getSnapshot().matches('live')).toBe(true);
    /* The flush landing late answers under a close step that is gone: the live session keeps its parameter service. */
    land();
    await settle();
    expect(actor.getSnapshot().matches('live')).toBe(true);
    expect(order).not.toContain('closeParameters');
    expect(order).not.toContain('closeRuntime');
    actor.stop();
  });

  it('should not start the close again once the parameter service is closing, when quit closes it again (A7c review)', async () => {
    const clock = new StepClock();
    const { actor, order } = harness({ clock, holdCloseParameters: true });
    await settle();
    actor.send({ type: 'close', reason: 'user' });
    await settle();
    expect(actor.getSnapshot().matches({ closing: 'closingParameters' })).toBe(true);

    /* Quit closes every session again. A restarted close would flush anew and could expire back to live while this
     * step's parameter close still lands, leaving a live session with its parameter service closed. */
    actor.send({ type: 'close', reason: 'quit' });
    await settle();
    clock.advance(machineModule.projectSessionProducerFlushMilliseconds);
    await settle();
    expect(actor.getSnapshot().matches({ closing: 'closingParameters' })).toBe(true);
    expect(order.filter((step) => step === 'flushProducers')).toHaveLength(1);
    expect(order.filter((step) => step === 'closeParameters')).toHaveLength(1);
    actor.stop();
  });

  it('should refuse an asked flush that runs past the bound on the clock, and ignore its late answer (A7c, I15)', async () => {
    const clock = new StepClock();
    const { actor } = harness({ clock, holdAskedFlushes: true });
    await settle();
    const settled: Array<{ requestId: string; ok: boolean; error?: string }> = [];
    actor.on('flushSettled', (event) =>
      settled.push({
        requestId: event.requestId,
        ok: event.ok,
        ...(event.error === undefined ? {} : { error: event.error }),
      }),
    );
    actor.send({ type: 'flushAsked', requestId: 'leave-1', kind: 'leave' });
    await settle();

    clock.advance(machineModule.projectSessionProducerFlushMilliseconds - 1);
    await settle();
    expect(settled).toEqual([]);

    clock.advance(1);
    await settle();
    actor.send({ type: 'runtimeFlushSettled', requestId: 'leave-1' });
    await settle();
    expect(settled).toEqual([{ requestId: 'leave-1', ok: false, error: 'Project changes are not confirmed saved.' }]);
    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);
    actor.stop();
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

    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1', 'chat-2'], stoppableRuns: ['chat-1', 'chat-2'] });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);

    actor.send({ type: 'projectedRunsChanged', runs: ['chat-2'], stoppableRuns: ['chat-2'] });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);

    actor.send({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
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

    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });

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
    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });

    actor.send({ type: 'close', reason: 'user' });
    expect(actor.getSnapshot().matches({ closing: 'asking' })).toBe(true);

    actor.send({ type: 'cancelClose' });
    expect(actor.getSnapshot().matches({ live: 'busy' })).toBe(true);
    actor.stop();
  });

  it('A6e: should hand replaceRuntime to its project child while opening, live or asking, and not once the close runs', async () => {
    const opening = harness({ readyRegions: [] });
    opening.actor.send({ type: 'replaceRuntime' });
    expect(opening.received).toEqual(['project:replaceRuntime']);
    opening.actor.stop();

    let releaseFlush: () => void = () => undefined;
    const { actor, received } = harness({
      flushProducers: async () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    });
    await settle();
    actor.send({ type: 'replaceRuntime' });
    expect(received).toEqual(['project:replaceRuntime']);

    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });
    actor.send({ type: 'close', reason: 'user' });
    expect(actor.getSnapshot().matches({ closing: 'asking' })).toBe(true);
    /* Entering `asking` hands any held replacement back; a change while it asks is handed on too. */
    actor.send({ type: 'replaceRuntime' });
    expect(received).toEqual(['project:replaceRuntime', 'project:replaceRuntime', 'project:replaceRuntime']);

    actor.send({ type: 'confirmClose' });
    await settle();
    expect(actor.getSnapshot().matches({ closing: 'flushingProducers' })).toBe(true);
    actor.send({ type: 'replaceRuntime' });
    /* The close holds any replacement already handed on, and hands on no other. */
    expect(received).toEqual([
      'project:replaceRuntime',
      'project:replaceRuntime',
      'project:replaceRuntime',
      'project:holdReplacement',
    ]);
    releaseFlush();
    actor.stop();
  });

  it('cancels, flushes and stops every child without a second lease relay (pin d)', async () => {
    const parent = recordingParent();
    const { actor, order, live } = harness({ parentRef: parent.ref });
    await settle();
    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });
    /* Four regions, the session's presence and unload registration, its file check's patience (A14), the file
     * manager's revision client and connector, and no chat: the store owns each chat's root (PV-S5). */
    expect(Object.keys(actor.getSnapshot().children).length).toBe(9);

    actor.send({ type: 'close', reason: 'user' });
    actor.send({ type: 'confirmClose' });
    await settle();
    await settle();
    await settle();

    expect(order.filter((entry) => !entry.startsWith('start:'))).toEqual([
      'cancelRuns:chat-1',
      'flushProducers',
      'closeParameters',
      'flushSync',
      'closeRuntime',
      'releaseAgentHost',
      'stop:project',
      'stop:fileManager',
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
    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });

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

  it('fails the close when a close effect was never provided (PV-S5, MC-R8)', async () => {
    const child = (region: ProjectSessionRegion) =>
      createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
        sendBack({ type: 'childReady', region });
      });
    const actor = createActor(
      projectSessionMachine.provide({
        actors: {
          fileManager: child('views'),
          project: child('runtime'),
          agentHost: child('agentHost'),
          compute: child('compute'),
        },
      }),
      { input: { projectId: 'proj_a' } },
    );
    actor.start();
    await settle();
    expect(actor.getSnapshot().matches({ live: 'idle' })).toBe(true);

    actor.send({ type: 'close', reason: 'user' });
    await settle();

    expect(actor.getSnapshot().matches('closed')).toBe(false);
    expect(actor.getSnapshot().context.failures['close']).toMatch(/not provided/u);
    actor.stop();
  });

  it('should keep resources live after bounded refusal and close only on an explicit retry after late settlement', async () => {
    const pending = Promise.withResolvers<boolean>();
    const parent = recordingParent();
    const { actor, live, order } = harness({
      parentRef: parent.ref,
      flushProducers: async () => confirmFlush(async () => pending.promise, 'Pane layout is not confirmed saved.'),
    });
    try {
      await settle();
      actor.send({ type: 'close', reason: 'user' });
      await settle();
      await vi.advanceTimersByTimeAsync(slowWriteMilliseconds);
      await settle();
      expect(actor.getSnapshot().matches('live')).toBe(true);
      expect(actor.getSnapshot().context.failures['close']).toBe('Pane layout is not confirmed saved.');
      expect(live.size).toBe(4);
      expect(order).not.toContain('flushSync');
      pending.resolve(true);
      await settle();
      expect(actor.getSnapshot().matches('live')).toBe(true);
      expect(parent.received.filter((event) => event.type === 'sessionClosed')).toHaveLength(0);
      actor.send({ type: 'close', reason: 'user' });
      await settle();
      expect(actor.getSnapshot().matches('closed')).toBe(true);
      expect(live.size).toBe(0);
      expect(parent.received.filter((event) => event.type === 'sessionClosed')).toHaveLength(1);
    } finally {
      pending.resolve(true);
      actor.stop();
      parent.ref.stop();
    }
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

  it.each(['cancelRuns', 'flushSync', 'closeRuntime', 'releaseAgentHost'] as const)(
    'keeps resources live and reports failure when %s fails',
    async (failCloseStep) => {
      const parent = recordingParent();
      const { actor, live } = harness({ parentRef: parent.ref, failCloseStep });
      await settle();
      actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });
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

  it('records the revision facts it is told, for the registry (the store forwards them to chats, PV-S5)', async () => {
    const { actor } = harness();
    await settle();

    actor.send({ type: 'revisionState', dirty: true, pushed: false });

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

    /* A state is reported again when its facts change, as `opening` does when the file check starts (A14). */
    const states = parent.received.filter((event) => event.type === 'sessionState').map((event) => event['state']);
    expect(states.filter((state, index) => state !== states[index - 1])).toEqual([
      'opening',
      'live',
      'closing',
      'closed',
    ]);
    actor.stop();
  });

  it('should keep the request it was opened with in context (A5c, R3-F2)', async () => {
    const request = { workspace: 'ws', nativeKernelId: 'build123d', chatId: 'chat-1', epoch: 2 };
    const { actor } = harness({ request });
    await settle();

    expect(actor.getSnapshot().context.request).toEqual(request);
    actor.stop();
  });

  it('should move only the chat fields of its request on chatRequested, in any state', async () => {
    const request = { workspace: 'ws', nativeKernelId: 'build123d', chatId: 'chat-1', epoch: 2 };
    const { actor } = harness({ request, readyRegions: [] });

    actor.send({ type: 'chatRequested', chatId: 'chat-2', createdChatId: 'chat-2' });
    expect(actor.getSnapshot().matches('opening')).toBe(true);
    expect(actor.getSnapshot().context.request).toEqual({ ...request, chatId: 'chat-2', createdChatId: 'chat-2' });

    actor.send({ type: 'chatRequested' });
    expect(actor.getSnapshot().context.request).toEqual({
      ...request,
      chatId: undefined,
      createdChatId: undefined,
    });
    actor.stop();
  });

  it('should keep no request on chatRequested when it was opened without one', async () => {
    const { actor } = harness();
    await settle();
    const before = actor.getSnapshot().context;

    actor.send({ type: 'chatRequested', chatId: 'chat-1' });

    expect(actor.getSnapshot().context).toBe(before);
    expect(actor.getSnapshot().context.request).toBeUndefined();
    actor.stop();
  });

  it('should report its open facts to the registry with every state: chat ready once its runtime says so (M2), the first check settled', async () => {
    const parent = recordingParent();
    const { actor } = harness({ parentRef: parent.ref });
    await settle();
    actor.send({ type: 'revisionState', dirty: true, pushed: false });
    await settle();

    const before = parent.received.filter((event) => event.type === 'sessionState');
    expect(before.length).toBeGreaterThanOrEqual(3);
    for (const report of before) {
      expect(report).toMatchObject({ chatReady: false });
    }
    /* The first check is pending from the file manager's report and settled once its client says so (A14). */
    expect(before.map((report) => report['availability'])).toContain('pending');
    expect(before.at(-1)).toMatchObject({ state: 'live', availability: 'settled' });

    actor.send({ type: 'chatReady' });
    await settle();
    expect(parent.received.findLast((event) => event.type === 'sessionState')).toMatchObject({
      state: 'live',
      chatReady: true,
      availability: 'settled',
    });
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

describe('projectSessionMachine — the machine contract (PV-S5, MC-R17)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers every sampled event, or declares it ignored, in every reachable state', () => {
    const events = [
      { type: 'close', reason: 'user' },
      { type: 'close', reason: 'idle' },
      { type: 'confirmClose' },
      { type: 'cancelClose' },
      ...regions.map((region) => ({ type: 'childReady', region }) as const),
      { type: 'childFailed', region: 'runtime', reason: 'x' },
      { type: 'projectedRunsChanged', runs: ['c'], stoppableRuns: ['c'] },
      { type: 'projectedRunsChanged', runs: [], stoppableRuns: [] },
      { type: 'activity' },
      { type: 'visibilityChanged', visible: true, focused: true },
      { type: 'visibilityChanged', visible: false, focused: false },
      { type: 'attention', count: 1 },
      { type: 'revisionState', dirty: true, pushed: false },
      { type: 'chatRequested', chatId: 'c' },
    ] satisfies ProjectSessionMachineEvent[];
    expect(
      unansweredEvents(projectSessionMachine, {
        input: { projectId: 'p' },
        events,
        limit: 100_000,
        ignore: projectSessionIgnoredEvents,
        serializeState: (snapshot) =>
          JSON.stringify([
            snapshot.value,
            snapshot.context.runs.length,
            snapshot.context.closeReason,
            snapshot.context.openFailed,
          ]),
      }),
    ).toEqual([]);
  });

  it('leaves no dead letter, unanswered delivery or fault from open through a run to close', async () => {
    const guard = guardActors({ ignore: { 'project-session': projectSessionIgnoredEvents } });
    const { actor } = harness({ inspect: guard.inspect });
    await settle();
    actor.send({ type: 'projectedRunsChanged', runs: ['chat-1'], stoppableRuns: ['chat-1'] });
    actor.send({ type: 'projectedRunsChanged', runs: [], stoppableRuns: [] });
    actor.send({ type: 'close', reason: 'user' });
    await settle();
    await settle();
    await settle();
    expect(actor.getSnapshot().matches('closed')).toBe(true);
    actor.stop();
  });
});
