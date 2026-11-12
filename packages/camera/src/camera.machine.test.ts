import * as fc from 'fast-check';
import { createActor, createCallbackLogic, setup } from 'xstate';
import type { ActorRefFrom, EventRejection } from 'xstate';
import { describe, expect, it } from 'vitest';
import { StepClock } from '@taucad/xstate-testing/clock';
import { recordEmitted } from '@taucad/xstate-testing/fakes';
import { guardActors } from '@taucad/xstate-testing/inspect';
import * as machineModule from '#camera.machine.js';
import {
  cameraIgnoredEvents,
  cameraMachine,
  cameraPoseSettleMilliseconds,
  cameraRefusedPayloadReason,
  createCameraActor as createRootCameraActor,
  createCameraRefusalInspector,
  selectCameraDriverSnapshot,
  selectCameraProjection,
} from '#camera.machine.js';
import type { CameraDriverEvent, CameraDriverInput, CameraMachineEvent, CameraSource } from '#camera.machine.js';
import {
  createCameraView,
  maximumProjectedPixelDelta,
  resolveCameraFrame,
  resolveCameraState,
  resolveCameraUp,
} from '#camera-domain.js';
import type { CameraBounds, CameraState, CameraVector } from '#camera-domain.js';

const initialView = createCameraView({
  frameId: 'test-root',
  requestedVerticalFieldOfView: 60,
  perspectiveZoom: 1,
  target: [35, -20, 12],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 600,
  viewport: { width: 1536, height: 900, pixelRatio: 2 },
  bounds: { min: [-220, -180, -55], max: [220, 180, 55] },
});

const createCameraActor = () => createActor(cameraMachine, { input: { initialView } });

/* A payload from an untyped sender, which the event type would not admit. */
// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the payload is malformed on purpose.
const untyped = (event: Readonly<Record<string, unknown>>): CameraMachineEvent =>
  event as unknown as CameraMachineEvent;

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

