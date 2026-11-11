/**
 * The framing actor against a scripted camera child, and against a real camera where the pose it leaves matters. The
 * first eight rows are `use-camera-framing.test.ts` re-homed (graphics event-driven state charter, G5); that file stays
 * until the wiring lane (G5b) deletes the hook. Path table (the shortest path to each state), kept current with
 * `pathTable`:
 *
 * 1. `awaitingGeometry`: initial
 * 2. `framed`: `geometryBoundsMeasured`
 */
import { createCameraView } from '@taucad/camera';
import type { CameraBounds } from '@taucad/camera';
import { cameraIgnoredEvents, createCameraActor } from '@taucad/camera/machine';
import type { CameraMachineEvent, CameraPose } from '@taucad/camera/machine';
import { createFakeCallbackActors } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  createFramingActor,
  framingEventTypes,
  framingIgnoredEvents,
  framingMachine,
} from '#machines/framing.machine.js';
import type { FramingCameraRef, FramingEvent, FramingInput, FramingPendingPose } from '#machines/framing.machine.js';

const configured = { direction: [0, 0, 1], up: [0, 1, 0] } as const;
const box = (half: number, center: readonly [number, number, number] = [0, 0, 0]): CameraBounds => ({
  min: [center[0] - half, center[1] - half, center[2] - half],
  max: [center[0] + half, center[1] + half, center[2] + half],
});
const surface = (width: number, height: number) => ({ width, height, pixelRatio: 2 });
const measured = (
  key: string,
  bounds: CameraBounds,
  radius: number,
): Extract<FramingEvent, { type: 'geometryBoundsMeasured' }> => ({
  type: 'geometryBoundsMeasured',
  key,
  bounds,
  radius,
});
const savedPose: CameraPose = { target: [8, 9, 10], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 7 };
const pending = (requestId = 'record-1'): FramingPendingPose => ({ requestId, pose: savedPose });

/* One guard per test over every actor the test starts: the framing actor and its camera (MC-R23). */
let current: { test: string | undefined; guard: ReturnType<typeof guardActors> } | undefined;
const testGuard = (): ReturnType<typeof guardActors> => {
  const test = expect.getState().currentTestName;
  if (current === undefined || current.test !== test || test === undefined) {
    current = { test, guard: guardActors({ ignore: { framing: framingIgnoredEvents, camera: cameraIgnoredEvents } }) };
  }
  return current.guard;
};

/** A scripted camera child: it records every event the framing actor sends it, and answers nothing. */
const scriptCamera = (inspect = true) => {
  const fakes = createFakeCallbackActors();
  const camera = createActor(fakes.actor('camera'), inspect ? { inspect: testGuard().inspect } : {}).start();
  let from = 0;
  const sent = (): CameraMachineEvent[] => fakes.deliveries.slice(from).map(({ event }) => event as CameraMachineEvent);
  const clear = (): void => {
    from = fakes.deliveries.length;
  };
  return { camera: camera as unknown as FramingCameraRef, sent, clear };
};

const startFraming = (input: Partial<FramingInput> & Pick<FramingInput, 'camera'>) => {
  const actor = createFramingActor({
    input: { identity: 'file-a', orientation: configured, margin: 0.1, ...input },
    inspect: testGuard().inspect,
  });
  actor.start();
  return actor;
};

/** A real camera, so a row can read the pose the framing actor's events leave. */
const startCamera = () =>
  createCameraActor({
    input: {
      initialView: createCameraView({
        frameId: 'framing-test',
        requestedVerticalFieldOfView: 45,
        perspectiveZoom: 1,
        target: [0, 0, 0],
        direction: [1, -1, 1],
        up: [0, 0, 1],
        verticalSpan: 10,
        bounds: box(1),
        viewport: { width: 800, height: 600, pixelRatio: 2 },
      }),
    },
    inspect: testGuard().inspect,
  }).start();

