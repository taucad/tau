import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { MeasurementAnchor } from '#constants/measurement.types.js';

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
  it('should retain an empty measurement list through inactive invalidations', () => {
    const actor = startMeasuring();
    try {
      actor.send({ type: 'setMeasureActive', payload: false });
      const { measurements } = actor.getSnapshot().context;
      actor.send({ type: 'measurementPoseChanged', revision: 1 });
      actor.send({ type: 'measurementSourceChanged', geometryKey: 'new' });
      actor.send({ type: 'measurementCutChanged' });
      expect(actor.getSnapshot().context.measurements).toBe(measurements);
    } finally {
      actor.stop();
    }
  });

  it('keeps a touch-previewed target through catalog refresh until Use target commits once', () => {
    const actor = startMeasuring();
    try {
      actor.send({
        type: 'setMeasureCandidates',
        candidates: [
          { id: 'near', label: 'Part: endpoint' },
          { id: 'far', label: 'Part: midpoint' },
        ],
        activeId: 'near',
      });
      actor.send({ type: 'chooseMeasureCandidate', id: 'near' });
      actor.send({ type: 'requestMeasureCatalog' });
      actor.send({
        type: 'setMeasureCandidates',
        candidates: [
          { id: 'far', label: 'Part: midpoint' },
          { id: 'near', label: 'Part: endpoint' },
        ],
        activeId: 'far',
      });
      expect(actor.getSnapshot().context.measureActiveCandidateId).toBe('near');
      actor.send({ type: 'requestMeasureCandidateCommit' });
      expect(actor.getSnapshot().context.measureCommitRequest).toBe(1);
      expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
      actor.send({ type: 'clearMeasureChosenCandidate' });
      actor.send({
        type: 'setMeasureCandidates',
        candidates: [
          { id: 'near', label: 'Part: endpoint' },
          { id: 'far', label: 'Part: midpoint' },
        ],
        activeId: 'far',
      });
      expect(actor.getSnapshot().context.measureChosenCandidateId).toBeUndefined();
      expect(actor.getSnapshot().context.measureActiveCandidateId).toBe('far');
    } finally {
      actor.stop();
    }
  });
  it('hydrates legacy pins as snapshots and anchored pins as unresolved history', () => {
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      {
        input: {
          pinnedMeasurements: [
            { id: 'old', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 },
            {
              id: 'new',
              frameId: 'tau:root',
              startPoint: [0, 0, 0],
              endPoint: [1, 0, 0],
              distance: 1,
              status: 'pending',
              geometryKey: 'g',
              anchors: [{ point: [0, 0, 0], geometryKey: 'g', occurrenceId: 'part', label: 'Body', quality: 'mesh' }],
            },
          ],
        },
      },
    ).start();
    expect(actor.getSnapshot().context.measurements.map(({ status }) => status)).toEqual(['snapshot', 'out-of-date']);
    actor.stop();
  });
  it('retains operation and source, cancels a mixed source half, and marks the old result out of date', () => {
    const actor = startMeasuring();
    try {
      const first: MeasurementAnchor = {
        point: [0, 0, 0],
        geometryKey: 'old',
        occurrenceId: 'piece:1',
        featureId: 'edge:0',
        label: 'Edge',
        quality: 'mesh',
      };
      actor.send({ type: 'startMeasurement', payload: first.point, anchor: first });
      actor.send({
        type: 'completeMeasurement',
        payload: [1, 0, 0],
        anchor: { ...first, point: [1, 0, 0] },
        operation: 'point-distance',
      });
      expect(actor.getSnapshot().context.measurements[0]).toMatchObject({
        geometryKey: 'old',
        operation: 'point-distance',
        quality: 'mesh',
        status: 'current',
      });
      actor.send({ type: 'startMeasurement', payload: first.point, anchor: first });
      actor.send({ type: 'measurementSourceChanged', geometryKey: 'new' });
      actor.send({ type: 'cancelCurrentMeasurement' });
      expect(actor.getSnapshot().context.currentMeasurementStart).toBeUndefined();
      expect(actor.getSnapshot().matches({ operational: { measure: { on: 'selecting' } } })).toBe(true);
      expect(actor.getSnapshot().context.measurements[0]?.status).toBe('out-of-date');
    } finally {
      actor.stop();
    }
  });

  it('marks anchored measurements out of date on pose change and rejects late query results', () => {
    const actor = startMeasuring();
    try {
      actor.send({
        type: 'addMeasurementRecord',
        record: {
          id: 'pending',
          frameId: 'tau:root',
          startPoint: [0, 0, 0],
          endPoint: [0, 0, 0],
          distance: 0,
          geometryKey: 'g',
          poseRevision: 1,
          status: 'pending',
          operation: 'minimum-distance',
          quality: 'cad',
        },
      });
      actor.send({ type: 'measurementPoseChanged', revision: 2 });
      actor.send({ type: 'resolveMeasurementRecord', id: 'pending', patch: { status: 'current', distance: 1 } });
      expect(actor.getSnapshot().context.measurements[0]).toMatchObject({ status: 'out-of-date', distance: 0 });
      const { measurements } = actor.getSnapshot().context;
      actor.send({ type: 'measurementPoseChanged', revision: 3 });
      actor.send({ type: 'measurementSourceChanged', geometryKey: 'different' });
      actor.send({ type: 'measurementCutChanged' });
      expect(actor.getSnapshot().context.measurements).toBe(measurements);
    } finally {
      actor.stop();
    }
  });
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
