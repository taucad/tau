/**
 * Measure's pointer decision: the decision each release emits. Path table (the shortest path to each state), kept
 * current with `pathTable`:
 *
 * 1. `idle`: initial
 * 2. `pressed`: `pointerDown` (a left press)
 */
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  measureInputEventTypes,
  measureInputIgnoredEvents,
  measureInputMachine,
} from '#machines/measure-input.machine.js';
import type { MeasureInputEmitted, MeasureInputEvent } from '#machines/measure-input.machine.js';

const leftDown: MeasureInputEvent = { type: 'pointerDown', button: 0, hasTarget: true, cameraMoving: false };
const leftUp = (patch: Partial<Extract<MeasureInputEvent, { type: 'pointerUp' }>> = {}): MeasureInputEvent => ({
  type: 'pointerUp',
  button: 0,
  hasTarget: true,
  hasCurrentStart: false,
  isZeroLength: false,
  hasActiveSnapTarget: false,
  ...patch,
});

const samples: Record<MeasureInputEvent['type'], readonly MeasureInputEvent[]> = {
  pointerDown: [leftDown],
  pointerUp: [leftUp()],
  cameraMoved: [{ type: 'cameraMoved' }],
  pointerCancel: [{ type: 'pointerCancel' }],
  blur: [{ type: 'blur' }],
};

const pathOptions = {
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

/** A measure input that records every decision it emits. */
const startInput = () => {
  const actor = createActor(measureInputMachine).start();
  const decisions: Array<MeasureInputEmitted['type']> = [];
  actor.on('*', (emitted) => {
    decisions.push(emitted.type);
  });
  return {
    actor,
    /** The decisions emitted since the last call. */
    take: (): Array<MeasureInputEmitted['type']> => decisions.splice(0),
  };
};

describe('measure input totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...measureInputEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(measureInputMachine, pathOptions).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: 'idle', events: [] },
      { state: 'pressed', events: ['pointerDown'] },
    ]);
    expect(unreachedStates(measureInputMachine, pathOptions)).toEqual([]);
  });

  it('should answer every event in every state', () => {
    expect(unansweredEvents(measureInputMachine, { ...pathOptions, ignore: measureInputIgnoredEvents })).toEqual([]);
  });
});

describe('measureInputMachine', () => {
  it('should emit exactly one decision per release, and none for a press, a camera move or a blur', () => {
    const input = startInput();
    input.actor.send(leftDown);
    input.actor.send({ type: 'cameraMoved' });
    input.actor.send({ type: 'blur' });
    expect(input.take()).toEqual([]);

    input.actor.send(leftUp());
    input.actor.send(leftUp());
    expect(input.take()).toEqual(['ignored', 'ignored']);
    input.actor.stop();
  });

  it('ignores a second pointer, cancellation and a mismatched pointer release', () => {
    const input = startInput();
    input.actor.send({ ...leftDown, pointerId: 1 });
    input.actor.send(leftUp({ pointerId: 2, hasActiveSnapTarget: true }));
    expect(input.take()).toEqual(['ignored']);

    input.actor.send({ ...leftDown, pointerId: 1 });
    input.actor.send({ type: 'pointerCancel', pointerId: 1 });
    input.actor.send(leftUp({ pointerId: 1, hasActiveSnapTarget: true }));
    expect(input.take()).toEqual(['ignored']);

    input.actor.send({ ...leftDown, pointerId: 1 });
    input.actor.send({ ...leftDown, pointerId: 2, isPrimary: false });
    input.actor.send(leftUp({ pointerId: 1 }));
    expect(input.take()).toEqual(['accepted']);
    input.actor.stop();
  });

  it('should accept a plain left-click measurement point on a target', () => {
    const input = startInput();
    input.actor.send(leftDown);
    input.actor.send(leftUp());
    expect(input.take()).toEqual(['accepted']);
    input.actor.stop();
  });

  it('should discard a left-click when the camera moves during the pointer gesture', () => {
    const input = startInput();
    input.actor.send(leftDown);
    input.actor.send({ type: 'cameraMoved' });
    input.actor.send(leftUp({ awaitingTargets: true }));
    expect(input.take()).toEqual(['ignored']);
    input.actor.stop();
  });

  it('should discard a pointer gesture that starts while the camera is already moving', () => {
    const input = startInput();
    input.actor.send({ ...leftDown, cameraMoving: true });
    input.actor.send(leftUp());
    expect(input.take()).toEqual(['ignored']);
    input.actor.stop();
  });

  it('should cancel the current measurement on a right-click without a discarded drag', () => {
    const input = startInput();
    input.actor.send({ type: 'pointerDown', button: 2, hasTarget: false, cameraMoving: false });
    input.actor.send(leftUp({ button: 2, hasTarget: false, hasCurrentStart: true }));
    input.actor.send({ type: 'pointerDown', button: 2, hasTarget: false, cameraMoving: false });
    input.actor.send(leftUp({ button: 2, hasTarget: false, hasCurrentStart: false }));
    expect(input.take()).toEqual(['cancelled', 'ignored']);
    input.actor.stop();
  });

  it('should reject zero-length measurement completions', () => {
    const input = startInput();
    input.actor.send(leftDown);
    input.actor.send(leftUp({ hasCurrentStart: true, isZeroLength: true }));
    expect(input.take()).toEqual(['ignored']);
    input.actor.stop();
  });

  it('should defer a left click whose targets are still being prepared, whatever it found under it', () => {
    const input = startInput();
    input.actor.send({ ...leftDown, hasTarget: false });
    input.actor.send(leftUp({ hasTarget: false, awaitingTargets: true }));
    // A right click is decided at once, waiting or not.
    input.actor.send({ type: 'pointerDown', button: 2, hasTarget: false, cameraMoving: false });
    input.actor.send(leftUp({ button: 2, hasCurrentStart: true, awaitingTargets: true }));
    expect(input.take()).toEqual(['deferred', 'cancelled']);
    expect(input.actor.getSnapshot().value).toBe('idle');
    input.actor.stop();
  });
});
