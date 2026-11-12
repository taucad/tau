import type CameraControlsImpl from 'camera-controls';
import { Raycaster, Scene, Vector3 } from 'three';
import type { Camera } from 'three';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import type { CameraPresetId } from '#graphics/three/controls/camera-presets.js';
import type { CameraInputRouting } from '#graphics/three/controls/camera-wheel-router.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { asCameraActor } from '#graphics/graphics-camera.js';

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
type Ticker = Readonly<{ current: (state: RootState, delta: number) => void }>;

/**
 * A graphics actor whose canvas has its controls, on a stub R3F root: the real controls adapter, `camera-controls` and
 * camera, without a renderer.
 */
export type NavigableViewer = Readonly<{
  graphics: Actor<typeof graphicsMachine>;
  rig: ThreeCameraRig;
  controls: CameraControlsImpl;
  /** Steps the controls one frame, as the canvas's loop does. */
  tick: () => void;
  stop: () => void;
}>;

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

/**
 * Starts a graphics actor and attaches a canvas's controls adapter, routing `preset`. With `model`, graphics has
 * measured a model, so Fit view applies; its first framing settles before this returns.
 *
 * @param preset - The mouse preset the router applies.
 * @param options - Whether graphics has a model.
 * @returns The viewer; call `stop` after the test.
 */
export const startNavigableViewer = (
  preset: CameraPresetId = 'tau',
  options: Readonly<{ model?: boolean }> = {},
): NavigableViewer => {
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: { camera: { cameraView } } },
  ).start();
  const { cameraRef } = graphics.getSnapshot().context;
  const connectorRef: { current: CameraUpdateHandler | undefined } = { current: undefined };
  const rig = createThreeCameraRig({
    actorRef: asCameraActor(cameraRef),
    onUpdate(nativeCamera, snapshot) {
      connectorRef.current?.(nativeCamera, snapshot);
    },
  });
  let ticker: Ticker | undefined;
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl: { domElement: document.createElement('div') },
    events: { connected: undefined as HTMLElement | undefined },
    scene: new Scene(),
    raycaster: new Raycaster(),
    size: { width: 800, height: 600, top: 0, left: 0 },
    invalidate: () => undefined,
    set(patch: Partial<RootState>) {
      Object.assign(state, patch);
    },
    get: () => state,
    internal: {
      subscribe(callback: Ticker) {
        ticker = callback;
        return () => undefined;
      },
    },
  } as unknown as RootState;
  const routing: CameraInputRouting = { cameraInput: { preset }, enablePan: true, enableZoom: true };
  graphics.send({ type: 'canvasAttached', canvasId: 'canvas', kind: 'canvas' });
  graphics.getSnapshot().context.canvas?.ref.send({
    type: 'hostCreated',
    backend: 'webgl',
    surface: { width: 800, height: 600, pixelRatio: 1 },
    domElement: document.createElement('canvas'),
    host: createCallbackLogic(() => undefined),
  });
  graphics.send({
    type: 'controlsAttached',
    canvasId: 'canvas',
    adapter: createControlsAdapter({
      root: state,
      rig,
      connectorRef,
      consumersRef: { current: new Set() },
      getUpAxis: () => 'z',
      getCameraRouting: () => routing,
    }),
  });
  const tick = (): void => {
    ticker?.current(state, 1 / 60);
  };
  if (options.model === true) {
    graphics.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
    graphics.send({
      type: 'geometryBoundsMeasured',
      key: 'model',
      bounds: { min: [-0.1, -0.1, -0.1], max: [0.1, 0.1, 0.1] },
      radius: 0.1,
    });
    for (let frame = 0; frame < 240; frame += 1) {
      tick();
    }
  }
  return {
    graphics,
    rig,
    controls: state.controls as unknown as CameraControlsImpl,
    tick,
    stop() {
      graphics.stop();
      rig.dispose();
    },
  };
};

/**
 * The camera's state as the acceptance rows read it.
 */
export type CameraReading = Readonly<{ azimuth: number; polar: number; distance: number; target: Vector3 }>;

/**
 * Reads the camera's azimuth, polar angle, distance and target from the controls.
 *
 * @param viewer - The viewer to read.
 * @returns The reading.
 */
export const readCamera = (viewer: NavigableViewer): CameraReading => ({
  azimuth: viewer.controls.azimuthAngle,
  polar: viewer.controls.polarAngle,
  distance: viewer.controls.distance,
  target: viewer.controls.getTarget(new Vector3()),
});

const epsilon = 1e-6;

/**
 * Names the change between two readings: `orbit`, `pan`, `zoom`, `none`, or several joined by `+`.
 *
 * @param before - The reading before the gesture.
 * @param after - The reading after it.
 * @returns The change's name.
 */
export const classifyCameraChange = (before: CameraReading, after: CameraReading): string => {
  const rotated = Math.abs(after.azimuth - before.azimuth) > epsilon || Math.abs(after.polar - before.polar) > epsilon;
  const panned = after.target.distanceTo(before.target) > epsilon;
  const zoomed = Math.abs(after.distance - before.distance) > epsilon;
  const changes = [rotated && 'orbit', panned && 'pan', zoomed && 'zoom'].filter(Boolean);
  return changes.length === 0 ? 'none' : changes.join('+');
};
