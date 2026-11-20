import { afterEach, describe, expect, it, vi } from 'vitest';
import type CameraControlsImpl from 'camera-controls';
import { Raycaster, Scene, Vector3 } from 'three';
import type { Camera } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { resolveCameraControlProps } from '#graphics/three/controls/camera-controls-feel.js';
import { asCameraActor } from '#graphics/graphics-camera.js';
import type { CameraInputRouting, OrbitStyle } from '#graphics/three/controls/camera-wheel-router.js';

/*
 * The orbit styles in a real browser (roll Finding 10, TA5): the view's camera is the graphics child presented by the
 * controls adapter, on a real surface, driven by real pointer events, with the adapter's own per-frame tick. Turntable
 * stops at the pole; Free orbit turns through both poles in one drag, rolling the view; switching back gives the
 * camera the scene's up again.
 */

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
type FrameCallback = { current: (state: RootState, delta: number) => void };

type Viewer = Readonly<{
  graphics: Actor<typeof graphicsMachine>;
  rig: ThreeCameraRig;
  surface: HTMLElement;
  controls: CameraControlsImpl;
  setOrbitStyle: (orbitStyle: OrbitStyle) => void;
  /** Runs the adapter's frame tick a few times, as R3F's loop would. */
  settle: () => void;
}>;

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

/** A view a Free orbit drag left upside down, over the top pole and on, as a reload restores it. */
const rolledView = {
  ...cameraView,
  direction: [1, 0, 0.2],
  up: [-0.2, 0, -1],
} as const;

/** A view turned on its side: its up is the world X axis, across the world up. */
const sidewaysView = {
  ...cameraView,
  up: [1, 0, 0],
} as const;

/** A rolled view looking straight down the world up: at the pole, where no upright up exists. */
const poleView = {
  ...cameraView,
  direction: [0, 0, 1],
  up: [1, 0, 0],
} as const;

/** A rolled view just off the pole, as far as the view cube tilts a top view off it. */
const nearPoleView = {
  ...cameraView,
  direction: [0.0011, 0, 1],
  up: [0, 1, 0],
} as const;

type SeedView = Readonly<{
  frameId: string;
  target: readonly [number, number, number];
  direction: readonly [number, number, number];
  up: readonly [number, number, number];
  verticalSpan: number;
  perspectiveZoom: number;
}>;

const viewers: Viewer[] = [];

afterEach(() => {
  for (const { graphics, rig, surface } of viewers.splice(0)) {
    graphics.stop();
    rig.dispose();
    surface.remove();
  }
});

const mountViewer = (
  orbitStyle: OrbitStyle,
  projection: 'perspective' | 'orthographic' = 'perspective',
  view: SeedView = cameraView,
): Viewer => {
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: { camera: { cameraView: view, ...(projection === 'orthographic' && { cameraFovAngle: 0 }) } } },
  ).start();
  const { cameraRef } = graphics.getSnapshot().context;
  const connectorRef: { current: CameraUpdateHandler | undefined } = { current: undefined };
  const rig = createThreeCameraRig({
    actorRef: asCameraActor(cameraRef),
    onUpdate(nativeCamera, snapshot) {
      connectorRef.current?.(nativeCamera, snapshot);
    },
  });
  const surface = document.createElement('div');
  surface.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px;touch-action:none';
  document.body.append(surface);
  const ticks: FrameCallback[] = [];
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl: { domElement: surface },
    events: { connected: undefined as HTMLElement | undefined },
    scene: new Scene(),
    raycaster: new Raycaster(),
    size: { width: 800, height: 600, top: 0, left: 0 },
    invalidate: vi.fn(),
    set(patch: Partial<RootState>) {
      Object.assign(state, patch);
    },
    get: () => state,
    internal: {
      subscribe(callback: FrameCallback) {
        ticks.push(callback);
        return () => undefined;
      },
    },
  } as unknown as RootState;
  let routing: CameraInputRouting = { cameraInput: { orbitStyle }, enablePan: true, enableZoom: true };
  graphics.send({ type: 'canvasAttached', canvasId: 'canvas', kind: 'canvas' });
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
  const controls = state.controls as unknown as CameraControlsImpl;
  const { mouseButtons, ...feel } = resolveCameraControlProps({
    enablePan: true,
    enableZoom: true,
    projectionKind: projection,
  });
  Object.assign(controls, feel);
  Object.assign(controls.mouseButtons, mouseButtons);
  const viewer: Viewer = {
    graphics,
    rig,
    surface,
    controls,
    setOrbitStyle(next) {
      routing = { ...routing, cameraInput: { orbitStyle: next } };
    },
    settle() {
      for (let frame = 0; frame < 3; frame += 1) {
        for (const tick of ticks) {
          tick.current(state, 1 / 60);
        }
      }
    },
  };
  viewers.push(viewer);
  viewer.settle();
  return viewer;
};

