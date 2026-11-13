/* eslint-disable no-await-in-loop -- settling is sequential by nature: each
   microtask turn has to land before the next one starts. */

import { createActor, createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSafeAsync } from '@taucad/ui-core/lib/xstate.lib';

import * as machineModule from './sessions.machine.js';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents } from '@taucad/xstate-testing/paths';
import {
  browserLiveProjectBudget,
  constrainedLiveProjectBudget,
  liveProjectBudgetFor,
  sessionsCloseSuggestions,
  sessionsIgnoredEvents,
  sessionsMachine,
} from './sessions.machine.js';
import type { SessionsMachineEmitted, SessionsMachineEvent } from './sessions.machine.js';
import type { ProjectSessionOpenRequest, ProjectSessionRegion } from './project-session.machine.js';
import { projectSessionIgnoredEvents, projectSessionMachine } from './project-session.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

/**
 * The registry over **real** project sessions with scripted children.
 *
 * A fake session would type-check only by assertion and would not run the real
 * `closing`, which is the half the registry's slot accounting depends on: the
 * slot frees when the child reports `sessionClosed`, not when `close` is sent.
 */
const harness = (options?: {
  readonly budget?: number;
  readonly closeNever?: boolean;
  /** Hold the real close flush until the test releases it. */
  readonly closeFlush?: Promise<void> | (() => Promise<void>);
  /** Hold a producer refusal until navigation has requested the closing project again. */
  readonly producerFlush?: Promise<void>;
  /** The producer flush refuses, as it does while an editor's conflict is being recorded. */
  readonly flushRefuses?: boolean;
  readonly inspect?: ReturnType<typeof guardActors>['inspect'];
}) => {
  const started: string[] = [];
  const stopped: string[] = [];
  const closeSteps: string[] = [];
  const readyChild = (region: ProjectSessionRegion) =>
    createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
      sendBack({ type: 'childReady', region });
      return () => undefined;
    });
  /* The compute child is this session's liveness probe: its cleanup runs when
   * — and only when — the session stops its children. */
  const computeChild = createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    started.push(input.projectId);
    sendBack({ type: 'childReady', region: 'compute' });
    return () => stopped.push(input.projectId);
  });

  const projectSession = projectSessionMachine.provide({
    actors: {
      cancelRuns: fromSafeAsync<void, { projectId: string; runs: readonly string[] }>(async ({ input }) => {
        closeSteps.push(`cancel:${input.projectId}`);
      }),
      flushProducers: fromSafeAsync<void, { projectId: string }>(async ({ input }) => {
        closeSteps.push(`producers:${input.projectId}`);
        await options?.producerFlush;
        if (options?.flushRefuses === true) {
          throw new Error('An editor conflict is being recorded');
        }
      }),
      flushSync: fromSafeAsync<void, { projectId: string; boundMilliseconds: number }>(async ({ input }) => {
        closeSteps.push(`flush:${input.projectId}`);
        await (typeof options?.closeFlush === 'function' ? options.closeFlush() : options?.closeFlush);
        if (options?.closeNever === true) {
          await new Promise<void>(() => {
            /* Never settles: the session that cannot finish closing. */
          });
        }
      }),
      releaseAgentHost: fromSafeAsync<void, { projectId: string }>(async () => undefined),
      fileManager: readyChild('views'),
      project: readyChild('runtime'),
      agentHost: readyChild('agentHost'),
      compute: computeChild,
    },
  });

  const actor = createActor(sessionsMachine.provide({ actors: { projectSession } }), {
    input: options?.budget === undefined ? {} : { budget: options.budget },
    ...(options?.inspect === undefined ? {} : { inspect: options.inspect }),
  });
  const emitted: SessionsMachineEmitted[] = [];
  for (const type of ['liveSetChanged', 'budgetRefused', 'quiesced', 'pendingOpenDropped'] as const) {
    actor.on(type, (event) => emitted.push(event));
  }
  actor.start();
  return { actor, started, stopped, emitted, closeSteps };
};

/** Let the session's own promise actors settle. */
const settle = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await vi.advanceTimersByTimeAsync(0);
  }
};

/** Say what a session's facts are, the way the real child reports them. */
const report = (
  actor: ReturnType<typeof harness>['actor'],
  projectId: string,
  facts?: { runs?: number; dirty?: boolean; pushed?: boolean },
): void => {
  actor.send({
    type: 'sessionState',
    projectId,
    state: 'live',
    runs: facts?.runs ?? 0,
    dirty: facts?.dirty ?? false,
    pushed: facts?.pushed ?? true,
  });
};

const openIdle = async (actor: ReturnType<typeof harness>['actor'], projectId: string): Promise<void> => {
  actor.send({ type: 'open', projectId });
  await settle();
  report(actor, projectId);
};