const samples: Record<FramingEvent['type'], readonly FramingEvent[]> = {
  geometryBoundsMeasured: [measured('a', box(2), 4)],
  fitRequested: [{ type: 'fitRequested' }],
  entryChanged: [{ type: 'entryChanged', identity: 'file-b', pendingPose: pending() }],
};
const pathOptions = {
  input: {
    camera: scriptCamera(false).camera,
    identity: 'file-a',
    orientation: configured,
    margin: 0.1,
  } satisfies FramingInput,
  events: Object.values(samples).flat(),
  limit: 100,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('framing machine', () => {
  describe('re-homed from use-camera-framing', () => {
    it('should frame the first real bounds facing the configured orientation', () => {
      const camera = startCamera();
      const framing = startFraming({ camera });

      framing.send(measured('a', { min: [-10, -5, -2], max: [10, 5, 2] }, 12));

      const { view, lastChange } = camera.getSnapshot().context;
      expect(view.direction).toEqual(configured.direction);
      expect(view.up).toEqual(configured.up);
      expect(view.bounds).toEqual({ min: [-10, -5, -2], max: [10, 5, 2] });
      // The first frame is automatic, so the view record does not save it (D20).
      expect(lastChange).toEqual({ source: 'framing', revision: 1 });
      expect(framing.getSnapshot().value).toBe('framed');
    });

    it('should restore the saved pose after the first frame', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera, pendingPose: pending() });
      framing.send(measured('a', box(2), 4));

      // A pending pose replaces whatever the frame faces, so the frame takes no orientation.
      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' },
        { type: 'adoptPersistedPose', requestId: 'record-1', pose: savedPose },
      ]);

      const camera = startCamera();
      startFraming({ camera, pendingPose: pending() }).send(measured('a', box(2), 4));
      const { view, lastChange } = camera.getSnapshot().context;
      expect({ target: view.target, direction: view.direction, up: view.up, verticalSpan: view.verticalSpan }).toEqual(
        savedPose,
      );
      expect(lastChange.source).toBe('persisted');
    });

    it('should not re-frame when a remounted canvas re-measures the same geometry', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(2), 4));
      scripted.clear();

      framing.send(measured('a', box(2), 4));

      expect(scripted.sent()).toEqual([{ type: 'setBounds', bounds: box(2) }]);
    });

    it('should re-frame and apply the pending pose once when the entry identity changes', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(2), 4));
      scripted.clear();

      framing.send({ type: 'entryChanged', identity: 'file-b', pendingPose: pending('record-b') });
      // The switch takes effect on the next geometry: the file that is leaving is not re-framed.
      expect(scripted.sent()).toEqual([]);
      expect(framing.getSnapshot().value).toBe('awaitingGeometry');

      framing.send(measured('b', box(2.25), 4.5));
      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(2.25), margin: 0.1, source: 'framing' },
        { type: 'adoptPersistedPose', requestId: 'record-b', pose: savedPose },
      ]);

      scripted.clear();
      framing.send(measured('b2', box(4.5), 9));
      expect(scripted.sent()).toEqual([{ type: 'frameGeometry', bounds: box(4.5), margin: 0.1, source: 'framing' }]);
    });

    it('should preserve the placed camera throughout repeated pane resizing', () => {
      const camera = startCamera();
      const framing = startFraming({ camera });
      framing.send(measured('a', box(1), 2));
      camera.send({
        type: 'poseObserved',
        source: 'input',
        target: [4, 5, 6],
        direction: [0, 1, 0],
        up: [0, 0, 1],
        verticalSpan: 20,
      });
      const placed = camera.getSnapshot().context.view;

      for (const width of [700, 600, 400, 900, 1400, 800]) {
        // The viewport reaches the camera from its driver; a resize re-measures the same presentation.
        camera.send({ type: 'setViewport', viewport: { width, height: 600, pixelRatio: 2 } });
        framing.send(measured('a', box(1), 2));
        const resized = camera.getSnapshot().context.view;
        expect(resized.target).toEqual(placed.target);
        expect(resized.verticalSpan).toBe(placed.verticalSpan);
        expect(resized.direction).toEqual(placed.direction);
        expect(resized.up).toEqual(placed.up);
      }
    });

    it('should fit the latest viewport on request without turning the camera', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(1), 2));
      scripted.clear();

      framing.send({ type: 'fitRequested', viewport: { width: 1400, height: 500, pixelRatio: 2 } });

      expect(scripted.sent()).toEqual([
        { type: 'setViewport', viewport: { width: 1400, height: 500, pixelRatio: 2 } },
        // Fit view is the person's command, so the view record saves it (D20).
        { type: 'frameGeometry', bounds: box(1), margin: 0.1, source: 'fit' },
      ]);
    });

    it('should publish the canvas viewport before the first frame', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });

      framing.send({ ...measured('a', box(1), 2), viewport: surface(800, 600) });

      expect(scripted.sent()).toEqual([
        { type: 'setViewport', viewport: { width: 800, height: 600, pixelRatio: 2 } },
        { type: 'frameGeometry', bounds: box(1), margin: 0.1, orientation: configured, source: 'framing' },
      ]);
    });

    it('should not frame empty geometry', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });

      framing.send(measured('empty', box(1), 0));
      framing.send(
        measured('empty', { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, 1),
      );

      expect(scripted.sent()).toEqual([]);
      expect(framing.getSnapshot().value).toBe('awaitingGeometry');
    });
  });

  describe('refit and entry rules', () => {
    it('should leave the camera alone under the refit ratio and refit once the drift adds up', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(10), 10));
      scripted.clear();

      framing.send(measured('b', box(10.6), 10.6));
      expect(scripted.sent()).toEqual([]);

      // Each step is under 10 % of the last, but the reference is the last frame, which is now 12 % away.
      framing.send(measured('c', box(11.2), 11.2));
      expect(scripted.sent()).toEqual([{ type: 'frameGeometry', bounds: box(11.2), margin: 0.1, source: 'framing' }]);
    });

    it('should refit on a translated model whose radius did not change', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(1), 2));
      scripted.clear();

      framing.send(measured('b', box(1, [5, 0, 0]), 2));

      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(1, [5, 0, 0]), margin: 0.1, source: 'framing' },
      ]);
    });

    it('should fit the latest measurement, including one under the refit ratio', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(10), 10));
      framing.send(measured('b', box(10.5), 10.5));
      scripted.clear();

      framing.send({ type: 'fitRequested' });

      expect(scripted.sent()).toEqual([{ type: 'frameGeometry', bounds: box(10.5), margin: 0.1, source: 'fit' }]);
    });

    it('should adopt a pending orientation by re-framing the first bounds facing it', () => {
      const scripted = scriptCamera();
      const orientation = { direction: [1, 0, 0], up: [0, 0, 1] } as const;
      const framing = startFraming({
        camera: scripted.camera,
        pendingPose: { requestId: 'look', orientation },
        margin: 0.2,
      });

      framing.send(measured('a', box(1), 2));

      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(1), margin: 0.2, source: 'framing' },
        { type: 'adoptPersistedPose', requestId: 'look', orientation, margin: 0.2 },
      ]);
    });

    it('should not publish a viewport with no area', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });

      framing.send({ ...measured('a', box(1), 2), viewport: surface(0, 600) });

      expect(scripted.sent().map(({ type }) => type)).toEqual(['frameGeometry']);
    });

    it('should apply the latest record that loads before the first frame of the same entry', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      // The view knew its entry before the record loaded (use-view-settings-sync re-arms the pending pose today).
      framing.send({ type: 'entryChanged', identity: 'file-a', pendingPose: pending('late') });

      framing.send(measured('a', box(1), 2));

      expect(scripted.sent().filter(({ type }) => type === 'adoptPersistedPose')).toEqual([
        { type: 'adoptPersistedPose', requestId: 'late', pose: savedPose },
      ]);
    });

    it('should treat an entry change to the framed identity as a re-delivery', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera, pendingPose: pending() });
      framing.send(measured('a', box(1), 2));

      framing.send({ type: 'entryChanged', identity: 'file-a', pendingPose: pending('other') });
      framing.send(measured('a', box(1), 2));

      expect(scripted.sent().filter(({ type }) => type === 'adoptPersistedPose')).toEqual([
        { type: 'adoptPersistedPose', requestId: 'record-1', pose: savedPose },
      ]);
      expect(framing.getSnapshot().value).toBe('framed');
    });

    it('should frame with the stage options the latest event carries', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      const turned = { direction: [0, 0, 1], up: [1, 0, 0] } as const;
      framing.send(measured('a', box(1), 2));
      // Fit view after the person changed the fit margin.
      framing.send({ type: 'fitRequested', stage: { orientation: configured, margin: 0.3 } });
      // A file switch after the person changed the up direction: the host resolved the up against it.
      framing.send({ type: 'entryChanged', identity: 'file-b' });
      framing.send({ ...measured('b', box(2), 4), stage: { orientation: turned, margin: 0.2 } });
      framing.send(measured('b2', box(4), 8));

      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(1), margin: 0.1, orientation: configured, source: 'framing' },
        { type: 'frameGeometry', bounds: box(1), margin: 0.3, source: 'fit' },
        { type: 'frameGeometry', bounds: box(2), margin: 0.2, orientation: turned, source: 'framing' },
        { type: 'frameGeometry', bounds: box(4), margin: 0.2, source: 'framing' },
      ]);
    });

    it('should drop a pending pose when the entry changes again before its geometry', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera, pendingPose: pending() });

      framing.send({ type: 'entryChanged', identity: 'file-b' });
      framing.send(measured('b', box(1), 2));

      expect(scripted.sent()).toEqual([
        { type: 'frameGeometry', bounds: box(1), margin: 0.1, orientation: configured, source: 'framing' },
      ]);
    });

    it('should not fit while the latest measurement is empty', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(1), 2));
      framing.send(measured('rebuilding', box(1), 0));
      scripted.clear();

      framing.send({ type: 'fitRequested' });
      expect(scripted.sent()).toEqual([]);

      framing.send(measured('a', box(1), 2));
      framing.send({ type: 'fitRequested' });
      expect(scripted.sent()).toEqual([
        { type: 'setBounds', bounds: box(1) },
        { type: 'frameGeometry', bounds: box(1), margin: 0.1, source: 'fit' },
      ]);
    });

    /* A deliberate change (D14): the hook's reference died with its mount, so a remount only refreshed the bounds. */
    it('should refit when a remounted canvas measures a new presentation that moved over 10 %', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });
      framing.send(measured('a', box(1), 2));
      scripted.clear();

      framing.send(measured('edited-while-unmounted', box(2), 4));

      expect(scripted.sent()).toEqual([{ type: 'frameGeometry', bounds: box(2), margin: 0.1, source: 'framing' }]);
    });

    it('should ignore Fit view before the first geometry', () => {
      const scripted = scriptCamera();
      const framing = startFraming({ camera: scripted.camera });

      framing.send({ type: 'fitRequested' });

      expect(scripted.sent()).toEqual([]);
    });
  });

  describe('totality', () => {
    it('should sample exactly the exported alphabet', () => {
      expect(Object.keys(samples).toSorted()).toEqual([...framingEventTypes].toSorted());
    });

    it('should reach every state along the path table', () => {
      expect(
        pathTable(framingMachine, pathOptions).map(({ state, events }) => [state, events.map(({ type }) => type)]),
      ).toEqual([
        ['awaitingGeometry', []],
        ['framed', ['geometryBoundsMeasured']],
      ]);
      expect(unreachedStates(framingMachine, pathOptions)).toEqual([]);
    });

    it('should answer every sampled event except the declared baseline', () => {
      expect(unansweredEvents(framingMachine, { ...pathOptions, ignore: framingIgnoredEvents })).toEqual([]);
    });

    it('should declare no baseline pair that the machine now answers', () => {
      expect(unansweredEvents(framingMachine, pathOptions)).toEqual(
        framingIgnoredEvents.map(([state, eventType]) => ({ state, eventType })),
      );
    });
  });
});
