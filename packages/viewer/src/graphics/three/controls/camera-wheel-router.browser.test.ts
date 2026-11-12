import { afterEach, describe, expect, it, vi } from 'vitest';
import type CameraControlsImpl from 'camera-controls';
import { Raycaster, Scene } from 'three';
import type { Camera } from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { GraphicsCameraRef } from '#machines/graphics.machine.js';
import { resolveCameraControlProps } from '#graphics/three/controls/camera-controls-feel.js';
import { asCameraActor } from '#services/graphics-camera-registry.js';

/*
 * PF1 in a real browser: a trackpad pinch (a `ctrlKey` wheel) moves the view's camera as a plain wheel of the same sign
 * does. The camera is the graphics child presented by the controls adapter, on a real surface element, with real
 * `WheelEvent`s; each row reads the camera's distance and zoom before and after.
 */

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

type Viewer = Readonly<{
  camera: GraphicsCameraRef;
  rig: ThreeCameraRig;
  surface: HTMLElement;
  controls: () => CameraControlsImpl;
}>;

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

const viewers: Array<Readonly<{ graphics: Actor<typeof graphicsMachine>; rig: ThreeCameraRig; surface: HTMLElement }>> =
  [];

afterEach(() => {
  for (const { graphics, rig, surface } of viewers.splice(0)) {
    graphics.stop();
    rig.dispose();
    surface.remove();
  }
});

const mountViewer = (projection: 'perspective' | 'orthographic'): Viewer => {
  const graphics = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: { camera: { cameraView, ...(projection === 'orthographic' && { cameraFovAngle: 0 }) } } },
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
  surface.style.cssText = 'position:fixed;inset:0;width:800px;height:600px';
  document.body.append(surface);
  viewers.push({ graphics, rig, surface });
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
    internal: { subscribe: () => () => undefined },
  } as unknown as RootState;
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
    }),
  });
  // The feel `Controls` applies to the adapter's instance: undamped, the viewer's speeds and wheel bindings.
  const controls = state.controls as unknown as CameraControlsImpl;
  const { mouseButtons, ...feel } = resolveCameraControlProps({
    enablePan: true,
    enableZoom: true,
    projectionKind: projection,
  });
  Object.assign(controls, feel);
  Object.assign(controls.mouseButtons, mouseButtons);
  return {
    camera: cameraRef,
    rig,
    surface,
    controls: () => controls,
  };
};

type Reading = Readonly<{ distance: number; zoom: number; perspectiveZoom: number; verticalSpan: number }>;

const read = (viewer: Viewer): Reading => {
  const { view } = viewer.camera.getSnapshot().context;
  return {
    distance: viewer.controls().distance,
    zoom: viewer.rig.activeCamera.zoom,
    perspectiveZoom: view.perspectiveZoom,
    verticalSpan: view.verticalSpan,
  };
};

/** One wheel step on the canvas centre, then the frames the controls take to settle. */
const wheel = (viewer: Viewer, init: WheelEventInit): WheelEvent => {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 400,
    clientY: 300,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    ...init,
  });
  viewer.surface.dispatchEvent(event);
  for (let frame = 0; frame < 4; frame += 1) {
    viewer.controls().update(1 / 60);
  }
  return event;
};

describe('camera wheel router in the browser', () => {
  it.each([
    { deltaY: -40, direction: 'in' },
    { deltaY: 40, direction: 'out' },
  ])('dollies a perspective pinch $direction as a plain wheel does, leaving the zoom at 1', ({ deltaY }) => {
    const plain = mountViewer('perspective');
    const pinch = mountViewer('perspective');
    const before = read(pinch);
    expect(read(plain)).toEqual(before);

    wheel(plain, { deltaY });
    const event = wheel(pinch, { deltaY, ctrlKey: true });
    const afterPlain = read(plain);
    const afterPinch = read(pinch);

    expect(event.defaultPrevented).toBe(true);
    expect(Math.sign(afterPinch.distance - before.distance)).toBe(Math.sign(deltaY));
    expect(afterPinch.distance).toBeCloseTo(afterPlain.distance, 9);
    expect(afterPinch.zoom).toBe(1);
    expect(afterPinch.perspectiveZoom).toBe(1);
    expect(afterPlain.zoom).toBe(1);
  });

  it.each([
    { deltaY: -40, direction: 'in' },
    { deltaY: 40, direction: 'out' },
  ])('zooms an orthographic pinch $direction as a plain wheel does', ({ deltaY }) => {
    const plain = mountViewer('orthographic');
    const pinch = mountViewer('orthographic');
    const before = read(pinch);

    wheel(plain, { deltaY });
    wheel(pinch, { deltaY, ctrlKey: true });
    const afterPlain = read(plain);
    const afterPinch = read(pinch);

    // The rig presents an orthographic zoom as the span it shows, at a native zoom of 1.
    expect(Math.sign(afterPinch.verticalSpan - before.verticalSpan)).toBe(Math.sign(deltaY));
    expect(afterPinch.verticalSpan).toBeCloseTo(afterPlain.verticalSpan, 9);
    expect(afterPinch.distance).toBeCloseTo(before.distance, 9);
  });

  it('dollies a perspective Safari pinch by its scale, leaving the zoom at 1', () => {
    const viewer = mountViewer('perspective');
    const before = read(viewer);
    const gesture = (type: string, scale: number): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale });
      viewer.surface.dispatchEvent(event);
      for (let frame = 0; frame < 4; frame += 1) {
        viewer.controls().update(1 / 60);
      }
      return event;
    };

    expect(gesture('gesturestart', 1).defaultPrevented).toBe(true);
    expect(gesture('gesturechange', 1.25).defaultPrevented).toBe(true);
    gesture('gestureend', 1.25);
    const after = read(viewer);

    expect(after.distance).toBeCloseTo(before.distance / 1.25, 6);
    expect(after.zoom).toBe(1);
    expect(after.perspectiveZoom).toBe(1);
  });
});