describe('sessionsMachine', async () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts headlessly and exports exactly one machine value', async () => {
    const { actor } = harness();

    expect(actor.getSnapshot().matches('ready')).toBe(true);
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([sessionsMachine]);

    actor.stop();
  });

  it('opens a project once and treats a second open as a touch (I22)', async () => {
    const { actor, started } = harness();

    actor.send({ type: 'open', projectId: 'projA' });
    actor.send({ type: 'open', projectId: 'projA' });
    await settle();

    expect(started).toEqual(['projA']);
    expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projA']);
    actor.stop();
  });

  it('waits for a closing slot without restarting its flush or closing another live project', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor, started, stopped, closeSteps } = harness({
      budget: 2,
      closeFlush: closeFlush.promise,
      inspect: guard.inspect,
    });
    await openIdle(actor, 'projA');
    await openIdle(actor, 'projB');
    actor.send({ type: 'releaseMemory', keepProjectId: 'projB' });
    await settle();
    expect(closeSteps).toEqual(['cancel:projA', 'producers:projA', 'flush:projA']);

    actor.send({ type: 'open', projectId: 'projC' });
    actor.send({ type: 'releaseMemory', keepProjectId: 'projB' });
    actor.send({ type: 'idleExpired', projectId: 'projA' });
    await settle();
    expect(closeSteps).toEqual(['cancel:projA', 'producers:projA', 'flush:projA']);
    expect(started).toEqual(['projA', 'projB']);
    expect(stopped).toEqual([]);
    expect(actor.getSnapshot().context.pendingOpen?.projectId).toBe('projC');
    expect(sessionsCloseSuggestions(actor.getSnapshot().context)).toEqual(['projB']);

    closeFlush.resolve();
    await settle();
    expect(stopped).toEqual(['projA']);
    expect(started).toEqual(['projA', 'projB', 'projC']);
    expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projB', 'projC']);
    expect(actor.getSnapshot().context.status['projC']?.state).toBe('live');
    expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    actor.stop();
  });

  it('reopens a project requested while its memory close is still flushing', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor, started, stopped } = harness({
      budget: 1,
      closeFlush: closeFlush.promise,
      inspect: guard.inspect,
    });
    await openIdle(actor, 'projA');
    const firstRef = actor.getSnapshot().context.refs['projA'];
    actor.send({ type: 'releaseMemory' });
    await settle();
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');

    actor.send({ type: 'open', projectId: 'projB' });
    actor.send({ type: 'open', projectId: 'projA' });
    actor.send({ type: 'open', projectId: 'projA' });
    expect(started).toEqual(['projA']);
    expect(stopped).toEqual([]);
    expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projA']);

    closeFlush.resolve();
    await settle();

    expect(stopped).toEqual(['projA']);
    expect(started).toEqual(['projA', 'projA']);
    expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projA']);
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('live');
    expect(actor.getSnapshot().context.refs['projA']).not.toBe(firstRef);
    actor.stop();
  });

  it.each(['existing', 'new'] as const)(
    'forgets a queued reopen when navigation selects an %s destination',
    async (destination) => {
      const closeFlush = Promise.withResolvers<void>();
      const guard = guardActors({
        ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
      });
      const { actor, started, stopped } = harness({
        budget: 2,
        closeFlush: closeFlush.promise,
        inspect: guard.inspect,
      });
      await openIdle(actor, 'projA');
      if (destination === 'existing') {
        await openIdle(actor, 'projB');
      }
      actor.send({ type: 'releaseMemory', keepProjectId: 'projB' });
      await settle();
      actor.send({ type: 'open', projectId: 'projA' });
      actor.send({ type: 'open', projectId: 'projB' });
      closeFlush.resolve();
      await settle();

      expect(started).toEqual(['projA', 'projB']);
      expect(stopped).toEqual(['projA']);
      expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projB']);
      expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
      actor.stop();
    },
  );

  it('keeps a reopened project live when its producer refuses close without a stale pending open', async () => {
    const producerFlush = Promise.withResolvers<void>();
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor, started, stopped, emitted } = harness({
      budget: 2,
      producerFlush: producerFlush.promise,
      inspect: guard.inspect,
    });
    await openIdle(actor, 'projA');
    actor.send({ type: 'releaseMemory' });
    await settle();
    actor.send({ type: 'open', projectId: 'projA' });
    producerFlush.reject(new Error('Editor save refused'));
    await settle();

    expect(started).toEqual(['projA']);
    expect(stopped).toEqual([]);
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('live');
    expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    expect(emitted.filter((event) => event.type === 'budgetRefused')).toEqual([]);
    actor.stop();
  });

  it('should retain a failed close and queued reopen until an explicit close retry succeeds', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const flush = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => closeFlush.promise)
      .mockResolvedValue(undefined);
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor, started, stopped, emitted } = harness({
      budget: 1,
      closeFlush: flush,
      inspect: guard.inspect,
    });
    try {
      await openIdle(actor, 'projA');
      const firstRef = actor.getSnapshot().context.refs['projA'];
      actor.send({ type: 'releaseMemory' });
      await settle();
      expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');
      actor.send({ type: 'open', projectId: 'projA' });
      closeFlush.reject(new Error('Sync flush failed'));
      await settle();

      expect(actor.getSnapshot().context.status['projA']?.state).toBe('failed');
      expect(actor.getSnapshot().context.refs['projA']).toBe(firstRef);
      expect(started).toEqual(['projA']);
      expect(stopped).toEqual([]);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(actor.getSnapshot().context.pendingOpen?.projectId).toBe('projA');
      expect(emitted.filter((event) => event.type === 'budgetRefused')).toEqual([
        { type: 'budgetRefused', projectId: 'projA', suggestions: ['projA'] },
      ]);

      actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
      await settle();
      expect(flush).toHaveBeenCalledTimes(2);
      expect(stopped).toEqual(['projA']);
      expect(started).toEqual(['projA', 'projA']);
      expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projA']);
      expect(actor.getSnapshot().context.refs['projA']).not.toBe(firstRef);
      expect(actor.getSnapshot().context.status['projA']?.state).toBe('live');
      expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('drains a closing project at quit without starting its queued reopen', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor, started, stopped } = harness({ budget: 1, closeFlush: closeFlush.promise, inspect: guard.inspect });
    await openIdle(actor, 'projA');
    actor.send({ type: 'releaseMemory' });
    await settle();
    actor.send({ type: 'open', projectId: 'projA' });
    actor.send({ type: 'quit' });
    closeFlush.resolve();
    await settle();

    expect(started).toEqual(['projA']);
    expect(stopped).toEqual(['projA']);
    expect(actor.getSnapshot().matches('quiesced')).toBe(true);
    actor.stop();
  });

  it('keeps both projects live across navigation between them (pin a)', async () => {
    const { actor, started, stopped } = harness();

    actor.send({ type: 'open', projectId: 'projA' });
    const firstRef = actor.getSnapshot().context.refs['projA'];
    actor.send({ type: 'open', projectId: 'projB' });
    actor.send({ type: 'touch', projectId: 'projA' });
    await settle();

    expect(started).toEqual(['projA', 'projB']);
    expect(stopped).toEqual([]);
    expect(actor.getSnapshot().context.refs['projA']).toBe(firstRef);
    actor.stop();
  });

  it('closes the least recently touched idle project for a ninth open (pin b, P47)', async () => {
    const { actor, emitted, started, stopped } = harness();
    for (let index = 0; index < browserLiveProjectBudget; index += 1) {
      await openIdle(actor, `proj${index}`);
    }
    /* Everything but `proj0` has been looked at since it was opened. */
    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      actor.send({ type: 'touch', projectId: `proj${index}` });
    }

    actor.send({ type: 'open', projectId: 'projNinth' });
    await settle();

    /* Room is made, not refused: the ninth opens and the row it replaced says
     * why (`Closed · memory budget · reopen any time`). */
    expect(emitted.find((event) => event.type === 'budgetRefused')).toBeUndefined();
    expect(stopped).toEqual(['proj0']);
    expect(started).toContain('projNinth');
    expect(actor.getSnapshot().context.closed['proj0']?.reason).toBe('budget');
    expect(Object.keys(actor.getSnapshot().context.refs)).toHaveLength(browserLiveProjectBudget);
    actor.stop();
  });

  it('never evicts a project whose editor conflict is being recorded, and refuses when every one is (RV-W5b2 R2-1)', async () => {
    const { actor, emitted, stopped } = harness();
    for (let index = 0; index < browserLiveProjectBudget; index += 1) {
      await openIdle(actor, `proj${index}`);
    }
    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      actor.send({ type: 'touch', projectId: `proj${index}` });
    }
    const recording = (projectId: string): void => {
      actor.getSnapshot().context.refs[projectId]?.send({
        type: 'revisionState',
        dirty: false,
        pushed: true,
        recording: true,
      });
    };
    /* The least recently touched project is the one recording. */
    recording('proj0');

    actor.send({ type: 'open', projectId: 'projNinth' });
    await settle();

    expect(stopped).toEqual(['proj1']);
    expect(actor.getSnapshot().context.refs['proj0']).toBeDefined();

    for (const projectId of Object.keys(actor.getSnapshot().context.refs)) {
      recording(projectId);
    }
    actor.send({ type: 'open', projectId: 'projTenth' });
    await settle();

    expect(emitted.find((event) => event.type === 'budgetRefused')?.projectId).toBe('projTenth');
    expect(stopped).toEqual(['proj1']);
    actor.stop();
  });

  it('refuses a ninth open when nothing is idle, naming the candidates (pin b2, I28)', async () => {
    const { actor, emitted, started } = harness();
    for (let index = 0; index < browserLiveProjectBudget; index += 1) {
      const projectId = `proj${index}`;
      actor.send({ type: 'open', projectId });
      await settle();
      report(actor, projectId, { runs: 1 });
    }

    actor.send({ type: 'open', projectId: 'projNinth' });

    const refusal = emitted.find((event) => event.type === 'budgetRefused');
    expect(refusal?.projectId).toBe('projNinth');
    expect(refusal?.suggestions).toHaveLength(browserLiveProjectBudget);
    expect(started).not.toContain('projNinth');
    actor.stop();
  });

  it.each([
    { label: 'dirty', facts: { dirty: true } },
    { label: 'unpushed', facts: { pushed: false } },
  ])(
    'closes the $label project without asking when another opens on a one-project device (B-08)',
    async ({ facts }) => {
      const { actor, emitted, started, stopped } = harness({ budget: constrainedLiveProjectBudget });
      actor.send({ type: 'open', projectId: 'projFirst' });
      await settle();
      report(actor, 'projFirst', facts);

      actor.send({ type: 'open', projectId: 'projSecond' });
      await settle();

      /* Opening the second project is the only way forward from the first, so it
       * takes the dialog's one answer: the person's own close, flush included (I25). */
      expect(emitted.find((event) => event.type === 'budgetRefused')).toBeUndefined();
      expect(stopped).toEqual(['projFirst']);
      expect(started).toEqual(['projFirst', 'projSecond']);
      expect(actor.getSnapshot().context.closed['projFirst']?.reason).toBe('user');
      expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projSecond']);
      actor.stop();
    },
  );

  it('still asks before stopping a running project on a one-project device (I24)', async () => {
    const { actor, emitted, started, stopped } = harness({ budget: constrainedLiveProjectBudget });
    actor.send({ type: 'open', projectId: 'projFirst' });
    await settle();
    report(actor, 'projFirst', { runs: 1 });

    actor.send({ type: 'open', projectId: 'projSecond' });
    await settle();

    expect(emitted.find((event) => event.type === 'budgetRefused')).toMatchObject({
      projectId: 'projSecond',
      suggestions: ['projFirst'],
    });
    expect(stopped).toEqual([]);
    expect(started).toEqual(['projFirst']);
    actor.stop();
  });

  it('keeps refusing a ninth open in the browser when every project is dirty (desktop budget unchanged)', async () => {
    const { actor, emitted, started } = harness();
    for (let index = 0; index < browserLiveProjectBudget; index += 1) {
      const projectId = `proj${index}`;
      actor.send({ type: 'open', projectId });
      await settle();
      report(actor, projectId, { dirty: true });
    }

    actor.send({ type: 'open', projectId: 'projNinth' });
    await settle();

    expect(emitted.find((event) => event.type === 'budgetRefused')?.projectId).toBe('projNinth');
    expect(started).not.toContain('projNinth');
    actor.stop();
  });

  it('asks the person when the project closed to make room refuses to close (R4)', async () => {
    const { actor, emitted, started, stopped } = harness({ budget: constrainedLiveProjectBudget, flushRefuses: true });
    await openIdle(actor, 'projFirst');

    actor.send({ type: 'open', projectId: 'projSecond' });
    await settle();

    /* The close came back live with its reason recorded; the open is not left
     * waiting on a slot that will never free. */
    expect(stopped).toEqual([]);
    expect(started).toEqual(['projFirst']);
    expect(emitted.find((event) => event.type === 'budgetRefused')).toMatchObject({
      projectId: 'projSecond',
      suggestions: ['projFirst'],
    });
    expect(actor.getSnapshot().context.pendingOpen?.projectId).toBe('projSecond');
    actor.stop();
  });

  it('offers the idle window again once the refusal is gone (R6)', async () => {
    const { actor, stopped } = harness();
    actor.send({ type: 'open', projectId: 'projA' });
    await settle();
    report(actor, 'projA', { runs: 1 });

    actor.send({ type: 'idleExpired', projectId: 'projA' });
    expect(actor.getSnapshot().context.refusals['projA']).toBe('running');
    expect(stopped).toEqual([]);

    /* The run settled: the reason is gone and the row stops saying it. */
    report(actor, 'projA');
    expect(actor.getSnapshot().context.refusals['projA']).toBeUndefined();

    actor.send({ type: 'idleExpired', projectId: 'projA' });
    await settle();
    expect(stopped).toEqual(['projA']);
    expect(actor.getSnapshot().context.closed['projA']?.reason).toBe('idle');
    actor.stop();
  });

  it('suggests only projects a policy could close', async () => {
    const { actor } = harness({ budget: 3 });
    await openIdle(actor, 'projClean');
    actor.send({ type: 'open', projectId: 'projRunning' });
    report(actor, 'projRunning', { runs: 1 });
    actor.send({ type: 'open', projectId: 'projDirty' });
    report(actor, 'projDirty', { dirty: true });

    expect(sessionsCloseSuggestions(actor.getSnapshot().context)).toEqual(['projClean']);
    actor.stop();
  });

  it('never closes a running, dirty or unpushed project on the idle window (pin c)', async () => {
    const { actor, stopped } = harness();
    actor.send({ type: 'open', projectId: 'projRunning' });
    report(actor, 'projRunning', { runs: 1 });
    actor.send({ type: 'open', projectId: 'projDirty' });
    report(actor, 'projDirty', { dirty: true });
    actor.send({ type: 'open', projectId: 'projUnpushed' });
    report(actor, 'projUnpushed', { pushed: false });

    for (const projectId of ['projRunning', 'projDirty', 'projUnpushed']) {
      actor.send({ type: 'idleExpired', projectId });
    }

    expect(stopped).toEqual([]);
    expect(actor.getSnapshot().context.refusals).toEqual({
      projRunning: 'running',
      projDirty: 'dirty',
      projUnpushed: 'unpushed',
    });
    actor.stop();
  });

  it('closes an idle project on the idle window and records the reason', async () => {
    const { actor, stopped } = harness();
    await openIdle(actor, 'projA');

    actor.send({ type: 'idleExpired', projectId: 'projA' });
    await settle();

    expect(stopped).toEqual(['projA']);
    expect(actor.getSnapshot().context.refs).toEqual({});
    expect(actor.getSnapshot().context.closed['projA']?.reason).toBe('idle');
    actor.stop();
  });

  it('clears the closed record and the refusal when the project is opened again', async () => {
    const { actor } = harness();
    await openIdle(actor, 'projA');
    actor.send({ type: 'idleExpired', projectId: 'projA' });
    await settle();
    expect(actor.getSnapshot().context.closed['projA']).toBeDefined();

    actor.send({ type: 'open', projectId: 'projA' });

    expect(actor.getSnapshot().context.closed['projA']).toBeUndefined();
    actor.stop();
  });

  it('announces the live set on every open and close', async () => {
    const { actor, emitted } = harness();
    await openIdle(actor, 'projA');
    await openIdle(actor, 'projB');
    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();

    expect(emitted.filter((event) => event.type === 'liveSetChanged')).toEqual([
      { type: 'liveSetChanged', projectIds: ['projA'] },
      { type: 'liveSetChanged', projectIds: ['projA', 'projB'] },
      { type: 'liveSetChanged', projectIds: ['projB'] },
    ]);
    actor.stop();
  });

  it('runs every session closing before it is quiesced, and quitAnyway short-circuits (pin e)', async () => {
    const closed = harness();
    await openIdle(closed.actor, 'projA');
    await openIdle(closed.actor, 'projB');

    closed.actor.send({ type: 'quit' });
    await settle();

    expect(closed.stopped).toEqual(['projA', 'projB']);
    expect(closed.actor.getSnapshot().matches('quiesced')).toBe(true);
    expect(closed.emitted).toContainEqual({ type: 'quiesced', forced: false });
    closed.actor.stop();

    const stuck = harness({ closeNever: true });
    await openIdle(stuck.actor, 'projA');
    stuck.actor.send({ type: 'quit' });
    await settle();
    expect(stuck.actor.getSnapshot().matches('quitting')).toBe(true);

    stuck.actor.send({ type: 'quitAnyway' });
    expect(stuck.actor.getSnapshot().matches('forced')).toBe(true);
    expect(stuck.emitted).toContainEqual({ type: 'quiesced', forced: true });
    stuck.actor.stop();
  });

  it('does not claim quiescence when a session never finishes closing', async () => {
    const { actor, emitted } = harness({ closeNever: true });
    await openIdle(actor, 'projA');
    actor.send({ type: 'quit' });

    await vi.advanceTimersByTimeAsync(1100);

    expect(actor.getSnapshot().matches('quitting')).toBe(true);
    expect(emitted).not.toContainEqual(expect.objectContaining({ type: 'quiesced' }));
    actor.stop();
  });

  it('quiesces immediately when nothing is live', async () => {
    const { actor } = harness();

    actor.send({ type: 'quit' });

    expect(actor.getSnapshot().matches('quiesced')).toBe(true);
    actor.stop();
  });

  it('ignores a touch or close for a project that is not live', async () => {
    const { actor, stopped } = harness();

    actor.send({ type: 'touch', projectId: 'projMissing' });
    actor.send({ type: 'close', projectId: 'projMissing', reason: 'user' });
    await settle();

    expect(stopped).toEqual([]);
    expect(actor.getSnapshot().context.refs).toEqual({});
    actor.stop();
  });

  it('closes every idle project but the focused one when memory must be freed, and says why (B-08, D-UI-01)', async () => {
    const { actor, stopped } = harness();
    await openIdle(actor, 'projA');
    await openIdle(actor, 'projB');
    await openIdle(actor, 'projC');
    actor.send({ type: 'open', projectId: 'projRunning' });
    await settle();
    report(actor, 'projRunning', { runs: 1 });

    actor.send({ type: 'releaseMemory', keepProjectId: 'projB' });
    await settle();

    expect(stopped.sort()).toEqual(['projA', 'projC']);
    expect(Object.keys(actor.getSnapshot().context.refs).sort()).toEqual(['projB', 'projRunning']);
    expect(actor.getSnapshot().context.closed['projA']?.reason).toBe('memory');
    expect(actor.getSnapshot().context.closed['projC']?.reason).toBe('memory');
    /* A running project is never a policy's to close (I24); its row says why. */
    expect(actor.getSnapshot().context.refusals['projRunning']).toBe('running');
    actor.stop();
  });

  it('releases every idle project when no project is focused (D-MEAS-05)', async () => {
    const { actor, stopped } = harness();
    await openIdle(actor, 'projA');

    actor.send({ type: 'releaseMemory' });
    await settle();

    expect(stopped).toEqual(['projA']);
    expect(actor.getSnapshot().context.refs).toEqual({});
    actor.stop();
  });

  it('budgets one live project on a memory-constrained browser and none on desktop (D-UI-01)', () => {
    expect(liveProjectBudgetFor({ desktop: false, constrained: true })).toBe(constrainedLiveProjectBudget);
    expect(constrainedLiveProjectBudget).toBe(1);
    expect(liveProjectBudgetFor({ desktop: false, constrained: false })).toBe(browserLiveProjectBudget);
    expect(liveProjectBudgetFor({ desktop: true, constrained: true })).toBe(Number.POSITIVE_INFINITY);
  });

  it('holds no function in context', async () => {
    const { actor } = harness();
    await openIdle(actor, 'projA');

    for (const [key, value] of Object.entries(actor.getSnapshot().context)) {
      expect(typeof value, key).not.toBe('function');
    }
    actor.stop();
  });
});

