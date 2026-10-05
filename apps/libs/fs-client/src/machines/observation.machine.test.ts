import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { createCallbackLogic } from 'xstate';
import { createFakePromiseActors } from '@taucad/xstate-testing/fakes';
import type { AnyMachineSnapshot } from 'xstate';
import { describe, expect, it } from 'vitest';
import { createObservationActor, observationMachine, observationIgnoredEvents } from '#machines/observation.machine.js';
import type { ObservationMachineEvent, ObservationReadOutput } from '#machines/observation.machine.js';

/* Path table: 1 registration/read/idle, 2 dirty/retry, 3 failure/retry, 4 closure. */
const events: ObservationMachineEvent[] = [
  { type: 'ready' },
  { type: 'invalidate' },
  { type: 'reset' },
  { type: 'retry' },
  { type: 'closed', error: 'closed' },
];

describe('observationMachine', () => {
  it('should start headlessly and serialize scalar scheduling context', () => {
    const guard = guardActors({ ignore: { observation: observationIgnoredEvents } });
    const fakes = createFakePromiseActors();
    const actor = createObservationActor(
      { resource: 'file' },
      {
        observationDriver: createCallbackLogic<ObservationMachineEvent, { resource: string }>(() => () => undefined),
        observationRead: fakes.actor<ObservationReadOutput, { generation: number }>('read'),
      },
      { clock: new StepClock(), inspect: guard.inspect },
    );
    actor.start();
    actor.send({ type: 'ready' });
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON round-trip verifies snapshots contain no opaque runtime values.
    expect(JSON.parse(JSON.stringify(actor.getSnapshot().context))).toEqual({ resource: 'file', generation: 0 });
    actor.stop();
    expect(guard.take()).toEqual([]);
  });
  it('should answer every public event in every reachable state', () => {
    const options = {
      input: { resource: 'file' },
      events: [
        ...events,
        { type: 'xstate.error.execution' },
        { type: 'xstate.done.actor.observation-read', output: { kind: 'read', generation: 0 } },
        { type: 'xstate.done.actor.observation-read', output: { kind: 'failed', generation: 0, error: 'unavailable' } },
      ],
      limit: 100,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(unansweredEvents(observationMachine, { ...options, ignore: observationIgnoredEvents })).toEqual([]);
    expect(unreachedStates(observationMachine, options)).toEqual([]);
  });
});