/** The presented view's direction (target to camera) and up, from the camera actor. */
const readView = (viewer: Viewer): Readonly<{ direction: Vector3; up: Vector3 }> => {
  const { view } = viewer.graphics.getSnapshot().context.cameraRef.getSnapshot().context;
  return { direction: new Vector3(...view.direction), up: new Vector3(...view.up) };
};

/** The source of the camera's last change. */
const lastSource = (viewer: Viewer): string =>
  viewer.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange.source;

/** A saved view record's pose, adopted by the camera as the view-record binding adopts one. */
const adoptSavedView = (viewer: Viewer, view: SeedView): void => {
  viewer.graphics.getSnapshot().context.cameraRef.send({
    type: 'adoptPersistedPose',
    requestId: 'saved-view',
    pose: { target: view.target, direction: view.direction, up: view.up, verticalSpan: view.verticalSpan },
  });
  viewer.settle();
};

const unit = (vector: readonly [number, number, number]): Vector3 => new Vector3(...vector).normalize();

const isFiniteVector = (vector: Vector3): boolean => vector.toArray().every((value) => Number.isFinite(value));

/**
 * One vertical drag from the canvas centre, `steps` moves of `step` pixels, reading the view after each move.
 *
 * @returns The view direction after the press and after each move.
 */
const verticalDrag = (
  viewer: Viewer,
  options: Readonly<{ pointerType?: 'mouse' | 'touch'; steps?: number; step?: number }> = {},
): Vector3[] => {
  const { pointerType = 'mouse', steps = 48, step = 12 } = options;
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType,
    isPrimary: true,
    button: 0,
    buttons: 1,
  };
  const directions: Vector3[] = [];
  viewer.surface.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: 400, clientY: 300 }));
  viewer.settle();
  directions.push(readView(viewer).direction);
  for (let index = 1; index <= steps; index += 1) {
    viewer.surface.dispatchEvent(
      new PointerEvent('pointermove', { ...init, button: -1, clientX: 400, clientY: 300 + step * index }),
    );
    viewer.settle();
    directions.push(readView(viewer).direction);
  }
  viewer.surface.dispatchEvent(
    new PointerEvent('pointerup', { ...init, buttons: 0, clientX: 400, clientY: 300 + step * steps }),
  );
  viewer.settle();
  return directions;
};

const worldUp = new Vector3(0, 0, 1);

/** The largest turn between two consecutive directions, in radians. */
const largestStep = (directions: readonly Vector3[]): number =>
  Math.max(...directions.slice(1).map((direction, index) => direction.angleTo(directions[index]!)));

/** Whether the drag went over the top pole and the bottom pole: the view looked straight down and straight up. */
const poles = (directions: readonly Vector3[]): Readonly<{ top: boolean; bottom: boolean }> => ({
  top: directions.some((direction) => direction.dot(worldUp) > 0.99),
  bottom: directions.some((direction) => direction.dot(worldUp) < -0.99),
});

/** How far the view's up leans off the plane of the world up and the view direction: zero when upright. */
const roll = (viewer: Viewer): number => {
  const { direction, up } = readView(viewer);
  const side = new Vector3().crossVectors(worldUp, direction).normalize();
  return Math.abs(up.dot(side));
};