describe('cameraMachine', () => {
  it('should record a failed driver at its root and keep its pose and its answers (MC-R12)', () => {
    const actor = createActor(
      cameraMachine.provide({
        actors: {
          cameraDriver: createCallbackLogic<CameraDriverEvent, CameraDriverInput>(() => {
            throw new Error('driver failed');
          }),
        },
      }),
      { input: { initialView } },
    ).start();
    expect(actor.getSnapshot().status).toBe('active');
    expect(actor.getSnapshot().context.fault).toContain('driver failed');
    const { revision } = actor.getSnapshot().context;
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    expect(actor.getSnapshot().context.revision).toBe(revision + 1);
    actor.stop();
  });

  it('exports exactly one machine value and starts headlessly', () => {
    const actor = createCameraActor().start();

    expect(selectCameraProjection(actor.getSnapshot())).toEqual({ kind: 'perspective', verticalFieldOfView: 60 });
    expect(Object.keys(machineModule).sort()).toEqual([
      'cameraIgnoredEvents',
      'cameraMachine',
      'cameraPoseSettleMilliseconds',
      'cameraRefusedPayloadReason',
      'createCameraActor',
      'createCameraRefusalInspector',
      'selectCameraDriverSnapshot',
      'selectCameraProjection',
    ]);
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([cameraMachine]);

    actor.stop();
  });

  it('crosses both native endpoints inside the physical-pixel budget', () => {
    const actor = createCameraActor().start();

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    let snapshot = actor.getSnapshot();
    expect(selectCameraProjection(snapshot)).toEqual({ kind: 'orthographic' });
    const handoff = snapshot.context.handoffVerticalFieldOfView;
    expect(handoff).toBeDefined();
    expect(
      maximumProjectedPixelDelta({ view: snapshot.context.view, perspectiveVerticalFieldOfView: handoff ?? 60 }),
    ).toBeLessThanOrEqual(0.25);

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 60 });
    snapshot = actor.getSnapshot();
    expect(selectCameraProjection(actor.getSnapshot())).toEqual({ kind: 'perspective', verticalFieldOfView: 60 });

    actor.stop();
  });

  it('recalibrates the parked orthographic handoff after viewport changes', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    actor.send({ type: 'setViewport', viewport: { width: 900, height: 900, pixelRatio: 2 } });

    const snapshot = actor.getSnapshot();
    const { handoffVerticalFieldOfView } = snapshot.context;
    expect(handoffVerticalFieldOfView).toBeDefined();
    expect(
      maximumProjectedPixelDelta({
        view: snapshot.context.view,
        perspectiveVerticalFieldOfView: handoffVerticalFieldOfView ?? 60,
      }),
    ).toBeLessThanOrEqual(0.25);

    actor.stop();
  });

  it('keeps the calibrated handoff when a deep zoom leaves no FOV within the budget', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    const calibrated = actor.getSnapshot().context.handoffVerticalFieldOfView;

    actor.send({
      type: 'poseObserved',
      source: 'input',
      target: [35, -20, 12],
      direction: [1, -1, 0.7],
      up: [0, 0, 1],
      verticalSpan: 1e-9,
    });
    const snapshot = actor.getSnapshot();
    expect(snapshot.status).toBe('active');
    expect(snapshot.context.view.verticalSpan).toBe(1e-9);
    expect(snapshot.context.handoffVerticalFieldOfView).toBe(calibrated);

    actor.stop();
  });

  it('keeps one replaceable driver synchronized across zero-FOV crossings', () => {
    const snapshots = [] as Array<Readonly<{ projection: string; revision: number }>>;
    let driverStarts = 0;
    let driverStops = 0;
    const driver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ input, receive }) => {
      driverStarts++;
      snapshots.push({ projection: input.snapshot.projection.kind, revision: input.snapshot.revision });
      receive((event) => {
        snapshots.push({ projection: event.snapshot.projection.kind, revision: event.snapshot.revision });
      });
      return () => {
        driverStops++;
      };
    });
    const actor = createActor(cameraMachine.provide({ actors: { cameraDriver: driver } }), {
      input: { initialView },
    }).start();

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0.1 });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });

    expect(snapshots).toEqual([
      { projection: 'perspective', revision: 0 },
      { projection: 'orthographic', revision: 1 },
      { projection: 'perspective', revision: 2 },
      { projection: 'orthographic', revision: 3 },
    ]);
    expect(driverStarts).toBe(1);
    actor.stop();
    expect(driverStops).toBe(1);
  });

  it('updates, frames and serializes canonical state', () => {
    const actor = createCameraActor().start();
    actor.send({
      type: 'poseObserved',
      source: 'input',
      target: [1, 2, 3],
      direction: [2, -2, 1],
      up: [0, 0, 1],
      verticalSpan: 25,
    });
    actor.send({ type: 'frame', bounds: { min: [100, 200, 300], max: [200, 400, 500] } });

    const snapshot = actor.getSnapshot();
    expect(snapshot.context.view.target).toEqual([150, 300, 400]);
    expect(() => JSON.stringify(snapshot.context)).not.toThrow();
    expect(structuredClone(snapshot.context)).toEqual(snapshot.context);
    expect(selectCameraDriverSnapshot(snapshot).revision).toBe(2);

    actor.stop();
  });

  it('should keep no home pose: the context holds one view and no initial view (charter D9)', () => {
    const actor = createCameraActor().start();

    expect(Object.keys(actor.getSnapshot().context)).not.toContain('initialView');
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately outside the alphabet.
    expect(actor.getSnapshot().can({ type: 'saveHome' } as unknown as CameraMachineEvent)).toBe(false);
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately outside the alphabet.
    expect(actor.getSnapshot().can({ type: 'reset' } as unknown as CameraMachineEvent)).toBe(false);

    actor.stop();
  });

  it('should preserve fitted perspective zoom across endpoint changes', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'frame', bounds: { min: [0, 0, 0], max: [20, 14, 8] }, margin: 0.1 });
    const framedZoom = actor.getSnapshot().context.view.perspectiveZoom;
    expect(framedZoom).not.toBe(1);
    const framedSpan = actor.getSnapshot().context.view.verticalSpan;
    const distanceAt60 = resolveCameraFrame({ view: actor.getSnapshot().context.view }).distance;

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 45 });
    expect(actor.getSnapshot().context.view).toMatchObject({
      perspectiveZoom: framedZoom,
      verticalSpan: framedSpan,
    });
    expect(resolveCameraFrame({ view: actor.getSnapshot().context.view }).distance).toBeGreaterThan(distanceAt60);

    actor.stop();
  });

  it('rejects invalid input', () => {
    const inputErrors: unknown[] = [];
    const invalidInputActor = createActor(cameraMachine, {
      input: { initialView: { ...initialView, viewport: { ...initialView.viewport, width: 0 } } },
    });
    invalidInputActor.subscribe({
      error(error) {
        inputErrors.push(error);
      },
    });
    invalidInputActor.start();
    expect(inputErrors[0]).toBeInstanceOf(RangeError);
  });

  it.each([
    [-1, 'a negative field of view'],
    [Number.NaN, 'a non-finite field of view'],
    [180, 'a field of view above 179 degrees'],
  ])('should refuse %s (%s) and stay active on the last valid view', (value) => {
    const errors: unknown[] = [];
    const actor = createCameraActor();
    actor.subscribe({
      error(error) {
        errors.push(error);
      },
    });
    actor.start();
    const before = actor.getSnapshot();

    expect(before.can({ type: 'setVerticalFieldOfView', verticalFieldOfView: value })).toBe(false);
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: value });

    expect(errors).toEqual([]);
    expect(actor.getSnapshot().status).toBe('active');
    expect(actor.getSnapshot().context).toBe(before.context);
    actor.stop();
  });
});

const pose = { target: [1, 2, 3], direction: [0, -1, 0], up: [0, 0, 1], verticalSpan: 20 } as const;
const otherPose = { target: [4, 5, 6], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 30 } as const;

/* A camera actor on a stepped clock that fails its test on any dead letter, unanswered delivery or fault. */
const startCamera = () => {
  const clock = new StepClock();
  const guard = guardActors({ ignore: { camera: cameraIgnoredEvents } });
  const syncs: CameraDriverEvent[] = [];
  const driver = createCallbackLogic<CameraDriverEvent, CameraDriverInput>(({ receive }) => {
    receive((event) => {
      syncs.push(event);
    });
    return () => undefined;
  });
  const rejections: EventRejection[] = [];
  const actor = createRootCameraActor({
    machine: cameraMachine.provide({ actors: { cameraDriver: driver } }),
    input: { initialView },
    clock,
    inspect: guard.inspect,
    onRejectedEvent: (rejection) => rejections.push(rejection),
  });
  const emitted = recordEmitted(actor);
  actor.start();
  return { actor, clock, emitted, guard, rejections, syncs };
};

