/*
 * `projectHost` over faked effects (W6 RH-S5): each effect records its arguments, the test plays the outcomes the
 * composition would send, and every step runs through `validated(...)` under `guardActors` (MC-R23, MC-R30).
 *
 * Path table (the shortest events that reach each state from `opening`):
 * 1. opening — (start)
 * 2. serving — opened{1}
 * 3. draining — opened{1}, connect{1}, release{1}
 * 4. closing — opened{1}, connect{1}, release{1}, quiescent{1}
 * 5. closed — opened{1}, connect{1}, release{1}, quiescent{1}, closed{1}
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createActor } from 'xstate';
import type { AnyEventObject } from 'xstate';
import { describe, expect, it } from 'vitest';

import { checkActionCorrespondence, machineActions, specOperators } from '@taucad/formal/drift';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import type { PathOptions } from '@taucad/xstate-testing/paths';

import { projectHostIgnoredEvents, projectHostMachine } from '#project-host.machine.js';
import type { ProjectHostEffectArgs } from '#project-host.machine.js';

const start = (
  overrides: Partial<{ [K in keyof ProjectHostEffectArgs]: (args: ProjectHostEffectArgs[K]) => void }> = {},
) => {
  const effects: { [K in keyof ProjectHostEffectArgs]: Array<ProjectHostEffectArgs[K]> } = {
    open: [],
    serve: [],
    refuse: [],
    drain: [],
    close: [],
  };
  const guard = guardActors({ ignore: projectHostIgnoredEvents });
  const actor = createActor(
    validated(
      projectHostMachine.provide({
        actions: {
          open: (args) => {
            effects.open.push(args);
          },
          serve: (args) => {
            effects.serve.push(args);
            overrides.serve?.(args);
          },
          refuse: (args) => {
            effects.refuse.push(args);
          },
          drain: (args) => {
            effects.drain.push(args);
          },
          close: (args) => {
            effects.close.push(args);
          },
        },
      }),
    ),
    { input: { root: '/home/bracket' }, inspect: guard.inspect },
  );
  const emitted = recordEmitted(actor);
  actor.subscribe({ error: () => undefined });
  actor.start();
  const of = <K extends keyof ProjectHostEffectArgs>(name: K): Array<ProjectHostEffectArgs[K]> => effects[name];
  return { actor, emitted, effects, of, guard };
};

type Harness = ReturnType<typeof start>;

/* Open the first host and serve one connection under `gen`. */
const serving = (harness: Harness, gen = 1): void => {
  harness.actor.send({ type: 'opened', incarnation: 1 });
  harness.actor.send({ type: 'connect', gen, connectionId: `connection-${String(gen)}` });
};

