import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import type { AnyMachineSnapshot } from 'xstate';
import type { TourStepId } from '@taucad/preferences';

import * as machineModule from './tour.machine.js';
import {
  createTourActor,
  nextGuidedTipNumber,
  selectTourTip,
  tourIgnoredEvents,
  tourMachine,
  tourTimeouts,
} from './tour.machine.js';
import type { TourFacts, TourMachineEmitted, TourMachineEvent, TourMachineInput } from './tour.machine.js';

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

const guided: TourMachineInput = { stored: { seen: [] }, wanted: true, paused: false };

const start = (
  input: TourMachineInput = guided,
): {
  actor: ReturnType<typeof createTourActor>;
  clock: StepClock;
  emitted: TourMachineEmitted[];
  tip: () => TourStepId | undefined;
  facts: (facts: Partial<TourFacts>) => void;
  guard: ReturnType<typeof guardActors>;
} => {
  const guard = guardActors({ ignore: { tour: tourIgnoredEvents } });
  const clock = new StepClock();
  const actor = createTourActor(input, { clock, inspect: guard.inspect });
  const emitted: TourMachineEmitted[] = [];
  for (const type of ['started', 'shown', 'seen', 'pausedChanged', 'ended', 'replayEnded'] as const) {
    actor.on(type, (event) => {
      emitted.push(event);
    });
  }
  actor.start();
  return {
    actor,
    clock,
    emitted,
    guard,
    tip: () => selectTourTip(actor.getSnapshot())?.step,
    facts: (facts) => {
      actor.send({ type: 'factsChanged', facts });
    },
  };
};

const seenOf = (emitted: readonly TourMachineEmitted[]): Array<readonly [TourStepId, string]> =>
  emitted.flatMap((event) => (event.type === 'seen' ? [[event.step, event.by] as const] : []));

/** An empty project, opened with nothing sent yet. */
const emptyProject: Partial<TourFacts> = { messageSent: false, modelOnScreen: false, turnRunning: false };

