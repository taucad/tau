import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { measureInputMachine } from '#machines/measure-input.machine.js';

describe('measureInputMachine', () => {
  it('should accept a plain left-click measurement point on a target', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 0, hasTarget: true, cameraInteracting: false });
    actor.send({
      type: 'pointerUp',
      button: 0,
      hasTarget: true,
      hasCurrentStart: false,
      isZeroLength: false,
      hasActiveSnapTarget: false,
    });

    expect(actor.getSnapshot().context.result).toBe('acceptPoint');
    actor.stop();
  });

  it('should discard a left-click when camera interaction starts during the pointer gesture', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 0, hasTarget: true, cameraInteracting: false });
    actor.send({ type: 'cameraInteractionStart' });
    actor.send({
      type: 'pointerUp',
      button: 0,
      hasTarget: true,
      hasCurrentStart: false,
      isZeroLength: false,
      hasActiveSnapTarget: false,
    });

    expect(actor.getSnapshot().context.result).toBe('ignore');
    actor.stop();
  });

  it('should discard a pointer gesture that starts while camera controls are already interacting', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 0, hasTarget: true, cameraInteracting: true });
    actor.send({
      type: 'pointerUp',
      button: 0,
      hasTarget: true,
      hasCurrentStart: false,
      isZeroLength: false,
      hasActiveSnapTarget: false,
    });

    expect(actor.getSnapshot().context.result).toBe('ignore');
    actor.stop();
  });

  it('should cancel the current measurement on a right-click without a discarded drag', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 2, hasTarget: false, cameraInteracting: false });
    actor.send({
      type: 'pointerUp',
      button: 2,
      hasTarget: false,
      hasCurrentStart: true,
      isZeroLength: false,
      hasActiveSnapTarget: false,
    });

    expect(actor.getSnapshot().context.result).toBe('cancelCurrent');
    actor.stop();
  });

  it('should reject zero-length measurement completions', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 0, hasTarget: true, cameraInteracting: false });
    actor.send({
      type: 'pointerUp',
      button: 0,
      hasTarget: true,
      hasCurrentStart: true,
      isZeroLength: true,
      hasActiveSnapTarget: false,
    });

    expect(actor.getSnapshot().context.result).toBe('ignore');
    actor.stop();
  });

  it('should clear transient results without changing pointer state', () => {
    const actor = createActor(measureInputMachine);
    actor.start();

    actor.send({ type: 'pointerDown', button: 0, hasTarget: true, cameraInteracting: false });
    actor.send({
      type: 'pointerUp',
      button: 0,
      hasTarget: true,
      hasCurrentStart: false,
      isZeroLength: false,
      hasActiveSnapTarget: false,
    });
    actor.send({ type: 'clearResult' });

    expect(actor.getSnapshot().context.result).toBeUndefined();
    expect(actor.getSnapshot().context.isPointerDown).toBe(false);
    actor.stop();
  });
});
