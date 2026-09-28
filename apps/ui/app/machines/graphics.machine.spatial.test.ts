import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = () =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }), {
    input: { graphicsBackend: 'webgl' },
  });

describe('graphics machine physical scene metadata', () => {
  it('should store the physical radius and centre and add a new plane through the geometry centre', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [10, 20, 30] });
      expect(actor.getSnapshot().context.geometryRadius).toBe(0.1);
      expect(actor.getSnapshot().context.geometryCenter).toEqual([10, 20, 30]);

      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      expect(actor.getSnapshot().context.sectionCuts).toEqual([
        expect.objectContaining({ kind: 'plane', plane: 'xy', offset: 30 }),
      ]);
    } finally {
      actor.stop();
    }
  });

  it('should keep a cut through a nonzero centre in place when it flips or turns', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [10, 20, 30] });
      actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
      actor.send({ type: 'addSectionCut', payload: { kind: 'revolution', axis: 'z' } });
      const [plane, cutaway] = actor.getSnapshot().context.sectionCuts;

      for (const isFlipped of [true, false]) {
        actor.send({ type: 'updateSectionCut', payload: { id: plane!.id, patch: { isFlipped } } });
        expect(actor.getSnapshot().context.sectionCuts[0]).toMatchObject({ offset: 30, isFlipped });
      }
      actor.send({ type: 'updateSectionCut', payload: { id: cutaway!.id, patch: { start: 120 } } });

      expect(actor.getSnapshot().context.sectionCuts[1]).toMatchObject({ origin: [10, 20, 30], start: 120 });
    } finally {
      actor.stop();
    }
  });

  it('records new physical measurements in the current tau root frame', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'startMeasurement', payload: [10, 20, 30] });
      actor.send({ type: 'completeMeasurement', payload: [10.003, 20, 30] });

      const [measurement] = actor.getSnapshot().context.measurements;
      expect(measurement).toMatchObject({
        frameId: 'tau:root',
        startPoint: [10, 20, 30],
        endPoint: [10.003, 20, 30],
      });
      expect(measurement?.distance).toBeCloseTo(0.003, 12);
    } finally {
      actor.stop();
    }
  });
});