describe('tourMachine', () => {
  it('starts headlessly, stops, and exports exactly one machine value', () => {
    const { actor, guard } = start();

    expect(actor.getSnapshot().matches('running')).toBe(true);
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([tourMachine]);
    actor.stop();
    expect(guard.take()).toEqual([]);
  });

  it('answers every public event in every reachable state', () => {
    const publicEvents: readonly TourMachineEvent[] = [
      { type: 'factsChanged', facts: { modelOnScreen: true } },
      { type: 'factsChanged', facts: { modelOnScreen: true, turnRunning: false, hasParameters: true } },
      { type: 'actionDone', step: 'ask' },
      { type: 'cameraMoved' },
      { type: 'cameraRested' },
      { type: 'next' },
      { type: 'back' },
      { type: 'pause' },
      { type: 'resume' },
      { type: 'skip' },
      { type: 'replayStarted' },
      { type: 'replayClosed' },
      { type: 'storedChanged', stored: { seen: [] }, wanted: true, paused: false },
    ];
    const options = {
      input: guided,
      events: [...publicEvents, { type: 'xstate.error.execution' }],
      limit: 200,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };

    expect(unansweredEvents(tourMachine, { ...options, ignore: tourIgnoredEvents })).toEqual([]);
    expect(unreachedStates(tourMachine, options)).toEqual([]);
  });

  it('declares its one timer', () => {
    expect(tourTimeouts.map((tourTimeout) => tourTimeout.maximum)).toEqual([1000]);
  });

  describe('the engine rules', () => {
    it('shows the first unseen tip, and never a later one while an earlier one is unseen (fixed order)', () => {
      const { tip, facts, actor } = start();
      facts(emptyProject);
      expect(tip()).toBe('ask');

      /* Every later condition holds, but tip 1 is not seen yet. */
      facts({ modelOnScreen: true, hasParameters: true });
      expect(tip()).toBe('ask');

      actor.send({ type: 'next' });
      expect(tip()).toBe('look');
    });

    it('shows nothing while the first unseen tip cannot appear (otherwise wait)', () => {
      const { tip, facts, actor } = start();
      facts(emptyProject);
      actor.send({ type: 'next' });

      /* Look around waits for a model. */
      expect(tip()).toBeUndefined();
      expect(actor.getSnapshot().matches('running')).toBe(true);
    });

    it('marks a tip seen on its real action, whichever tip is showing (real actions count)', () => {
      const { tip, facts, actor, emitted } = start();
      facts(emptyProject);
      actor.send({ type: 'actionDone', step: 'build' });

      expect(tip()).toBe('ask');
      expect(seenOf(emitted)).toEqual([['build', 'action']]);
      expect(actor.getSnapshot().context.stored.seen).toEqual(['build']);
    });

    it('marks the current tip seen on Next and performs nothing else; Back never shrinks what is stored', () => {
      const { tip, facts, actor, emitted } = start();
      facts(emptyProject);
      actor.send({ type: 'next' });
      facts({ modelOnScreen: true, turnRunning: true });

      expect(tip()).toBe('look');
      expect(actor.getSnapshot().context.facts.modelOnScreen).toBe(true);

      actor.send({ type: 'back' });
      expect(tip()).toBe('ask');
      expect(selectTourTip(actor.getSnapshot())?.isReviewing).toBe(true);
      expect(actor.getSnapshot().context.stored.seen).toEqual(['ask']);

      actor.send({ type: 'next' });
      expect(tip()).toBe('look');
      expect(seenOf(emitted)).toEqual([['ask', 'next']]);
    });

    it('passes over Parameters only when the agent is idle and the model has none', () => {
      const { tip, facts, actor, emitted } = start({ ...guided, stored: { seen: ['ask', 'look'] } });
      facts({ messageSent: true, modelOnScreen: true, turnRunning: true, hasParameters: false });

      /* Mid-turn, nothing: Parameters waits for parameters or for the turn to end. */
      expect(tip()).toBeUndefined();

      facts({ turnRunning: false });
      expect(seenOf(emitted)).toEqual([['adjust', 'passedOver']]);
      expect(tip()).toBe('verify');

      /* No other tip is passed over: Verify and Export wait, they are never marked seen by a condition. */
      facts({ turnRunning: true });
      expect(tip()).toBeUndefined();
      expect(actor.getSnapshot().context.stored.seen).toEqual(['ask', 'look', 'adjust']);
    });

    it('shows a tip whatever its target is doing: conditions are about the project, never about visibility', () => {
      const { tip, facts } = start({ ...guided, stored: { seen: ['ask', 'look'] } });
      facts({ modelOnScreen: true, turnRunning: true, hasParameters: true });

      expect(tip()).toBe('adjust');
    });

    it('marks Look around seen about a second after the camera rests, and a new move cancels it (the one timer)', () => {
      const { tip, facts, actor, clock } = start({ ...guided, stored: { seen: ['ask'] } });
      facts({ modelOnScreen: true, turnRunning: true });
      expect(tip()).toBe('look');

      actor.send({ type: 'cameraRested' });
      clock.increment(600);
      actor.send({ type: 'cameraMoved' });
      clock.increment(600);
      expect(tip()).toBe('look');

      actor.send({ type: 'cameraRested' });
      clock.increment(999);
      expect(tip()).toBe('look');
      clock.increment(1);
      expect(actor.getSnapshot().context.stored.seen).toEqual(['ask', 'look']);
    });
  });

  describe('arrival', () => {
    it('in an empty project, marks tip 1 seen when a message is sent', () => {
      const { tip, facts, emitted } = start();
      facts(emptyProject);
      expect(tip()).toBe('ask');
      expect(emitted.filter((event) => event.type === 'started')).toEqual([{ type: 'started', mode: 'guided' }]);

      facts({ messageSent: true, turnRunning: true });
      expect(seenOf(emitted)).toEqual([['ask', 'action']]);
      expect(tip()).toBeUndefined();
    });

    it('arriving from Home with the message sent, keeps tip 1 until the model appears', () => {
      const { tip, facts, actor } = start();
      facts({ messageSent: true, modelOnScreen: false, turnRunning: true });

      expect(actor.getSnapshot().context.arrival).toBe('prompt');
      expect(tip()).toBe('ask');

      facts({ modelOnScreen: true });
      expect(tip()).toBe('look');
    });

    it('a model that appears before the turn ends shows Look around and Parameters, then waits for the turn', () => {
      const { tip, facts, actor } = start();
      facts({ messageSent: true, turnRunning: true });
      facts({ modelOnScreen: true, hasParameters: true });
      expect(tip()).toBe('look');

      actor.send({ type: 'cameraRested' });
      actor.getSnapshot();
      actor.send({ type: 'actionDone', step: 'look' });
      expect(tip()).toBe('adjust');

      actor.send({ type: 'actionDone', step: 'adjust' });
      expect(tip()).toBeUndefined();

      facts({ turnRunning: false });
      expect(tip()).toBe('verify');
    });

    it('waits through "no model yet" and shows nothing if the first turn never produces a model', () => {
      const { tip, facts } = start();
      facts({ messageSent: true, turnRunning: true });
      facts({ turnRunning: false });

      expect(tip()).toBe('ask');
      facts({ modelOnScreen: true });
      expect(tip()).toBe('look');
    });
  });

  it('completes once all five are seen', () => {
    const { actor, facts, emitted } = start({ ...guided, stored: { seen: ['ask', 'look', 'adjust', 'verify'] } });
    facts({ modelOnScreen: true, turnRunning: false, messageSent: true });
    actor.send({ type: 'actionDone', step: 'build' });

    expect(actor.getSnapshot().matches('inactive')).toBe(true);
    expect(actor.getSnapshot().context.stored.ended).toBe('completed');
    expect(emitted.at(-1)).toEqual({ type: 'ended', ending: 'completed', step: undefined });
  });

  describe('pause, skip and storage', () => {
    it('pauses and resumes on this device, telling the host which tip it was on', () => {
      const { actor, facts, tip, emitted } = start();
      facts(emptyProject);
      actor.send({ type: 'pause' });

      expect(tip()).toBeUndefined();
      expect(emitted.at(-1)).toEqual({ type: 'pausedChanged', paused: true, step: 'ask' });
      expect(nextGuidedTipNumber(actor.getSnapshot().context.stored)).toBe(1);

      actor.send({ type: 'resume' });
      expect(tip()).toBe('ask');
    });

    it('starts paused when the device paused it', () => {
      const { actor, tip } = start({ ...guided, paused: true });

      expect(actor.getSnapshot().matches('paused')).toBe(true);
      expect(tip()).toBeUndefined();
    });

    it('skip stores dismissed and no tip appears again', () => {
      const { actor, facts, tip, emitted } = start();
      facts(emptyProject);
      actor.send({ type: 'skip' });

      expect(emitted.at(-1)).toEqual({ type: 'ended', ending: 'dismissed', step: 'ask' });
      expect(actor.getSnapshot().matches('inactive')).toBe(true);
      actor.send({ type: 'storedChanged', stored: { seen: [], ended: 'dismissed' }, wanted: true, paused: false });
      expect(tip()).toBeUndefined();
    });

    it('takes progress stored by another tab and never loses its own', () => {
      const { actor, facts, tip } = start({ ...guided, stored: { seen: ['look'] } });
      facts(emptyProject);
      actor.send({ type: 'storedChanged', stored: { seen: ['ask'] }, wanted: true, paused: false });

      expect(actor.getSnapshot().context.stored.seen).toEqual(['ask', 'look']);
      expect(tip()).toBeUndefined();

      actor.send({ type: 'storedChanged', stored: { seen: [] }, wanted: true, paused: true });
      expect(actor.getSnapshot().matches('paused')).toBe(true);
    });

    it('runs no guided tour when none was wanted', () => {
      const { actor, tip } = start({ ...guided, wanted: false });

      expect(actor.getSnapshot().matches('inactive')).toBe(true);
      expect(tip()).toBeUndefined();
    });
  });

  describe('replay', () => {
    const finished: TourMachineInput = {
      stored: { seen: ['ask', 'look', 'adjust', 'verify', 'build'], ended: 'completed' },
      wanted: true,
      paused: false,
    };

    it('steps through all five with Next whatever the project holds, and leaves what is stored unchanged', () => {
      const { actor, tip, emitted } = start({ ...finished, replay: true });
      const visited: Array<TourStepId | undefined> = [tip()];
      for (let step = 0; step < 4; step++) {
        actor.send({ type: 'next' });
        visited.push(tip());
      }

      expect(visited).toEqual(['ask', 'look', 'adjust', 'verify', 'build']);
      expect(selectTourTip(actor.getSnapshot())?.isLast).toBe(true);
      actor.send({ type: 'next' });

      expect(tip()).toBeUndefined();
      expect(actor.getSnapshot().matches('inactive')).toBe(true);
      expect(actor.getSnapshot().context.stored).toEqual(finished.stored);
      expect(seenOf(emitted)).toEqual([]);
      expect(emitted.filter((event) => event.type === 'replayEnded')).toEqual([
        { type: 'replayEnded', completed: true, step: undefined },
      ]);
    });

    it('ignores real actions and closes back to a paused guided tour', () => {
      const { actor, tip } = start({ stored: { seen: ['ask'] }, wanted: true, paused: true });
      actor.send({ type: 'replayStarted' });
      actor.send({ type: 'actionDone', step: 'ask' });
      expect(tip()).toBe('ask');

      actor.send({ type: 'replayClosed' });
      expect(actor.getSnapshot().matches('paused')).toBe(true);
      expect(actor.getSnapshot().context.stored.seen).toEqual(['ask']);
    });
  });
});
