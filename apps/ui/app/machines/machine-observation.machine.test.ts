import { createCallbackLogic } from 'xstate';
import type { AnyMachineSnapshot, EventObject } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import {
  createMachineObservationActor,
  machineObservationIgnoredEvents,
  machineObservationMachine,
} from '#machines/machine-observation.machine.js';
import type { MachineObservationMachineEvent } from '#machines/machine-observation.machine.js';

const snapshot = {
  cursor: { hostId: 'host', authorityId: 'authority', generation: 'first', position: 0, revision: 0 },
  entries: [],
};
const publicEvents: readonly MachineObservationMachineEvent[] = [
  { type: 'refresh' },
  { type: 'directory', generation: 0, snapshot, providers: [] },
  { type: 'frame', generation: 0, frame: { type: 'snapshot', snapshot } },
  { type: 'jobs', generation: 0, jobs: [], replace: true },
  { type: 'ended', generation: 0, error: 'Connection lost' },
];
const driver = createCallbackLogic<EventObject, { machineId: string | undefined; generation: number }>(
  () => () => undefined,
);
describe('machine observation ownership', () => {
  it('retries the observation, cleans its predecessor and fences old-generation replies', () => {
    const clock = new StepClock();
    const guard = guardActors({ ignore: { 'machine-observation': machineObservationIgnoredEvents } });
    const stopped = vi.fn();
    const started = vi.fn();
    const actor = createMachineObservationActor(
      {},
      {
        clock,
        inspect: guard.inspect,
        actors: {
          machineObservationDriver: createCallbackLogic(() => {
            started();
            return stopped;
          }),
        },
      },
    );
    actor.start();
    actor.send({ type: 'directory', generation: 0, snapshot, providers: [] });
    actor.send({ type: 'ended', generation: 0, error: 'Disconnected' });
    expect(stopped).toHaveBeenCalledOnce();
    expect(actor.getSnapshot().matches('reconnecting')).toBe(true);
    clock.increment(500);
    expect(started).toHaveBeenCalledTimes(2);
    actor.send({
      type: 'directory',
      generation: 0,
      snapshot: { ...snapshot, cursor: { ...snapshot.cursor, hostId: 'wrong' } },
      providers: [],
    });
    expect(actor.getSnapshot().context.snapshot?.cursor.hostId).toBe('host');
    actor.send({ type: 'directory', generation: 1, snapshot, providers: [] });
    expect(actor.getSnapshot().context.error).toBeUndefined();
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    actor.stop();
    expect(stopped).toHaveBeenCalledTimes(2);
  });
  it('models driver failure and allows an explicit refresh', () => {
    const actor = createMachineObservationActor({});
    actor.start();
    expect(actor.getSnapshot().matches('failed')).toBe(true);
    expect(actor.getSnapshot().context.error).toContain('observation driver');
    actor.stop();
  });
  it('answers every public event in every reachable state', () => {
    const logic = machineObservationMachine.provide({ actors: { machineObservationDriver: driver } });
    const options = {
      input: {},
      events: [...publicEvents, { type: 'xstate.error.execution' }],
      limit: 100,
      serializeState: (state: AnyMachineSnapshot) => JSON.stringify(state.value),
    };
    expect(unansweredEvents(logic, { ...options, ignore: machineObservationIgnoredEvents })).toEqual([]);
    expect(unreachedStates(logic, options)).toEqual([]);
  });
});
