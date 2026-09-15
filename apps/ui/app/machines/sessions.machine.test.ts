/* eslint-disable no-await-in-loop -- settling is sequential by nature: each
   microtask turn has to land before the next one starts. */

import { createActor, fromCallback } from 'xstate';
import type { EventObject } from 'xstate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromSafeAsync } from '#lib/xstate.lib.js';

import * as machineModule from './sessions.machine.js';
import { browserLiveProjectBudget, sessionsCloseSuggestions, sessionsMachine } from './sessions.machine.js';
import type { SessionsMachineEmitted } from './sessions.machine.js';
import { projectSessionMachine } from './project-session.machine.js';
import type { ProjectSessionRegion } from './project-session.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

/**
 * The registry over **real** project sessions with scripted children.
 *
 * A fake session would type-check only by assertion and would not run the real
 * `closing`, which is the half the registry's slot accounting depends on: the
 * slot frees when the child reports `sessionClosed`, not when `close` is sent.
 */
const harness = (options?: { readonly budget?: number; readonly closeNever?: boolean }) => {
  const started: string[] = [];
  const stopped: string[] = [];
  const readyChild = (region: ProjectSessionRegion) =>
    fromCallback<EventObject, { projectId: string }>(({ sendBack }) => {
      sendBack({ type: 'childReady', region });
      return () => undefined;
    });
  /* The compute child is this session's liveness probe: its cleanup runs when
   * — and only when — the session stops its children. */
  const computeChild = fromCallback<EventObject, { projectId: string }>(({ input, sendBack }) => {
    started.push(input.projectId);
    sendBack({ type: 'childReady', region: 'compute' });
    return () => stopped.push(input.projectId);
  });

  const projectSession = projectSessionMachine.provide({
    actors: {
      cancelRuns: fromSafeAsync<void, { projectId: string; runs: readonly string[] }>(async () => undefined),
      flushProducers: fromSafeAsync<void, { projectId: string }>(async () => undefined),
      flushSync: fromSafeAsync<void, { projectId: string; boundMilliseconds: number }>(async () => {
        if (options?.closeNever === true) {
          await new Promise<void>(() => {
            /* Never settles: the session that cannot finish closing. */
          });
        }
      }),
      releaseLeases: fromSafeAsync<void, { projectId: string }>(async () => undefined),
      releaseAgentHost: fromSafeAsync<void, { projectId: string }>(async () => undefined),
      fileManager: readyChild('views'),
      project: readyChild('runtime'),
      agentHost: readyChild('agentHost'),
      compute: computeChild,
    },
  });

  const actor = createActor(sessionsMachine.provide({ actors: { projectSession } }), {
    input: { ...(options?.budget === undefined ? {} : { budget: options.budget }), quitBoundMilliseconds: 1000 },
  });
  const emitted: SessionsMachineEmitted[] = [];
  for (const type of ['liveSetChanged', 'budgetRefused', 'quiesced'] as const) {
    actor.on(type, (event) => emitted.push(event));
  }
  actor.start();
  return { actor, started, stopped, emitted };
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
    expect(closed.emitted).toContainEqual({ type: 'quiesced' });
    closed.actor.stop();

    const stuck = harness({ closeNever: true });
    await openIdle(stuck.actor, 'projA');
    stuck.actor.send({ type: 'quit' });
    await settle();
    expect(stuck.actor.getSnapshot().matches('quitting')).toBe(true);

    stuck.actor.send({ type: 'quitAnyway' });
    expect(stuck.actor.getSnapshot().matches('quiesced')).toBe(true);
    stuck.actor.stop();
  });

  it('quiesces at the bound when a session never finishes closing', async () => {
    const { actor, emitted } = harness({ closeNever: true });
    await openIdle(actor, 'projA');
    actor.send({ type: 'quit' });

    await vi.advanceTimersByTimeAsync(1100);

    expect(actor.getSnapshot().matches('quiesced')).toBe(true);
    expect(emitted).toContainEqual({ type: 'quiesced' });
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

  it('holds no function in context', async () => {
    const { actor } = harness();
    await openIdle(actor, 'projA');

    for (const [key, value] of Object.entries(actor.getSnapshot().context)) {
      expect(typeof value, key).not.toBe('function');
    }
    actor.stop();
  });
});