describe('projectHost', () => {
  /* RH-A5: main keeps the generation monotone, so a release that outlived its deadline names an older one. */
  it('should ignore a release from an older generation', () => {
    const harness = start();
    serving(harness, 1);
    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });

    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    expect(harness.emitted).toEqual([{ type: 'released', requestId: 'release-1', outcome: 'stale', message: null }]);
    expect(harness.actor.getSnapshot().matches('serving')).toBe(true);
    expect(harness.actor.getSnapshot().hasTag('accepting')).toBe(true);
    expect(harness.of('drain')).toEqual([]);
    expect(harness.of('close')).toEqual([]);
    expect(harness.of('serve')).toEqual([{ connectionId: 'connection-1' }, { connectionId: 'remount' }]);
  });

  /* RH-A20: a released host serves on until its runs end and settle; only then does its close begin. */
  it('should drain a released project host until its runs settle', () => {
    const harness = start();
    serving(harness, 1);

    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    expect(harness.actor.getSnapshot().matches('draining')).toBe(true);
    expect(harness.of('drain')).toEqual([{ drain: 1 }]);
    expect(harness.of('close')).toEqual([]);

    /* A remount while the runs are live is served on the same host; the release it outran is answered. */
    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });
    expect(harness.actor.getSnapshot().matches('serving')).toBe(true);
    expect(harness.of('open')).toEqual([{ incarnation: 1 }]);
    expect(harness.emitted).toEqual([{ type: 'released', requestId: 'release-1', outcome: 'stale', message: null }]);

    harness.actor.send({ type: 'release', gen: 2, requestId: 'release-2' });
    /* The first drain's late answer is stale: the host keeps draining for the second release. */
    harness.actor.send({ type: 'quiescent', drain: 1 });
    expect(harness.actor.getSnapshot().matches('draining')).toBe(true);
    expect(harness.of('close')).toEqual([]);

    harness.actor.send({ type: 'quiescent', drain: 2 });
    expect(harness.actor.getSnapshot().matches('closing')).toBe(true);
    expect(harness.of('close')).toEqual([{ incarnation: 1 }]);

    harness.actor.send({ type: 'closed', incarnation: 1, message: null });
    expect(harness.actor.getSnapshot().status).toBe('done');
    expect(harness.emitted.at(-1)).toEqual({
      type: 'released',
      requestId: 'release-2',
      outcome: 'closed',
      message: null,
    });
  });

  /* RH-A5 / FixUtil: a connect that arrives while the host closes is never served on the closing host. */
  it('should serve a connect that arrives while the host closes on a fresh host', () => {
    const harness = start();
    serving(harness, 1);
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    harness.actor.send({ type: 'quiescent', drain: 1 });

    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });
    harness.actor.send({ type: 'release', gen: 1, requestId: 'late-release' });
    expect(harness.of('serve')).toEqual([{ connectionId: 'connection-1' }]);

    harness.actor.send({ type: 'closed', incarnation: 1, message: null });
    expect(harness.of('open')).toEqual([{ incarnation: 1 }, { incarnation: 2 }]);
    /* An outcome of the closed incarnation is stale; only the new one serves the held connect. */
    harness.actor.send({ type: 'opened', incarnation: 1 });
    expect(harness.of('serve')).toEqual([{ connectionId: 'connection-1' }]);
    harness.actor.send({ type: 'opened', incarnation: 2 });

    expect(harness.of('serve')).toEqual([{ connectionId: 'connection-1' }, { connectionId: 'remount' }]);
    expect(harness.actor.getSnapshot().matches('serving')).toBe(true);
    expect(harness.emitted).toEqual([
      { type: 'released', requestId: 'late-release', outcome: 'stale', message: null },
      { type: 'released', requestId: 'release-1', outcome: 'closed', message: null },
    ]);
  });

  it('should close at once on shutdown, answering the release it cut short and refusing what it held', () => {
    const harness = start();
    serving(harness, 1);
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    harness.actor.send({ type: 'shutdown', requestId: 'quit' });
    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'late' });
    harness.actor.send({ type: 'closed', incarnation: 1, message: 'close cut refused' });

    expect(harness.of('refuse')).toEqual([{ connectionId: 'late' }]);
    expect(harness.actor.getSnapshot().status).toBe('done');
    expect(harness.emitted).toEqual([
      { type: 'released', requestId: 'release-1', outcome: 'failed', message: 'close cut refused' },
      { type: 'released', requestId: 'quit', outcome: 'failed', message: 'close cut refused' },
    ]);
  });

  /* W6.r1 finding 14 (MC-R26): a fault answers what this state owes, never a key an earlier state left behind. */
  it('should answer each release once when a fault follows a remount', () => {
    let serves = 0;
    const harness = start({
      serve: () => {
        serves += 1;
        if (serves === 3) {
          throw new Error('serve failed');
        }
      },
    });
    serving(harness, 1);
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });

    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'second-window' });

    expect(harness.guard.take('fault')).toHaveLength(1);
    expect(harness.actor.getSnapshot().status).toBe('done');
    expect(harness.emitted).toEqual([{ type: 'released', requestId: 'release-1', outcome: 'stale', message: null }]);
  });

  /* W6.r1 round 3 (P2): the remount's release is answered before its serve, so a fault serving it loses no answer. */
  it('should answer the outrun release even when serving the remount faults', () => {
    let serves = 0;
    const harness = start({
      serve: () => {
        serves += 1;
        if (serves === 2) {
          throw new Error('serve failed');
        }
      },
    });
    serving(harness, 1);
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'remount' });

    expect(harness.guard.take('fault')).toHaveLength(1);
    expect(harness.emitted).toEqual([{ type: 'released', requestId: 'release-1', outcome: 'stale', message: null }]);
  });

  /* W6.r1 round 3 (P5): a newer release held while the host closes, with no connect, opens nothing. */
  it('should answer a newer release held while closing as stale and open no host', () => {
    const harness = start();
    serving(harness, 1);
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });
    harness.actor.send({ type: 'quiescent', drain: 1 });
    harness.actor.send({ type: 'release', gen: 2, requestId: 'release-2' });

    harness.actor.send({ type: 'closed', incarnation: 1, message: null });

    expect(harness.of('open')).toHaveLength(1);
    expect(harness.actor.getSnapshot().status).toBe('done');
    expect(harness.emitted).toEqual([
      { type: 'released', requestId: 'release-1', outcome: 'closed', message: null },
      { type: 'released', requestId: 'release-2', outcome: 'stale', message: null },
    ]);
  });

  /* W6.r1 finding 14: a release newer than every served connect (a retain whose connect never came) closes the host:
   * no connect outran it, so nothing it names is still attached. */
  it('should drain on a release that names a generation newer than any served connect', () => {
    const harness = start();
    serving(harness, 1);

    harness.actor.send({ type: 'release', gen: 2, requestId: 'release-2' });

    expect(harness.actor.getSnapshot().matches('draining')).toBe(true);
    expect(harness.of('drain')).toEqual([{ drain: 1 }]);
    expect(harness.emitted).toEqual([]);

    /* A late connect of a generation the release covers is served, and does not revive the released host. */
    harness.actor.send({ type: 'connect', gen: 2, connectionId: 'late' });
    expect(harness.actor.getSnapshot().matches('draining')).toBe(true);
    harness.actor.send({ type: 'quiescent', drain: 1 });
    harness.actor.send({ type: 'closed', incarnation: 1, message: null });
    expect(harness.emitted).toEqual([{ type: 'released', requestId: 'release-2', outcome: 'closed', message: null }]);
    expect(harness.actor.getSnapshot().status).toBe('done');
  });

  it('should refuse held connects and fail held releases when the host cannot open', () => {
    const harness = start();
    harness.actor.send({ type: 'connect', gen: 1, connectionId: 'first' });
    harness.actor.send({ type: 'release', gen: 1, requestId: 'release-1' });

    harness.actor.send({ type: 'openFailed', incarnation: 1, message: 'no git' });

    expect(harness.of('refuse')).toEqual([{ connectionId: 'first' }]);
    expect(harness.emitted).toEqual([
      { type: 'released', requestId: 'release-1', outcome: 'failed', message: 'no git' },
    ]);
    expect(harness.actor.getSnapshot().status).toBe('done');
  });
});

