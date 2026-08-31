import { createActor, fromPromise } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = () =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
    input: { defaultCameraFovAngle: 60, graphicsBackendPreference: 'webgl' },
  });

describe('graphics machine physical scene metadata', () => {
  it('stores physical radius and center and initializes a selected section through the geometry center', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [10, 20, 30] });
      expect(actor.getSnapshot().context.geometryRadius).toBe(0.1);
      expect(actor.getSnapshot().context.geometryCenter).toEqual([10, 20, 30]);

      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'selectSectionView', payload: 'xy' });
      expect(actor.getSnapshot().context.sectionViewPivot).toEqual([10, 20, 30]);
      expect(actor.getSnapshot().context.sectionViewTranslation).toBe(30);
    } finally {
      actor.stop();
    }
  });

  it('keeps a nonzero physical section pivot invariant through rotation and direction changes', () => {
    const actor = createGraphicsActor();
    actor.start();
    try {
      actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [10, 20, 30] });
      actor.send({ type: 'setSectionViewActive', payload: true });
      actor.send({ type: 'selectSectionView', payload: 'xy' });
      actor.send({ type: 'setSectionViewRotation', payload: [0.1, 0.2, 0.3] });
      actor.send({ type: 'toggleSectionViewDirection' });

      expect(actor.getSnapshot().context.sectionViewPivot).toEqual([10, 20, 30]);
      expect(actor.getSnapshot().context.sectionViewTranslation).toBe(30);
      expect(actor.getSnapshot().context.sectionViewDirection).toBe(1);
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
