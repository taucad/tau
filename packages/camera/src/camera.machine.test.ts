import { createActor, fromCallback } from 'xstate';
import { describe, expect, it } from 'vitest';
import * as machineModule from '#camera.machine.js';
import { cameraMachine, selectCameraDriverSnapshot, selectCameraProjection } from '#camera.machine.js';
import type { CameraDriverEvent, CameraDriverInput } from '#camera.machine.js';
import { createCameraView, frameCameraBounds, maximumProjectedPixelDelta, resolveCameraFrame } from '#camera-domain.js';

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

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

describe('cameraMachine', () => {
  it('exports exactly one machine value and starts headlessly', () => {
    const actor = createCameraActor().start();

    expect(selectCameraProjection(actor.getSnapshot())).toEqual({ kind: 'perspective', verticalFieldOfView: 60 });
    expect(Object.keys(machineModule).sort()).toEqual([
      'cameraMachine',
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

  it('keeps one replaceable driver synchronized across zero-FOV crossings', () => {
    const snapshots = [] as Array<Readonly<{ projection: string; revision: number }>>;
    let driverStarts = 0;
    let driverStops = 0;
    const driver = fromCallback<CameraDriverEvent, CameraDriverInput>(({ input, receive }) => {
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

  it('updates, frames, resets, and serializes canonical state', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'setView', target: [1, 2, 3], direction: [2, -2, 1], up: [0, 0, 1], verticalSpan: 25 });
    actor.send({ type: 'frame', bounds: { min: [100, 200, 300], max: [200, 400, 500] } });

    let snapshot = actor.getSnapshot();
    expect(snapshot.context.view.target).toEqual([150, 300, 400]);
    expect(() => JSON.stringify(snapshot.context)).not.toThrow();
    expect(selectCameraDriverSnapshot(snapshot).revision).toBe(2);

    actor.send({ type: 'saveHome' });
    const savedHome = actor.getSnapshot().context.view;
    actor.send({ type: 'setView', target: [9, 8, 7], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 10 });
    actor.send({ type: 'reset' });
    snapshot = actor.getSnapshot();
    expect(snapshot.context.view).toEqual(savedHome);

    actor.stop();
  });

  it('should preserve fitted perspective zoom across endpoint changes and reset', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'frame', bounds: { min: [0, 0, 0], max: [20, 14, 8] }, margin: 0.1 });
    const framedZoom = actor.getSnapshot().context.view.perspectiveZoom;
    expect(framedZoom).not.toBe(1);
    const framedSpan = actor.getSnapshot().context.view.verticalSpan;
    const distanceAt60 = resolveCameraFrame({ view: actor.getSnapshot().context.view }).distance;

    actor.send({ type: 'saveHome' });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 0 });
    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: 45 });
    expect(actor.getSnapshot().context.view).toMatchObject({
      perspectiveZoom: framedZoom,
      verticalSpan: framedSpan,
    });
    expect(resolveCameraFrame({ view: actor.getSnapshot().context.view }).distance).toBeGreaterThan(distanceAt60);
    actor.send({ type: 'reset' });

    expect(actor.getSnapshot().context.view).toMatchObject({
      perspectiveZoom: framedZoom,
      verticalSpan: framedSpan,
    });
    actor.stop();
  });

  it('retains the current viewport and refits the saved home after resize and reset', () => {
    const actor = createCameraActor().start();
    actor.send({ type: 'frame', margin: 0.1 });
    actor.send({ type: 'saveHome' });
    const savedHome = actor.getSnapshot().context.view;
    const viewport = { width: 720, height: 1000, pixelRatio: 2 } as const;

    actor.send({ type: 'setViewport', viewport });
    actor.send({ type: 'frame', margin: 0.1 });
    actor.send({ type: 'setView', target: [9, 8, 7], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 10 });
    actor.send({ type: 'reset' });

    expect(actor.getSnapshot().context.view).toEqual(
      frameCameraBounds({ view: { ...savedHome, viewport }, bounds: savedHome.bounds }),
    );
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
    [-1, 'verticalFieldOfView must be between 0 and 179 degrees.'],
    [Number.NaN, 'verticalFieldOfView must be finite.'],
    [180, 'verticalFieldOfView must be between 0 and 179 degrees.'],
  ])('reports an invalid FOV event through the actor error channel (%s)', (value, message) => {
    const errors: unknown[] = [];
    const actor = createCameraActor();
    actor.subscribe({
      error(error) {
        errors.push(error);
      },
    });
    actor.start();

    actor.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: value });

    expect(errors[0]).toBeInstanceOf(RangeError);
    expect(errors[0]).toHaveProperty('message', message);
  });
});
