import { describe, expect, it } from 'vitest';
import { createActor, setup, types } from 'xstate';
import type { InspectionEvent } from 'xstate';
import { z } from 'zod';

import { StepClock } from '#clock.js';
import { guardActors, recordTransitions, validated } from '#inspect.js';

const noPayload = types<Readonly<Record<never, never>>>();

const counter = setup({
  schemas: {
    context: types<{ count: number }>(),
    events: { increment: types<{ by: number }>(), ping: noPayload, close: noPayload },
  },
}).createMachine({
  id: 'counter',
  version: '1',
  context: { count: 0 },
  initial: 'open',
  states: {
    open: {
      on: {
        increment: ({ context, event }) => ({ context: { count: context.count + event.by } }),
        close: { target: 'closed' },
      },
    },
    closed: {},
  },
});

describe('guardActors', () => {
  it.fails('should fail a test that leaves a dead letter untaken', () => {
    const guard = guardActors();
    const actor = createActor(counter, { inspect: guard.inspect }).start();
    actor.stop();

    actor.send({ type: 'ping' });
  });

  it('should pass when the test takes the dead letter it expects', () => {
    const guard = guardActors();
    const actor = createActor(counter, { inspect: guard.inspect }).start();
    actor.stop();

    actor.send({ type: 'ping' });

    expect(guard.take('deadLetter')).toMatchObject([{ kind: 'deadLetter', reason: 'stopped', eventType: 'ping' }]);
  });

  it('should report a public event the current state does not handle', () => {
    const guard = guardActors();
    const actor = createActor(counter, { inspect: guard.inspect }).start();
    actor.send({ type: 'close' });

    actor.send({ type: 'increment', by: 1 });

    expect(guard.take()).toEqual([
      { kind: 'unanswered', machineId: 'counter', value: 'closed', eventType: 'increment' },
    ]);
  });

  it('should report an unanswered timer with its id', () => {
    const timer = setup({ schemas: { events: { arm: noPayload, tick: noPayload, leave: noPayload } } }).createMachine({
      id: 'timer',
      initial: 'armed',
      states: {
        armed: {
          on: {
            arm: (_, enq) => {
              enq.raise({ type: 'tick' }, { id: 'tick-timer', delay: 100 });
              return {};
            },
            leave: { target: 'elsewhere' },
          },
        },
        elsewhere: {},
      },
    });
    const guard = guardActors({ ignore: { timer: [['*', 'xstate.timer']] } });
    const clock = new StepClock();
    const actor = createActor(timer, { inspect: guard.inspect, clock }).start();
    actor.send({ type: 'arm' });
    actor.send({ type: 'leave' });

    clock.advance(100);

    expect(guard.take()).toEqual([
      { kind: 'unanswered', machineId: 'timer', value: 'elsewhere', eventType: 'xstate.timer', timerId: 'tick-timer' },
    ]);
  });

  it('should let a knownDefects pair name an unanswered timer by its id', () => {
    const timer = setup({ schemas: { events: { arm: noPayload, tick: noPayload } } }).createMachine({
      id: 'timer',
      initial: 'armed',
      states: {
        armed: {
          on: {
            arm: (_, enq) => {
              enq.raise({ type: 'tick' }, { id: 'tick-timer', delay: 100 });
              return {};
            },
          },
        },
      },
    });
    const guard = guardActors({ ignore: { timer: [['armed', 'tick-timer']] } });
    const clock = new StepClock();
    const actor = createActor(timer, { inspect: guard.inspect, clock }).start();
    actor.send({ type: 'arm' });

    clock.advance(100);

    expect(guard.take()).toEqual([]);
  });

  it("should not report an ignored pair, a built-in event or a child's done event", () => {
    const child = setup({ schemas: { events: { finish: noPayload } } }).createMachine({
      id: 'child',
      initial: 'running',
      states: { running: { on: { finish: { target: 'done' } } }, done: { type: 'final' } },
    });
    const parent = setup({ actors: { child } }).createMachine({
      id: 'parent',
      initial: 'waiting',
      states: { waiting: { invoke: { id: 'kid', src: 'child' } } },
    });
    const guard = guardActors({ ignore: { counter: [['open', 'ping']] } });
    const actor = createActor(counter, { inspect: guard.inspect }).start();
    actor.send({ type: 'ping' });
    const family = createActor(parent, { inspect: guard.inspect }).start();

    family.getSnapshot().children['kid']?.send({ type: 'finish' });

    expect(guard.take()).toEqual([]);
  });

  it('should report a send to a missing child as a fault under a root onError', () => {
    const sender = setup({ schemas: { events: { send: noPayload } } }).createMachine({
      id: 'sender',
      initial: 'ready',
      onError: { target: '.faulted' },
      states: {
        ready: {
          on: {
            send: (_, enq) => {
              // oxlint-disable-next-line tau-lint/xstate-contract -- the case under test: a send to a child that does not exist.
              enq.sendTo('nope', { type: 'hello' });
              return {};
            },
          },
        },
        faulted: {},
      },
    });
    const guard = guardActors();
    const actor = createActor(sender, { inspect: guard.inspect }).start();

    actor.send({ type: 'send' });

    expect(guard.take('fault')).toEqual([{ kind: 'fault', machineId: 'sender', eventType: 'send', status: 'active' }]);
    expect(actor.getSnapshot().value).toBe('faulted');
  });

  it('should read both dead-letter spellings', () => {
    const guard = guardActors();
    const actorRef = { id: 'target' };
    for (const type of ['@xstate.deadletter', '@xstate.deadLetter']) {
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the renamed spelling is not in alpha.59's types (N17).
      guard.inspect({
        type,
        reason: 'stopped',
        event: { type: 'ping' },
        actorRef,
        rootId: 'r',
        sourceRef: undefined,
      } as unknown as InspectionEvent);
    }

    expect(guard.take('deadLetter')).toHaveLength(2);
  });

  it('should report a fault when a transition enters a state without a valid per-state context', () => {
    const run = setup({
      schemas: {
        context: z.object({ chatId: z.string() }),
        events: { admit: z.object({ attemptId: z.string() }) },
      },
      states: {
        idle: {},
        running: { schemas: { context: z.object({ chatId: z.string(), attemptId: z.string().min(1) }) } },
      },
    }).createMachine({
      id: 'run',
      context: { chatId: 'c1' },
      initial: 'idle',
      states: {
        idle: {
          on: {
            admit: ({ context, event }) => ({ target: 'running', context: { ...context, attemptId: event.attemptId } }),
          },
        },
        running: {},
      },
    });
    const guard = guardActors();
    const errors: unknown[] = [];
    const actor = createActor(validated(run), { inspect: guard.inspect });
    actor.subscribe({ error: (error) => errors.push(error) });
    actor.start();

    actor.send({ type: 'admit', attemptId: '' });

    expect(guard.take('fault')).toEqual([{ kind: 'fault', machineId: 'run', eventType: 'admit', status: 'error' }]);
    expect(errors).toHaveLength(1);
  });

  it('should leave the product machine without a validator', () => {
    const tested = validated(counter);

    expect(tested).not.toBe(counter);
    expect(tested.validator).toBeDefined();
    expect(counter.validator).toBeUndefined();
  });
});

describe('recordTransitions', () => {
  it('should record the full event and context of every delivery', () => {
    const recorder = recordTransitions();
    const actor = createActor(counter, { inspect: recorder.inspect }).start();

    actor.send({ type: 'increment', by: 2 });

    expect(recorder.records()).toMatchObject([
      {
        machineId: 'counter',
        version: '1',
        event: { type: '@xstate.init', input: undefined },
        value: 'open',
        context: { count: 0 },
        microsteps: [],
        sent: [],
      },
      {
        machineId: 'counter',
        version: '1',
        event: { type: 'increment', by: 2 },
        value: 'open',
        context: { count: 2 },
        microsteps: [{ eventType: 'increment', source: 'counter.open', targets: [] }],
        sent: [],
      },
    ]);
  });
});