describe('cameraMachine provenance (charter I1, D2, D20)', () => {
  it('should start idle with the rig pose attributed to framing at revision 0', () => {
    const { actor } = startCamera();

    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    expect(actor.getSnapshot().context.lastChange).toEqual({ source: 'framing', revision: 0 });
    actor.stop();
  });

  it('should record one source and one revision for every change of a scripted sequence', () => {
    const { actor, emitted, syncs } = startCamera();
    const bounds = { min: [-5, -2, -1], max: [5, 2, 1] } as const;
    const script: ReadonlyArray<readonly [event: CameraMachineEvent, source: CameraSource]> = [
      [{ type: 'frameGeometry', bounds, margin: 0.1, source: 'framing' }, 'framing'],
      [{ type: 'interactionStarted' }, 'framing'],
      [{ type: 'poseObserved', ...pose, source: 'input' }, 'input'],
      [{ type: 'interactionEnded' }, 'input'],
      [{ type: 'setViewport', viewport: { width: 640, height: 480, pixelRatio: 2 } }, 'viewport'],
      [{ type: 'setBounds', bounds }, 'bounds'],
      [{ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 }, 'fov'],
      [{ type: 'setUpDirection', axis: 'y' }, 'up'],
      [{ type: 'frameGeometry', bounds, margin: 0.1, source: 'fit' }, 'fit'],
      [{ type: 'frameBounds', bounds: { min: [0, 0, 0], max: [1, 1, 1] }, margin: 0.2, source: 'focus' }, 'focus'],
      [{ type: 'interactionStarted' }, 'focus'],
      [{ type: 'poseObserved', ...otherPose, source: 'gizmo' }, 'gizmo'],
      [{ type: 'poseObserved', ...pose, source: 'input' }, 'input'],
      [{ type: 'frame', margin: 0.1 }, 'framing'],
    ];

    const seen: Array<Readonly<{ source: CameraSource; revision: number }>> = [];
    for (const [event] of script) {
      actor.send(event);
      seen.push(actor.getSnapshot().context.lastChange);
    }

    let revision = 0;
    const expected = script.map(([event, source]) => {
      revision += event.type === 'interactionStarted' || event.type === 'interactionEnded' ? 0 : 1;
      return { source, revision };
    });
    expect(seen).toEqual(expected);
    expect(actor.getSnapshot().context.revision).toBe(revision);
    // One driver synchronization and one `viewChanged` per revision, each carrying the change that made it.
    const changes = expected.filter((change, index) => change.revision !== (expected[index - 1]?.revision ?? 0));
    expect(syncs.map((sync) => sync.snapshot.lastChange)).toEqual(changes);
    expect(emitted.filter((event) => event.type === 'viewChanged')).toEqual(
      changes.map((change) => ({ type: 'viewChanged', ...change, verticalSpan: expect.any(Number) as unknown })),
    );
    actor.stop();
  });

  it('should carry the resulting vertical span on viewChanged', () => {
    const { actor, emitted } = startCamera();

    actor.send({ type: 'poseObserved', ...pose, source: 'input' });

    expect(emitted).toEqual([{ type: 'viewChanged', revision: 1, source: 'input', verticalSpan: 20 }]);
    actor.stop();
  });

  it('should keep the deprecated frame alias on its mapped source', () => {
    const { actor } = startCamera();

    actor.send({ type: 'frame', margin: 0.1 });

    expect(actor.getSnapshot().context.lastChange).toEqual({ source: 'framing', revision: 1 });
    actor.stop();
  });

  it('should take a render frame carried by a pose in the same change', () => {
    const { actor, syncs, emitted } = startCamera();
    const renderFrame = {
      anchorFrameId: initialView.frameId,
      originMeters: [5, 0, 0],
      metersPerRenderUnit: 0.5,
    } as const;

    actor.send({ type: 'poseObserved', ...pose, source: 'input', renderFrame });

    const { context } = actor.getSnapshot();
    expect(context.renderFrame).toEqual(renderFrame);
    expect(context.revision).toBe(1);
    expect(syncs).toHaveLength(1);
    expect(syncs[0]?.snapshot.renderFrame).toEqual(renderFrame);
    expect(emitted.filter((event) => event.type === 'viewChanged')).toHaveLength(1);
    actor.stop();
  });

  it('should refuse a pose whose render frame names another frame', () => {
    const { actor, guard } = startCamera();
    const before = actor.getSnapshot();

    actor.send({
      type: 'poseObserved',
      ...pose,
      source: 'input',
      renderFrame: { anchorFrameId: 'other', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
    });

    expect(actor.getSnapshot()).toBe(before);
    expect(guard.take('unanswered')).toHaveLength(1);
    actor.stop();
  });
});

describe('cameraMachine input states (charter D3, D13)', () => {
  it('should drag while a gesture is held, settle on release and return to idle after poseSettle', () => {
    const { actor, clock } = startCamera();

    actor.send({ type: 'interactionStarted' });
    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'held' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    expect(actor.getSnapshot().value).toEqual({ input: 'dragging', gesture: 'held' });
    actor.send({ type: 'interactionEnded' });
    expect(actor.getSnapshot().value).toEqual({ input: 'settling', gesture: 'released' });

    clock.advance(cameraPoseSettleMilliseconds - 1);
    expect(actor.getSnapshot().matches({ input: 'settling' })).toBe(true);
    clock.advance(1);
    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    expect(cameraPoseSettleMilliseconds).toBe(250);
    actor.stop();
  });

  it('should stay dragging for as long as the gesture is held still', () => {
    const { actor, clock } = startCamera();
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });

    clock.advance(cameraPoseSettleMilliseconds * 20);

    expect(actor.getSnapshot().value).toEqual({ input: 'dragging', gesture: 'held' });
    actor.stop();
  });

  it('should return from settling to dragging when a new held gesture moves', () => {
    const { actor, clock } = startCamera();
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    actor.send({ type: 'interactionEnded' });

    actor.send({ type: 'interactionStarted' });
    expect(actor.getSnapshot().value).toEqual({ input: 'settling', gesture: 'held' });
    actor.send({ type: 'poseObserved', ...otherPose, source: 'gizmo' });
    expect(actor.getSnapshot().value).toEqual({ input: 'dragging', gesture: 'held' });
    // The settle timer of the earlier release was cancelled with its state.
    clock.advance(cameraPoseSettleMilliseconds * 2);
    expect(actor.getSnapshot().value).toEqual({ input: 'dragging', gesture: 'held' });
    actor.stop();
  });

  it('should not hold the camera in dragging for damping poses that follow a release', () => {
    const { actor, clock } = startCamera();
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    actor.send({ type: 'interactionEnded' });

    // Damping: the controls keep reporting poses after the release, and no further `interactionEnded` follows.
    for (let step = 1; step <= 5; step += 1) {
      clock.advance(100);
      actor.send({ type: 'poseObserved', ...pose, verticalSpan: 20 + step, source: 'input' });
      expect(actor.getSnapshot().value).toEqual({ input: 'settling', gesture: 'released' });
    }
    expect(actor.getSnapshot().context.revision).toBe(6);

    // Each damping pose restarts the settle window; the last one ends it.
    clock.advance(cameraPoseSettleMilliseconds - 1);
    expect(actor.getSnapshot().matches({ input: 'settling' })).toBe(true);
    clock.advance(1);
    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    actor.stop();
  });

  it('should settle, never drag, on a pose with no held gesture, such as a wheel step', () => {
    const { actor, clock } = startCamera();

    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    expect(actor.getSnapshot().value).toEqual({ input: 'settling', gesture: 'released' });
    clock.advance(cameraPoseSettleMilliseconds);

    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    actor.stop();
  });

  it('should keep the input state across commands and automatic changes', () => {
    const { actor } = startCamera();
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    actor.send({ type: 'setViewport', viewport: { width: 640, height: 480, pixelRatio: 1 } });
    actor.send({ type: 'frameGeometry', bounds: initialView.bounds, margin: 0.1, source: 'framing' });

    expect(actor.getSnapshot().value).toEqual({ input: 'dragging', gesture: 'held' });
    expect(actor.getSnapshot().context.lastChange).toEqual({ source: 'framing', revision: 4 });
    actor.stop();
  });

  it('should take a tap with no movement without leaving idle', () => {
    const { actor } = startCamera();

    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'interactionMoved' });
    actor.send({ type: 'interactionEnded' });

    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    expect(actor.getSnapshot().context.revision).toBe(0);
    actor.stop();
  });
});