/** A request as focus will build it (R3-F2): the workspace, the S34 kernel id, the route's chat, the answer's epoch. */
const requestFor = (projectId: string, extra?: Partial<ProjectSessionOpenRequest>): ProjectSessionOpenRequest => ({
  workspace: `ws-${projectId}`,
  nativeKernelId: 'build123d',
  chatId: `chat-${projectId}`,
  ...extra,
});

const sessionRequest = (
  actor: ReturnType<typeof harness>['actor'],
  projectId: string,
): ProjectSessionOpenRequest | undefined => actor.getSnapshot().context.refs[projectId]?.getSnapshot().context.request;

describe('sessionsMachine — the open request carrier (A5c, R3-F2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should give the request of an open to the session it spawns', async () => {
    const { actor } = harness();
    const request = requestFor('projA', { createdChatId: 'chat-new', epoch: 3 });

    actor.send({ type: 'open', projectId: 'projA', request });
    await settle();

    expect(sessionRequest(actor, 'projA')).toEqual(request);
    actor.stop();
  });

  it('should spawn a bare open with no request, as the sidebar and the notice send it until A5b', async () => {
    const { actor } = harness();

    await openIdle(actor, 'projA');

    expect(sessionRequest(actor, 'projA')).toBeUndefined();
    actor.stop();
  });

  it('should resume a pending open with the request it came with', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor, started } = harness({ budget: 2, closeFlush: closeFlush.promise });
    await openIdle(actor, 'projA');
    await openIdle(actor, 'projB');
    const request = requestFor('projC');

    actor.send({ type: 'open', projectId: 'projC', request });
    await settle();
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projC', request });
    expect(started).toEqual(['projA', 'projB']);

    closeFlush.resolve();
    await settle();
    expect(started).toEqual(['projA', 'projB', 'projC']);
    expect(sessionRequest(actor, 'projC')).toEqual(request);
    expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    actor.stop();
  });

  it('should keep only the latest destination and its request in the single slot: A to B to C while A closes', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor, started, stopped } = harness({
      budget: constrainedLiveProjectBudget,
      closeFlush: closeFlush.promise,
    });
    await openIdle(actor, 'projA');

    actor.send({ type: 'open', projectId: 'projB', request: requestFor('projB') });
    await settle();
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projB', request: requestFor('projB') });

    actor.send({ type: 'open', projectId: 'projC', request: requestFor('projC') });
    await settle();
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projC', request: requestFor('projC') });

    closeFlush.resolve();
    await settle();
    expect(stopped).toEqual(['projA']);
    expect(started).toEqual(['projA', 'projC']);
    expect(Object.keys(actor.getSnapshot().context.refs)).toEqual(['projC']);
    expect(sessionRequest(actor, 'projC')).toEqual(requestFor('projC'));
    actor.stop();
  });

  it('should keep the request of an open that switch-closes an unpushed project on a one-project device (B-08)', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor, started } = harness({ budget: constrainedLiveProjectBudget, closeFlush: closeFlush.promise });
    actor.send({ type: 'open', projectId: 'projA' });
    await settle();
    report(actor, 'projA', { pushed: false });
    const request = requestFor('projB');

    actor.send({ type: 'open', projectId: 'projB', request });
    await settle();
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projB', request });

    closeFlush.resolve();
    await settle();
    expect(started).toEqual(['projA', 'projB']);
    expect(sessionRequest(actor, 'projB')).toEqual(request);
    actor.stop();
  });

  it('should replace a pending request with a newer open of the same project', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor } = harness({ budget: constrainedLiveProjectBudget, closeFlush: closeFlush.promise });
    await openIdle(actor, 'projA');

    actor.send({ type: 'open', projectId: 'projB', request: requestFor('projB') });
    actor.send({ type: 'open', projectId: 'projB', request: requestFor('projB', { chatId: 'chat-2' }) });
    await settle();
    closeFlush.resolve();
    await settle();

    expect(sessionRequest(actor, 'projB')).toEqual(requestFor('projB', { chatId: 'chat-2' }));
    actor.stop();
  });

  it('should resume a budget-refused open with its request once the person closes a project (R8)', async () => {
    const { actor, started, emitted } = harness({ budget: 2 });
    actor.send({ type: 'open', projectId: 'projA' });
    await settle();
    report(actor, 'projA', { runs: 1 });
    actor.send({ type: 'open', projectId: 'projRun' });
    await settle();
    report(actor, 'projRun', { runs: 1 });
    const request = requestFor('projB');

    actor.send({ type: 'open', projectId: 'projB', request });
    await settle();
    expect(emitted.find((event) => event.type === 'budgetRefused')?.projectId).toBe('projB');
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projB', request });

    report(actor, 'projA');
    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();

    expect(started).toEqual(['projA', 'projRun', 'projB']);
    expect(sessionRequest(actor, 'projB')).toEqual(request);
    actor.stop();
  });

  it('should keep a return to a closing project with its request and resume it once the close lands', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor, started } = harness({ budget: 2, closeFlush: closeFlush.promise });
    await openIdle(actor, 'projA');
    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();
    const request = requestFor('projA', { chatId: 'chat-back' });

    actor.send({ type: 'open', projectId: 'projA', request });
    await settle();
    expect(actor.getSnapshot().context.pendingOpen).toEqual({ projectId: 'projA', request });

    closeFlush.resolve();
    await settle();
    expect(started).toEqual(['projA', 'projA']);
    expect(sessionRequest(actor, 'projA')).toEqual(request);
    actor.stop();
  });

  it('should touch a live project on an open and forward the chat of its request to its session', async () => {
    const { actor, started } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-1' }) });
    await settle();
    const before = actor.getSnapshot().context.touchOrder['projA'] ?? 0;

    actor.send({
      type: 'open',
      projectId: 'projA',
      request: requestFor('projA', { chatId: 'chat-2', createdChatId: 'chat-2', nativeKernelId: 'replicad' }),
    });
    await settle();

    expect(started).toEqual(['projA']);
    expect(actor.getSnapshot().context.touchOrder['projA']).toBeGreaterThan(before);
    /* Only the chat fields move: the session keeps the kernel and workspace it opened with. */
    expect(sessionRequest(actor, 'projA')).toEqual(
      requestFor('projA', { chatId: 'chat-2', createdChatId: 'chat-2', nativeKernelId: 'build123d' }),
    );
    actor.stop();
  });

  it.each([
    ['a chat id alone', { chatId: 'chat-9' }, { chatId: 'chat-9', createdChatId: undefined }],
    ['a created chat id alone', { createdChatId: 'chat-new' }, { chatId: undefined, createdChatId: 'chat-new' }],
  ])('should forward the chat of a live open whose request carries %s', async (_name, chat, expected) => {
    const { actor } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-1' }) });
    await settle();

    actor.send({ type: 'open', projectId: 'projA', request: { workspace: 'ws-projA', ...chat } });
    await settle();

    expect(sessionRequest(actor, 'projA')).toEqual({ ...requestFor('projA'), ...expected });
    actor.stop();
  });

  it('should forward the chat to a closing session, so a return its refused close keeps live holds the new chat', async () => {
    const producerFlush = Promise.withResolvers<void>();
    const { actor } = harness({ producerFlush: producerFlush.promise, flushRefuses: true });
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-1' }) });
    await settle();
    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');

    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-2' }) });
    producerFlush.resolve();
    await settle();

    expect(actor.getSnapshot().context.status['projA']?.state).toBe('live');
    expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    expect(sessionRequest(actor, 'projA')?.chatId).toBe('chat-2');

    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();
    actor.send({ type: 'chatRequested', projectId: 'projA', chatId: 'chat-3' });
    await settle();
    expect(sessionRequest(actor, 'projA')?.chatId).toBe('chat-3');
    actor.stop();
  });

  it('should forward chatRequested from the registry to a session that is closing', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor } = harness({ closeFlush: closeFlush.promise });
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-1' }) });
    await settle();
    actor.send({ type: 'close', projectId: 'projA', reason: 'user' });
    await settle();
    expect(actor.getSnapshot().context.status['projA']?.state).toBe('closing');

    actor.send({ type: 'chatRequested', projectId: 'projA', chatId: 'chat-3' });

    expect(sessionRequest(actor, 'projA')?.chatId).toBe('chat-3');
    closeFlush.resolve();
    actor.stop();
  });

  it('should forward a chatRequested that names no chat, clearing both fields', async () => {
    const { actor } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { createdChatId: 'chat-new' }) });
    await settle();

    actor.send({ type: 'chatRequested', projectId: 'projA' });

    expect(sessionRequest(actor, 'projA')).toEqual({
      workspace: 'ws-projA',
      nativeKernelId: 'build123d',
      chatId: undefined,
      createdChatId: undefined,
    });
    actor.stop();
  });

  it('should only touch a live project on an open whose request carries no chat', async () => {
    const { actor } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { chatId: 'chat-1' }) });
    await settle();

    actor.send({ type: 'open', projectId: 'projA', request: { workspace: 'ws-projA' } });
    actor.send({ type: 'open', projectId: 'projA' });
    await settle();

    expect(sessionRequest(actor, 'projA')).toEqual(requestFor('projA', { chatId: 'chat-1' }));
    actor.stop();
  });

  it('should forward chatRequested to a live session, an undefined chat clearing its field', async () => {
    const { actor } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA', { createdChatId: 'chat-new' }) });
    await settle();

    actor.send({ type: 'chatRequested', projectId: 'projA', chatId: 'chat-2' });
    await settle();

    expect(sessionRequest(actor, 'projA')).toEqual({
      workspace: 'ws-projA',
      nativeKernelId: 'build123d',
      chatId: 'chat-2',
      createdChatId: undefined,
    });
    actor.stop();
  });

  it('should forward both chat fields of chatRequested to a live session', async () => {
    const { actor } = harness();
    actor.send({ type: 'open', projectId: 'projA', request: requestFor('projA') });
    await settle();

    actor.send({ type: 'chatRequested', projectId: 'projA', chatId: 'chat-2', createdChatId: 'chat-3' });
    await settle();

    expect(sessionRequest(actor, 'projA')).toEqual(requestFor('projA', { chatId: 'chat-2', createdChatId: 'chat-3' }));
    actor.stop();
  });

  it('should keep the open facts a session reports on its status', async () => {
    const { actor } = harness();
    await openIdle(actor, 'projA');

    actor.send({
      type: 'sessionState',
      projectId: 'projA',
      state: 'live',
      runs: 0,
      dirty: false,
      pushed: true,
      chatReady: false,
      availability: 'pending',
    });

    expect(actor.getSnapshot().context.status['projA']).toMatchObject({ chatReady: false, availability: 'pending' });
    actor.stop();
  });

  it('should change nothing on chatRequested for a project that is not live (MC-R18)', async () => {
    const { actor, started, emitted } = harness();
    await openIdle(actor, 'projA');
    const before = actor.getSnapshot().context;

    actor.send({ type: 'chatRequested', projectId: 'projGone', chatId: 'chat-1' });
    await settle();

    expect(actor.getSnapshot().context).toBe(before);
    expect(started).toEqual(['projA']);
    expect(emitted.filter((event) => event.type !== 'liveSetChanged')).toEqual([]);
    actor.stop();
  });

  it('should report the open facts of a session on its status: chat ready and the first file check settled', async () => {
    const { actor } = harness();

    actor.send({ type: 'open', projectId: 'projA' });
    await settle();

    expect(actor.getSnapshot().context.status['projA']).toMatchObject({
      state: 'live',
      chatReady: true,
      availability: 'settled',
    });
    actor.stop();
  });
});

