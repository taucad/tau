import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';

/** A started graphics actor with the measuring tool on. */
const startMeasuring = () => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  );
  actor.start();
  actor.send({ type: 'setMeasureActive', payload: true });
  return actor;
};

describe('graphics machine measure', () => {
  it('should keep pinned and unpinned measurements when measuring stops, dropping only a half-placed one', () => {
    const actor = startMeasuring();
    try {
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [0, 2, 0] });
      const [pinned, unpinned] = actor.getSnapshot().context.measurements;
      actor.send({ type: 'toggleMeasurementPinned', id: pinned!.id });
      actor.send({ type: 'startMeasurement', payload: [5, 5, 5] });

      actor.send({ type: 'setMeasureActive', payload: false });

      expect(actor.getSnapshot().matches({ operational: { measure: 'off' } })).toBe(true);
      expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
      expect(actor.getSnapshot().context.measurements).toEqual([
        { ...pinned, isPinned: true },
        { ...unpinned, isPinned: false },
      ]);

      actor.send({ type: 'setMeasureActive', payload: true });
      expect(actor.getSnapshot().matches({ operational: { measure: { on: 'selecting' } } })).toBe(true);
      expect(actor.getSnapshot().context.measurements).toHaveLength(2);
    } finally {
      actor.stop();
    }
  });

  it('should clear every measurement and a half-placed one while measuring', () => {
    const actor = startMeasuring();
    try {
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });
      actor.send({ type: 'toggleMeasurementPinned', id: actor.getSnapshot().context.measurements[0]!.id });
      actor.send({ type: 'startMeasurement', payload: [2, 0, 0] });

      actor.send({ type: 'clearAllMeasurements' });

      expect(actor.getSnapshot().matches({ operational: { measure: { on: 'selecting' } } })).toBe(true);
      expect(actor.getSnapshot().context.measurements).toEqual([]);
      expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
    } finally {
      actor.stop();
    }
  });

  it('should cancel a half-placed measurement and keep the finished ones', () => {
    const actor = startMeasuring();
    try {
      actor.send({ type: 'startMeasurement', payload: [0, 0, 0] });
      actor.send({ type: 'completeMeasurement', payload: [1, 0, 0] });
      actor.send({ type: 'startMeasurement', payload: [2, 0, 0] });

      actor.send({ type: 'cancelCurrentMeasurement' });

      expect(actor.getSnapshot().matches({ operational: { measure: { on: 'selecting' } } })).toBe(true);
      expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
      expect(actor.getSnapshot().context.measurements).toHaveLength(1);
      expect(actor.getSnapshot().context.isMeasureActive).toBe(true);
    } finally {
      actor.stop();
    }
  });
});