describe('cameraMachine persisted adoption (charter I2, I8, D15)', () => {
  const dragTo = (actor: ReturnType<typeof startCamera>['actor']): void => {
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
  };

  it('should apply a persisted pose in idle in one change with the source persisted', () => {
    const { actor, emitted, syncs } = startCamera();

    actor.send({ type: 'adoptPersistedPose', requestId: 'r1', pose: otherPose });

    const { context, value } = actor.getSnapshot();
    expect(value).toEqual({ input: 'idle', gesture: 'released' });
    expect(context.view).toMatchObject(otherPose);
    expect(context.lastChange).toEqual({ source: 'persisted', revision: 1 });
    expect(syncs).toHaveLength(1);
    expect(emitted).toEqual([
      { type: 'viewChanged', revision: 1, source: 'persisted', verticalSpan: 30 },
      { type: 'adoptionApplied', requestId: 'r1', revision: 1 },
    ]);
    actor.stop();
  });

  it.each(['dragging', 'settling'] as const)(
    "should drop a persisted pose received in %s and keep the person's pose",
    (state) => {
      const { actor, clock, emitted, syncs } = startCamera();
      dragTo(actor);
      if (state === 'settling') {
        actor.send({ type: 'interactionEnded' });
      }
      const before = actor.getSnapshot();
      emitted.length = 0;
      syncs.length = 0;

      actor.send({ type: 'adoptPersistedPose', requestId: 'r2', pose: otherPose });

      expect(actor.getSnapshot().matches({ input: state })).toBe(true);
      expect(actor.getSnapshot().context).toBe(before.context);
      expect(syncs).toEqual([]);
      expect(emitted).toEqual([{ type: 'adoptionDropped', requestId: 'r2', reason: state }]);

      // Dropped, never queued: nothing applies once the camera is idle again.
      actor.send({ type: 'interactionEnded' });
      clock.advance(cameraPoseSettleMilliseconds);
      expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
      expect(actor.getSnapshot().context.view).toBe(before.context.view);
      expect(emitted).toHaveLength(1);
      actor.stop();
    },
  );

  it('should drop a persisted pose during the settle window that damping poses keep open', () => {
    const { actor, emitted } = startCamera();
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    emitted.length = 0;

    actor.send({ type: 'adoptPersistedPose', requestId: 'r3', pose: otherPose });

    expect(emitted).toEqual([{ type: 'adoptionDropped', requestId: 'r3', reason: 'settling' }]);
    actor.stop();
  });

  it('should adopt an orientation by re-framing the current bounds', () => {
    const { actor } = startCamera();
    const orientation = { direction: [0, 0, 1], up: [0, 1, 0] } as const;

    actor.send({ type: 'adoptPersistedPose', requestId: 'r4', orientation });

    const { view, lastChange } = actor.getSnapshot().context;
    expect(view).toMatchObject({ ...orientation, bounds: initialView.bounds, target: [0, 0, 0] });
    expect(lastChange).toEqual({ source: 'persisted', revision: 1 });
    actor.stop();
  });

  it.each([
    // Orthographic framing pads the bounds' half-height of 180 by 1 - margin; the default margin is 0.1.
    ['the default margin', undefined, (2 * 180) / (1 - 0.1)],
    ['a margin of 0.3', 0.3, (2 * 180) / (1 - 0.3)],
  ])('should re-frame an adopted orientation with %s', (_label, margin, verticalSpan) => {
    const { actor } = startCamera();
    const orientation = { direction: [0, 0, 1], up: [0, 1, 0] } as const;

    actor.send({ type: 'adoptPersistedPose', requestId: 'r6', verticalFieldOfView: 0, orientation, margin });

    expect(actor.getSnapshot().context.view.verticalSpan).toBeCloseTo(verticalSpan, 9);
    actor.stop();
  });

  it('should adopt a foreign field of view and up direction as persisted, in one change', () => {
    const { actor, emitted } = startCamera();

    actor.send({ type: 'adoptPersistedPose', requestId: 'r5', verticalFieldOfView: 0, upDirection: 'y' });

    const { context } = actor.getSnapshot();
    expect(selectCameraProjection(actor.getSnapshot())).toEqual({ kind: 'orthographic' });
    expect(context.view.up).toEqual(
      resolveCameraUp({ direction: initialView.direction, preferredUp: [0, 1, 0], fallbackUp: initialView.up }),
    );
    expect(context.view.up).toEqual([0, 1, 0]);
    expect(context.handoffVerticalFieldOfView).toBeDefined();
    expect(context.lastChange).toEqual({ source: 'persisted', revision: 1 });
    expect(emitted.map((event) => event.type)).toEqual(['viewChanged', 'adoptionApplied']);
    actor.stop();
  });

  it('should drop a foreign field of view and up direction while the person drags', () => {
    const { actor, emitted } = startCamera();
    dragTo(actor);
    const before = actor.getSnapshot().context;
    emitted.length = 0;

    actor.send({ type: 'adoptPersistedPose', requestId: 'r6', verticalFieldOfView: 0, upDirection: 'y' });

    expect(actor.getSnapshot().context).toBe(before);
    expect(emitted).toEqual([{ type: 'adoptionDropped', requestId: 'r6', reason: 'dragging' }]);
    actor.stop();
  });

  it('should compose every field of one record into a single revision', () => {
    const { actor, syncs } = startCamera();

    actor.send({
      type: 'adoptPersistedPose',
      requestId: 'r7',
      pose: otherPose,
      verticalFieldOfView: 35,
      upDirection: 'z',
    });

    const { context } = actor.getSnapshot();
    expect(context.view).toMatchObject({ ...otherPose, requestedVerticalFieldOfView: 35 });
    expect(context.revision).toBe(1);
    expect(syncs).toHaveLength(1);
    actor.stop();
  });
});