const sampled: readonly AnyEventObject[] = [
  { type: 'connect', gen: 1, connectionId: 'c1' },
  { type: 'connect', gen: 2, connectionId: 'c2' },
  { type: 'connect', gen: null, connectionId: 'c0' },
  { type: 'release', gen: 1, requestId: 'r1' },
  { type: 'release', gen: 2, requestId: 'r2' },
  { type: 'release', gen: null, requestId: 'r0' },
  { type: 'shutdown', requestId: 'quit' },
  { type: 'opened', incarnation: 1 },
  { type: 'opened', incarnation: 2 },
  { type: 'openFailed', incarnation: 1, message: 'failed' },
  { type: 'quiescent', drain: 1 },
  { type: 'quiescent', drain: 2 },
  { type: 'closed', incarnation: 1, message: null },
  { type: 'closed', incarnation: 2, message: null },
];

const graph: PathOptions = {
  input: { root: '/home/bracket' },
  events: sampled,
  limit: 50_000,
  serializeState: (snapshot) => {
    const context = snapshot.context as Record<string, unknown> & { queue: readonly unknown[] };
    /* Counters and the queue are capped: past two they add no behaviour, only vertices. */
    const capped = (value: unknown): number => Math.min(Number(value), 2);
    return JSON.stringify([
      snapshot.value,
      capped(context['incarnation']),
      capped(context['drains']),
      capped(context.queue.length),
      snapshot.matches('serving') || snapshot.matches('draining') ? context['gen'] : undefined,
      snapshot.matches('closing') ? [context['closedGen'], context['shutdown']] : undefined,
    ]);
  },
};

describe('projectHost enumeration', () => {
  it('reaches every state from the path table', () => {
    expect(unreachedStates(projectHostMachine, graph)).toEqual([]);
    expect(pathTable(projectHostMachine, graph).map((row) => row.state)).toEqual(
      expect.arrayContaining(['opening', 'serving', 'draining', 'closing', 'closed']),
    );
  });

  it('answers every sampled event in every reachable state (MC-R17)', () => {
    expect(unansweredEvents(projectHostMachine, { ...graph, ignore: projectHostIgnoredEvents.projectHost })).toEqual(
      [],
    );
  });

  it('names an AttachGeneration.tla action on every refining transition, and a transition for every utility action (MC-R27)', () => {
    const spec = readFileSync(path.resolve(import.meta.dirname, '../specs/AttachGeneration.tla'), 'utf8');
    const actions = Object.fromEntries(
      Object.entries(machineActions([projectHostMachine])).filter(([, action]) => action !== 'Unmodelled'),
    );
    expect(
      checkActionCorrespondence(actions, {
        operators: specOperators(spec),
        next: ['Retain', 'Release', 'Connect', 'MainFinish', 'UConnect', 'URelStart', 'UCloseDone', 'UCheck'],
        /* Main's actions are the broker's; UCloseDone is the close effect ending, taken with UCheck in `closed`. */
        environment: ['Retain', 'Release', 'Connect', 'MainFinish', 'UCloseDone'],
      }),
    ).toEqual([]);
  });
});