describe('sessionsMachine — the stale-epoch resume (A5c, spec-pf RegistryChecksEpoch)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A one-project device whose open of B waits for A's held close, with B's request built at `epoch`. */
  const waitingOpen = async (epoch: number | undefined) => {
    const closeFlush = Promise.withResolvers<void>();
    const registry = harness({ budget: constrainedLiveProjectBudget, closeFlush: closeFlush.promise });
    registry.actor.send({ type: 'libraryEpochChanged', epoch: 1 });
    await openIdle(registry.actor, 'projA');
    registry.actor.send({
      type: 'open',
      projectId: 'projB',
      request: epoch === undefined ? { workspace: 'ws-projB' } : requestFor('projB', { epoch }),
    });
    await settle();
    expect(registry.actor.getSnapshot().context.pendingOpen?.projectId).toBe('projB');
    return { ...registry, release: closeFlush.resolve };
  };

  it('should drop a resumed open whose epoch a library change made stale, and say so to focus', async () => {
    const { actor, started, stopped, emitted, release } = await waitingOpen(1);

    actor.send({ type: 'libraryEpochChanged', epoch: 2 });
    release();
    await settle();

    expect(stopped).toEqual(['projA']);
    expect(started).toEqual(['projA']);
    expect(actor.getSnapshot().context.refs).toEqual({});
    expect(actor.getSnapshot().context.pendingOpen).toBeUndefined();
    expect(emitted.filter((event) => event.type === 'pendingOpenDropped')).toEqual([
      { type: 'pendingOpenDropped', projectId: 'projB', epoch: 1 },
    ]);
    expect(emitted).toContainEqual({ type: 'liveSetChanged', projectIds: [] });
    actor.stop();
  });

  it('should resume a waiting open whose epoch is still current', async () => {
    const { actor, started, emitted, release } = await waitingOpen(1);

    release();
    await settle();

    expect(started).toEqual(['projA', 'projB']);
    expect(sessionRequest(actor, 'projB')).toEqual(requestFor('projB', { epoch: 1 }));
    expect(emitted.filter((event) => event.type === 'pendingOpenDropped')).toEqual([]);
    actor.stop();
  });

  it('should resume a waiting open whose request names no epoch, which it cannot judge', async () => {
    const { actor, started, emitted, release } = await waitingOpen(undefined);

    actor.send({ type: 'libraryEpochChanged', epoch: 2 });
    release();
    await settle();

    expect(started).toEqual(['projA', 'projB']);
    expect(emitted.filter((event) => event.type === 'pendingOpenDropped')).toEqual([]);
    actor.stop();
  });

  it('should drop a waiting open built at an epoch the registry has not heard of, which it cannot judge current', async () => {
    const { actor, started, emitted, release } = await waitingOpen(5);

    release();
    await settle();

    expect(started).toEqual(['projA']);
    expect(emitted.filter((event) => event.type === 'pendingOpenDropped')).toEqual([
      { type: 'pendingOpenDropped', projectId: 'projB', epoch: 5 },
    ]);
    actor.stop();
  });

  it('should drop a waiting open that names an epoch while the registry has heard of none', async () => {
    const closeFlush = Promise.withResolvers<void>();
    const { actor, started, emitted } = harness({
      budget: constrainedLiveProjectBudget,
      closeFlush: closeFlush.promise,
    });
    await openIdle(actor, 'projA');
    actor.send({ type: 'open', projectId: 'projB', request: requestFor('projB', { epoch: 0 }) });
    await settle();

    closeFlush.resolve();
    await settle();

    expect(started).toEqual(['projA']);
    expect(emitted.filter((event) => event.type === 'pendingOpenDropped')).toEqual([
      { type: 'pendingOpenDropped', projectId: 'projB', epoch: 0 },
    ]);
    actor.stop();
  });

  it('should never move its library epoch back on a late report of an older one', () => {
    const { actor } = harness();

    actor.send({ type: 'libraryEpochChanged', epoch: 3 });
    actor.send({ type: 'libraryEpochChanged', epoch: 2 });

    expect(actor.getSnapshot().context.libraryEpoch).toBe(3);
    actor.stop();
  });

  it('should take a fresh open after a drop, so the re-send of focus from its fresh answer goes live', async () => {
    const { actor, started, release } = await waitingOpen(1);
    actor.send({ type: 'libraryEpochChanged', epoch: 2 });
    release();
    await settle();

    actor.send({ type: 'open', projectId: 'projB', request: requestFor('projB', { epoch: 2 }) });
    await settle();

    expect(started).toEqual(['projA', 'projB']);
    expect(sessionRequest(actor, 'projB')).toEqual(requestFor('projB', { epoch: 2 }));
    actor.stop();
  });
});