describe('cameraMachine echo (charter I3)', () => {
  it('should ignore a controls update that carries an echo revision', () => {
    const { actor, emitted, syncs } = startCamera();
    actor.send({ type: 'frameGeometry', bounds: initialView.bounds, margin: 0.1, source: 'framing' });
    const before = actor.getSnapshot();
    emitted.length = 0;
    syncs.length = 0;

    actor.send({ type: 'poseObserved', ...pose, source: 'input', echoRevision: 1 });

    expect(actor.getSnapshot().value).toEqual(before.value);
    expect(actor.getSnapshot().context).toBe(before.context);
    expect(emitted).toEqual([]);
    expect(syncs).toEqual([]);
    actor.stop();
  });

  it('should ignore a stamped update of an earlier synchronization too', () => {
    const { actor } = startCamera();
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 40 });

    actor.send({ type: 'poseObserved', ...pose, source: 'input', echoRevision: 1 });

    expect(actor.getSnapshot().context.lastChange).toEqual({ source: 'fov', revision: 2 });
    actor.stop();
  });

  it('should not let an echo leave idle or restart the settle window', () => {
    const { actor, clock } = startCamera();
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });
    clock.advance(cameraPoseSettleMilliseconds - 1);

    actor.send({ type: 'poseObserved', ...pose, source: 'input', echoRevision: 1 });
    clock.advance(1);

    expect(actor.getSnapshot().value).toEqual({ input: 'idle', gesture: 'released' });
    actor.stop();
  });
});

