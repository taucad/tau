import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot, EventObject } from 'xstate';
import * as machineModule from '#main/shutdown.machine.js';
import { createShutdownActor, shutdownMachine, shutdownIgnoredEvents } from '#main/shutdown.machine.js';
import type {
  ShutdownDriverInput,
  ShutdownMachineEvent,
  ShutdownResult,
  ShutdownStage,
} from '#main/shutdown.machine.js';

const results: readonly ShutdownResult[] = [
  'clear',
  'review',
  'view',
  'cancel',
  'force',
  'confirmed',
  'settled',
  'failed',
  'retry',
  'recover',
];
const publicEvents: readonly ShutdownMachineEvent[] = [
  { type: 'quit' },
  ...results.map((result): ShutdownMachineEvent => ({ type: 'done', attemptId: 'test:1', result })),
];
const harness = () => {
  const effects: ShutdownStage[] = [];
  const guard = guardActors({ ignore: { shutdown: shutdownIgnoredEvents } });
  const actor = createShutdownActor(
    { identity: 'test' },
    {
      clock: new StepClock(),
      inspect: guard.inspect,
      actors: {
        shutdownDriver: createCallbackLogic<EventObject, ShutdownDriverInput>(({ input }) => {
          effects.push(input.stage);
        }),
      },
    },
  ).start();
  const done = (result: ShutdownResult, attemptId = actor.getSnapshot().context.attemptId): void => {
    actor.send({ type: 'done', attemptId, result });
  };
  return { actor, effects, done };
};
describe('shutdown owner', () => {
  it('exports one headless machine and answers every public event in reachable states', () => {
    expect(
      Object.values(machineModule).filter(
        (value) => typeof value === 'object' && 'transition' in value && 'getInitialSnapshot' in value,
      ),
    ).toEqual([shutdownMachine]);
    const options = {
      input: { identity: 'test' },
      events: [...publicEvents, { type: 'xstate.error.execution' }],
      limit: 500,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(unansweredEvents(shutdownMachine, { ...options, ignore: shutdownIgnoredEvents })).toEqual([]);
    expect(unreachedStates(shutdownMachine, options)).toEqual([]);
  });
  it('holds review, deduplicates repeated quit, and cancels before navigating without teardown', () => {
    const { actor, done, effects } = harness();
    actor.send({ type: 'quit' });
    actor.send({ type: 'quit' });
    done('review');
    actor.send({ type: 'quit' });
    expect(effects).toEqual(['assessing', 'reviewing']);
    done('view');
    done('settled');
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    expect(effects).toEqual(['assessing', 'reviewing', 'viewing']);
    actor.stop();
  });
  it('requires separate interruption confirmation and ignores a previous attempt completion', () => {
    const { actor, done } = harness();
    actor.send({ type: 'quit' });
    done('review');
    done('cancel');
    done('settled');
    actor.send({ type: 'quit' });
    done('clear', 'test:1');
    expect(actor.getSnapshot().matches('assessing')).toBe(true);
    done('review');
    done('force');
    expect(actor.getSnapshot().context.forceMachines).toBe(false);
    done('confirmed');
    expect(actor.getSnapshot().matches('renderer')).toBe(true);
    expect(actor.getSnapshot().context.forceMachines).toBe(true);
    done('settled');
    expect(actor.getSnapshot().matches('utility')).toBe(true);
    done('settled');
    expect(actor.getSnapshot().matches('exiting')).toBe(true);
    actor.stop();
  });
  it('keeps restart ownership through repeated quit until cleanup is prepared', () => {
    const { actor, done } = harness();
    actor.send({ type: 'quit', purpose: 'restart' });
    actor.send({ type: 'quit' });
    done('clear');
    done('settled');
    done('settled');
    expect(actor.getSnapshot().matches('exiting')).toBe(true);
    done('settled');
    expect(actor.getSnapshot().matches('prepared')).toBe(true);
    expect(actor.getSnapshot().context.purpose).toBe('restart');
    actor.stop();
  });
  it('never treats a failed save or failed recovery as permission to exit', () => {
    const { actor, done, effects } = harness();
    actor.send({ type: 'quit' });
    done('clear');
    done('failed');
    done('recover');
    done('failed');
    expect(actor.getSnapshot().matches('recoveryReview')).toBe(true);
    expect(effects).not.toContain('exiting');
    done('retry');
    done('settled');
    expect(actor.getSnapshot().matches('idle')).toBe(true);
    actor.stop();
  });
});