describe('sessionsMachine — the machine contract (PV-S5, MC-R17)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers every sampled event, or declares it ignored, in every reachable state', () => {
    const events = [
      { type: 'open', projectId: 'a' },
      { type: 'touch', projectId: 'a' },
      { type: 'close', projectId: 'a', reason: 'user' },
      { type: 'idleExpired', projectId: 'a' },
      { type: 'quit' },
      { type: 'quitAnyway' },
      { type: 'cancelPendingOpen' },
      { type: 'releaseMemory', keepProjectId: 'a' },
      { type: 'chatRequested', projectId: 'a', chatId: 'chat-1' },
      { type: 'libraryEpochChanged', epoch: 1 },
    ] satisfies SessionsMachineEvent[];
    expect(
      unansweredEvents(sessionsMachine, {
        input: { budget: 2 },
        events,
        limit: 100_000,
        ignore: sessionsIgnoredEvents,
        serializeState: (snapshot) =>
          JSON.stringify([snapshot.value, Object.keys(snapshot.context.refs as Record<string, unknown>)]),
      }),
    ).toEqual([]);
  });

  it('leaves no dead letter, unanswered delivery or fault from open to close', async () => {
    const guard = guardActors({
      ignore: { sessions: sessionsIgnoredEvents, 'project-session': projectSessionIgnoredEvents },
    });
    const { actor } = harness({ inspect: guard.inspect });
    await openIdle(actor, 'proj_guard');
    actor.send({ type: 'close', projectId: 'proj_guard', reason: 'user' });
    await settle();
    expect(actor.getSnapshot().context.refs['proj_guard']).toBeUndefined();
    actor.stop();
  });
});