describe('cameraMachine atomic framing (charter I4)', () => {
  it('should produce one snapshot, one synchronization and one viewChanged per frameGeometry', () => {
    const { actor, emitted, syncs } = startCamera();
    let snapshots = 0;
    actor.subscribe(() => {
      snapshots += 1;
    });
    const bounds = { min: [10, 20, 30], max: [14, 26, 38] } as const;
    const orientation = { direction: [0, 0, 1], up: [0, 1, 0] } as const;

    actor.send({ type: 'frameGeometry', bounds, margin: 0.2, orientation, source: 'fit' });

    expect(snapshots).toBe(1);
    expect(syncs).toHaveLength(1);
    expect(emitted).toHaveLength(1);
    const { view, lastChange } = actor.getSnapshot().context;
    expect(view).toMatchObject({ ...orientation, bounds, target: [12, 23, 34] });
    expect(lastChange).toEqual({ source: 'fit', revision: 1 });
    actor.stop();
  });

  it('should frame a focus region and keep the scene bounds', () => {
    const { actor } = startCamera();
    const region = { min: [0.5, 0.5, 0.5], max: [1, 1, 1] } as const;

    actor.send({ type: 'frameBounds', bounds: region, margin: 0.1, source: 'focus' });

    const { view, lastChange } = actor.getSnapshot().context;
    expect(view.target).toEqual([0.75, 0.75, 0.75]);
    expect(view.bounds).toEqual(initialView.bounds);
    expect(lastChange).toEqual({ source: 'focus', revision: 1 });
    actor.stop();
  });

  /* Normalized device coordinates and depth of a point, computed from the resolved native camera state alone. */
  const projected = (state: CameraState, point: CameraVector): readonly [x: number, y: number, depth: number] => {
    const subtract = (left: CameraVector, right: CameraVector): CameraVector => [
      left[0] - right[0],
      left[1] - right[1],
      left[2] - right[2],
    ];
    const dot = (left: CameraVector, right: CameraVector): number =>
      left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
    const cross = (left: CameraVector, right: CameraVector): CameraVector => [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
    const unit = (vector: CameraVector): CameraVector => {
      const length = Math.hypot(...vector);
      return [vector[0] / length, vector[1] / length, vector[2] / length];
    };
    const forward = unit(subtract(state.target, state.position));
    const right = unit(cross(forward, state.up));
    const up = cross(right, forward);
    const relative = subtract(point, state.position);
    const depth = dot(relative, forward);
    const halfHeight =
      state.projection.kind === 'perspective'
        ? (depth * Math.tan((state.projection.verticalFieldOfView * Math.PI) / 360)) / state.projection.zoom
        : state.projection.verticalSpan / (2 * state.projection.zoom);
    return [dot(relative, right) / (halfHeight * state.aspect), dot(relative, up) / halfHeight, depth];
  };

  it('should keep random bounds inside the frustum for random viewports', () => {
    const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
    const size = fc.double({ min: 0.01, max: 1000, noNaN: true });
    const bounds: fc.Arbitrary<CameraBounds> = fc
      .tuple(fc.tuple(coordinate, coordinate, coordinate), fc.tuple(size, size, size))
      .map(([min, extent]) => ({ min, max: [min[0] + extent[0], min[1] + extent[1], min[2] + extent[2]] }));
    const orientations = [
      undefined,
      { direction: [1, -1, 0.7], up: [0, 0, 1] },
      { direction: [0, -1, 0], up: [0, 0, 1] },
      { direction: [0, 0, 1], up: [0, 1, 0] },
      { direction: [-0.3, 0.2, -1], up: [1, 0, 0] },
    ] as const;

    fc.assert(
      fc.property(
        fc.record({
          frameBounds: bounds,
          viewport: fc.record({
            width: fc.integer({ min: 16, max: 4096 }),
            height: fc.integer({ min: 16, max: 4096 }),
            pixelRatio: fc.constantFrom(1, 1.5, 2, 3),
          }),
          verticalFieldOfView: fc.oneof(fc.constant(0), fc.double({ min: 10, max: 120, noNaN: true })),
          margin: fc.double({ min: 0, max: 0.5, noNaN: true }),
          orientation: fc.constantFrom(...orientations),
          source: fc.constantFrom('framing', 'fit'),
        }),
        ({ frameBounds, viewport, verticalFieldOfView, margin, orientation, source }) => {
          const { actor } = startCamera();
          actor.send({ type: 'setViewport', viewport });
          actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView });

          actor.send({ type: 'frameGeometry', bounds: frameBounds, margin, orientation, source });

          const snapshot = actor.getSnapshot();
          expect(snapshot.context.lastChange).toEqual({ source, revision: 3 });
          const driver = selectCameraDriverSnapshot(snapshot);
          const state = resolveCameraState({
            view: driver.view,
            verticalFieldOfView: driver.projection.kind === 'perspective' ? driver.perspectiveVerticalFieldOfView : 0,
          });
          const tolerance = 1e-6;
          for (const x of [frameBounds.min[0], frameBounds.max[0]]) {
            for (const y of [frameBounds.min[1], frameBounds.max[1]]) {
              for (const z of [frameBounds.min[2], frameBounds.max[2]]) {
                const [horizontal, vertical, depth] = projected(state, [x, y, z]);
                expect(Math.abs(horizontal)).toBeLessThanOrEqual(1 + tolerance);
                expect(Math.abs(vertical)).toBeLessThanOrEqual(1 + tolerance);
                expect(depth).toBeGreaterThanOrEqual(state.clipping.near * (1 - tolerance));
                expect(depth).toBeLessThanOrEqual(state.clipping.far * (1 + tolerance));
              }
            }
          }
          actor.stop();
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('cameraMachine render frame and clip policy', () => {
  it('should default the render frame to the identity frame of the view', () => {
    const { actor } = startCamera();

    expect(actor.getSnapshot().context.renderFrame).toEqual({
      anchorFrameId: 'test-root',
      originMeters: [0, 0, 0],
      metersPerRenderUnit: 1,
    });
    expect(actor.getSnapshot().context.clipPolicy).toBeUndefined();
    actor.stop();
  });

  it('should synchronize the driver with a new render frame without a revision or a source', () => {
    const { actor, emitted, syncs } = startCamera();
    const renderFrame = { anchorFrameId: 'test-root', originMeters: [5, 6, 7], metersPerRenderUnit: 0.001 } as const;

    actor.send({ type: 'setRenderFrame', renderFrame });
    actor.send({ type: 'setRenderFrame', renderFrame });

    expect(actor.getSnapshot().context.renderFrame).toEqual(renderFrame);
    expect(actor.getSnapshot().context.lastChange).toEqual({ source: 'framing', revision: 0 });
    expect(syncs.map((sync) => [sync.snapshot.revision, sync.snapshot.renderFrame])).toEqual([[0, renderFrame]]);
    expect(emitted).toEqual([]);
    actor.stop();
  });

  it('should synchronize the driver with a new clip policy, and with its removal', () => {
    const { actor, syncs } = startCamera();
    const clipPolicy = {
      farPaddingVerticalSpans: 2,
      presentationPlane: { normal: [0, 0, 1], offsetMeters: 0.5 },
    } as const;

    actor.send({ type: 'setClipPolicy', clipPolicy });
    actor.send({ type: 'setClipPolicy', clipPolicy });
    actor.send({ type: 'setClipPolicy', clipPolicy: undefined });
    actor.send({ type: 'setClipPolicy', clipPolicy: undefined });

    expect(syncs.map((sync) => sync.snapshot.clipPolicy)).toEqual([clipPolicy, undefined]);
    expect(actor.getSnapshot().context.revision).toBe(0);
    actor.stop();
  });

  it('should take the render frame and clip policy from its input', () => {
    const renderFrame = { anchorFrameId: 'test-root', originMeters: [1, 2, 3], metersPerRenderUnit: 10 } as const;
    const clipPolicy = { farPaddingVerticalSpans: 1 } as const;
    const actor = createActor(cameraMachine, { input: { initialView, renderFrame, clipPolicy } }).start();

    expect(selectCameraDriverSnapshot(actor.getSnapshot())).toMatchObject({ renderFrame, clipPolicy });
    actor.stop();
  });

  it('should refuse to start on a render frame anchored to another frame', () => {
    const errors: unknown[] = [];
    const actor = createActor(cameraMachine, {
      input: {
        initialView,
        renderFrame: { anchorFrameId: 'elsewhere', originMeters: [0, 0, 0], metersPerRenderUnit: 1 },
      },
    });
    actor.subscribe({ error: (error) => errors.push(error) });
    actor.start();

    expect(errors).toEqual([expect.any(RangeError)]);
  });
});

describe('createCameraActor', () => {
  const refused: ReadonlyArray<readonly [label: string, event: CameraMachineEvent]> = [
    ['a non-finite field of view', { type: 'setVerticalFieldOfView', verticalFieldOfView: Number.NaN }],
    ['a zero-height viewport', { type: 'setViewport', viewport: { width: 640, height: 0, pixelRatio: 1 } }],
    ['inverted bounds', { type: 'setBounds', bounds: { min: [1, 0, 0], max: [0, 1, 1] } }],
    ['a zero direction', { type: 'poseObserved', ...pose, direction: [0, 0, 0], source: 'input' }],
    ['a margin above 0.5', { type: 'frameGeometry', bounds: initialView.bounds, margin: 0.6, source: 'fit' }],
    ['an adoption with no field', { type: 'adoptPersistedPose', requestId: 'r8' }],
    // A malformed payload from an untyped sender is refused the same way, and never errors the actor.
    ['a missing viewport', untyped({ type: 'setViewport' })],
    [
      'a render frame with no origin',
      untyped({ type: 'setRenderFrame', renderFrame: { anchorFrameId: 'test-root', metersPerRenderUnit: 1 } }),
    ],
    ['a null clip policy', untyped({ type: 'setClipPolicy', clipPolicy: null })],
    ['a pose with a null direction', untyped({ type: 'poseObserved', ...pose, direction: null, source: 'input' })],
    ['a pose with a null echo stamp', untyped({ type: 'poseObserved', ...pose, source: 'input', echoRevision: null })],
    [
      'a focus from the framing source',
      untyped({ type: 'frameBounds', bounds: initialView.bounds, margin: 0.1, source: 'framing' }),
    ],
    ['a frame with no margin', untyped({ type: 'frameGeometry', bounds: initialView.bounds, source: 'fit' })],
    ['an up axis from the object prototype', untyped({ type: 'setUpDirection', axis: 'constructor' })],
    [
      'an adoption whose only field is null',
      untyped({ type: 'adoptPersistedPose', requestId: 'r9', orientation: null }),
    ],
    ['an adoption with an empty pose', untyped({ type: 'adoptPersistedPose', requestId: 'r10', pose: {} })],
    ['an adoption with a falsy orientation', untyped({ type: 'adoptPersistedPose', requestId: 'r11', orientation: 0 })],
    [
      'a frame whose orientation is false',
      untyped({ type: 'frameGeometry', bounds: initialView.bounds, margin: 0.1, orientation: false, source: 'fit' }),
    ],
    ['an up axis in an array', untyped({ type: 'setUpDirection', axis: ['y'] })],
    [
      'an adoption with an up axis in an array',
      untyped({ type: 'adoptPersistedPose', requestId: 'r12', upDirection: ['y'] }),
    ],
    [
      'a focus whose source is in an array',
      untyped({ type: 'frameBounds', bounds: initialView.bounds, margin: 0.1, source: ['focus'] }),
    ],
  ];

  it.each(refused)('should report %s through onRejectedEvent and keep the camera', (_label, event) => {
    const { actor, emitted, guard, rejections, syncs } = startCamera();
    const before = actor.getSnapshot();

    actor.send(event);

    expect(actor.getSnapshot().status).toBe('active');
    expect(actor.getSnapshot().context).toBe(before.context);
    expect(actor.getSnapshot().value).toEqual(before.value);
    expect(syncs).toEqual([]);
    expect(emitted).toEqual([]);
    expect(rejections).toEqual([
      {
        event,
        targetRef: actor,
        targetId: actor.id,
        sourceRef: undefined,
        eventOrigin: 'external',
        reason: cameraRefusedPayloadReason,
        error: expect.any(RangeError) as unknown,
      },
    ]);
    expect(guard.take('unanswered')).toEqual([
      { kind: 'unanswered', machineId: 'camera', value: before.value, eventType: event.type },
    ]);
    actor.stop();
  });

  it('should not report an ignored event, an echo or an idempotent re-delivery as rejected', () => {
    const { actor, rejections } = startCamera();

    actor.send({ type: 'interactionMoved' });
    actor.send({ type: 'interactionEnded' });
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'interactionStarted' });
    actor.send({ type: 'poseObserved', ...pose, source: 'input', echoRevision: 0 });
    actor.send({ type: 'setClipPolicy', clipPolicy: undefined });
    actor.send({ type: 'setRenderFrame', renderFrame: actor.getSnapshot().context.renderFrame });

    expect(rejections).toEqual([]);
    actor.stop();
  });

  it('should report a dead letter to the same hook once the camera has stopped', () => {
    const { actor, guard, rejections } = startCamera();
    actor.stop();

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });

    expect(rejections.map((rejection) => rejection.reason)).toEqual(['stopped']);
    expect(guard.take('deadLetter')).toHaveLength(1);
  });

  it("should report a refusal by a camera spawned as another actor's child", () => {
    const rejections: EventRejection[] = [];
    let child: ActorRefFrom<typeof cameraMachine> | undefined;
    const parent = createActor(
      setup({ actors: { camera: cameraMachine } }).createMachine({
        context: ({ spawn, actors }) => {
          child = spawn(actors.camera, { id: 'camera', input: { initialView } });
          return {};
        },
      }),
      { inspect: createCameraRefusalInspector({ onRejectedEvent: (rejection) => rejections.push(rejection) }) },
    ).start();
    if (!child) {
      throw new Error('The parent spawned no camera.');
    }
    const event = { type: 'setVerticalFieldOfView', verticalFieldOfView: Number.NaN } as const;

    child.send(event);
    child.send({ type: 'interactionMoved' });

    expect(rejections).toEqual([
      {
        event,
        targetRef: child,
        targetId: 'camera',
        sourceRef: undefined,
        eventOrigin: 'external',
        reason: cameraRefusedPayloadReason,
        error: expect.any(RangeError) as unknown,
      },
    ]);
    parent.stop();
  });

  it('should forward an inspector given as an observer and run without any system option', () => {
    const inspected: string[] = [];
    const observed = createRootCameraActor({
      input: { initialView },
      inspect: { next: (event) => inspected.push(event.type) },
    }).start();
    const plain = createRootCameraActor({ input: { initialView } }).start();

    observed.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: Number.NaN });
    plain.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 30 });

    expect(inspected).toContain('@xstate.transition');
    expect(observed.getSnapshot().context.revision).toBe(0);
    expect(plain.getSnapshot().context.revision).toBe(1);
    observed.stop();
    plain.stop();
  });

  it('should expire the settle window on the injected clock only', () => {
    const { actor, clock } = startCamera();
    actor.send({ type: 'poseObserved', ...pose, source: 'input' });

    expect(clock.nextDue()).toBe(cameraPoseSettleMilliseconds);
    expect(clock.next()).toBe(true);
    expect(actor.getSnapshot().matches({ input: 'idle' })).toBe(true);
    expect(clock.nextDue()).toBeUndefined();
    actor.stop();
  });
});