describe('orbit style in the browser (TA5)', () => {
  it('stops a Turntable drag at the pole, and keeps the view upright', () => {
    const viewer = mountViewer('turntable');
    const directions = verticalDrag(viewer);
    expect(poles(directions)).toEqual({ top: true, bottom: false });
    // At the pole the drag stops: the direction stays put for the rest of the drag.
    expect(directions.at(-1)!.angleTo(directions.at(-2)!)).toBeLessThan(1e-6);
    expect(roll(viewer)).toBeLessThan(1e-6);
  });

  it('turns a Free orbit drag through both poles, with a largest step no greater than Turntable’s', () => {
    const turntable = largestStep(verticalDrag(mountViewer('turntable')));
    const viewer = mountViewer('free');
    const directions = verticalDrag(viewer);
    expect(poles(directions)).toEqual({ top: true, bottom: true });
    expect(largestStep(directions)).toBeLessThanOrEqual(turntable + 1e-6);
    // The person's input reported the rolled pose: the camera holds it.
    expect(viewer.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange.source).toBe('input');
  });

  it('gives the camera the scene up again on switching back to Turntable', () => {
    const viewer = mountViewer('free');
    // Over the top pole and on: the view is upside down.
    verticalDrag(viewer, { steps: 20 });
    expect(readView(viewer).up.dot(worldUp)).toBeLessThan(-0.1);

    viewer.setOrbitStyle('turntable');
    viewer.settle();

    expect(roll(viewer)).toBeLessThan(1e-6);
    expect(readView(viewer).up.dot(worldUp)).toBeGreaterThan(0);
    // The controls orbit about the scene up again: the next drag stops at the pole.
    const after = poles(verticalDrag(viewer, { steps: 96 }));
    expect(after.top && after.bottom).toBe(false);
    expect(roll(viewer)).toBeLessThan(1e-6);
  });

  it('turns a one-finger touch drag through both poles in Free orbit', () => {
    const viewer = mountViewer('free');
    expect(poles(verticalDrag(viewer, { pointerType: 'touch' }))).toEqual({ top: true, bottom: true });
  });

  it('turns through both poles with the orthographic camera in Free orbit', () => {
    const viewer = mountViewer('free', 'orthographic');
    expect(poles(verticalDrag(viewer))).toEqual({ top: true, bottom: true });
  });

  it('leaves a trackpad pinch and a wheel step unrolled in Free orbit: only an orbit re-anchors the up', () => {
    const viewer = mountViewer('free');
    const before = readView(viewer).up;
    for (const init of [{ deltaY: 30, ctrlKey: true }, { deltaY: 40 }]) {
      viewer.surface.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 400, clientY: 300, ...init }),
      );
      viewer.settle();
    }
    expect(readView(viewer).up.angleTo(before)).toBeLessThan(1e-9);
  });

  it('keeps a rolled Free orbit view across a reload, and the next drag turns on from it', () => {
    // A reload restores the persisted view: upside down after a Free orbit drag over the top pole.
    const viewer = mountViewer('free', 'perspective', rolledView);
    const restored = readView(viewer);
    expect(restored.direction.angleTo(new Vector3(...rolledView.direction).normalize())).toBeLessThan(1e-9);
    expect(restored.up.angleTo(new Vector3(...rolledView.up).normalize())).toBeLessThan(1e-9);

    const directions = verticalDrag(viewer, { steps: 10 });
    // The drag turns on about the restored screen up: the view and its up turn together, down below the horizon.
    expect(directions.at(-1)!.dot(worldUp)).toBeLessThan(-0.5);
    expect(readView(viewer).up.angleTo(restored.up)).toBeGreaterThan(0.5);
    expect(largestStep(directions)).toBeLessThan(0.2);
  });

  /*
   * Roll ruling E: Turntable has no roll. A rolled view a reload restores, or a saved view the camera adopts, is
   * straightened as switching to Turntable straightens one: the view direction stays and the up is the world up again.
   */
  it.each([
    ['upside down', rolledView],
    ['on its side', sidewaysView],
  ])('straightens a view restored %s in Turntable, and the next drag turns about the world up', (_, view) => {
    const viewer = mountViewer('turntable', 'perspective', view);
    const restored = readView(viewer);
    expect(restored.direction.angleTo(unit(view.direction))).toBeLessThan(1e-9);
    expect(restored.up.toArray()).toEqual([0, 0, 1]);
    // An automatic change, as the restore was: the view record never saves it (I7).
    expect(lastSource(viewer)).toBe('persisted');

    const directions = verticalDrag(viewer);
    expect(poles(directions)).toEqual({ top: true, bottom: false });
    expect(directions.at(-1)!.angleTo(directions.at(-2)!)).toBeLessThan(1e-6);
    expect(roll(viewer)).toBeLessThan(1e-6);
    expect(readView(viewer).up.dot(worldUp)).toBeGreaterThan(0);
  });

  it('straightens a rolled saved view adopted in Turntable, as an automatic change', () => {
    const viewer = mountViewer('turntable');
    adoptSavedView(viewer, sidewaysView);
    const adopted = readView(viewer);
    expect(adopted.direction.angleTo(unit(sidewaysView.direction))).toBeLessThan(1e-9);
    expect(adopted.up.toArray()).toEqual([0, 0, 1]);
    expect(lastSource(viewer)).toBe('persisted');
    const after = poles(verticalDrag(viewer, { steps: 96 }));
    expect(after.top && after.bottom).toBe(false);
  });

  /*
   * Only Turntable is straightened, by name: Free orbit keeps every roll, and so does any style that is not Turntable
   * (an id the adapter does not know, standing for a later style).
   */
  it.each([['free' as OrbitStyle], ['trackball' as unknown as OrbitStyle]])(
    'keeps the roll of a view restored or adopted in the %s orbit style',
    (orbitStyle) => {
      const restored = mountViewer(orbitStyle, 'perspective', sidewaysView);
      expect(readView(restored).up.angleTo(unit(sidewaysView.up))).toBeLessThan(1e-9);
      expect(lastSource(restored)).not.toBe('persisted');

      const adopted = mountViewer(orbitStyle);
      adoptSavedView(adopted, sidewaysView);
      expect(readView(adopted).up.angleTo(unit(sidewaysView.up))).toBeLessThan(1e-9);
      expect(lastSource(adopted)).toBe('persisted');
      const { revision } = adopted.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange;
      adopted.settle();
      expect(adopted.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange.revision).toBe(revision);
    },
  );

  it('keeps a rolled view straight down the world up in Turntable, and drags on from it without a jump', () => {
    // At the pole the world up is parallel to the view: the camera keeps the roll, as `setUpDirection` does there.
    const viewer = mountViewer('turntable', 'perspective', poleView);
    const restored = readView(viewer);
    expect(restored.direction.angleTo(unit(poleView.direction))).toBeLessThan(1e-9);
    expect(restored.up.angleTo(unit(poleView.up))).toBeLessThan(1e-9);

    const directions = verticalDrag(viewer, { steps: 10, step: -12 });
    expect(directions.every((direction) => isFiniteVector(direction))).toBe(true);
    expect(isFiniteVector(readView(viewer).up)).toBe(true);
    expect(largestStep(directions)).toBeLessThan(0.2);
  });

  it('straightens a rolled view just off the pole in Turntable without a jump', () => {
    const viewer = mountViewer('turntable', 'perspective', nearPoleView);
    const restored = readView(viewer);
    expect(restored.direction.angleTo(unit(nearPoleView.direction))).toBeLessThan(1e-9);
    expect(restored.up.toArray()).toEqual([0, 0, 1]);

    const directions = verticalDrag(viewer, { steps: 10, step: -12 });
    expect(directions.every((direction) => isFiniteVector(direction))).toBe(true);
    expect(largestStep(directions)).toBeLessThan(0.2);
    // The drag left the pole about the world up: the view is upright.
    expect(directions.at(-1)!.dot(worldUp)).toBeLessThan(0.99);
    expect(roll(viewer)).toBeLessThan(1e-6);
  });
});
