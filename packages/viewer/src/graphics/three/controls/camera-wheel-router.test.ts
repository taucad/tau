import { afterEach, describe, expect, it } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import {
  attachCameraWheelRouter,
  resolvePinchRatio,
  resolveWheelAction,
  shouldRerouteWheel,
} from '#graphics/three/controls/camera-wheel-router.js';
import type { CameraWheelAction } from '#graphics/three/controls/camera-wheel-router.js';

/* eslint-disable @typescript-eslint/naming-convention -- `camera-controls` requires this exact install shape. */
CameraControlsImpl.install({
  THREE: {
    Box3,
    MathUtils: { clamp: MathUtils.clamp },
    Matrix4,
    Quaternion,
    Raycaster,
    Sphere,
    Spherical,
    Vector2,
    Vector3,
    Vector4,
  },
});
/* eslint-enable @typescript-eslint/naming-convention -- The install shape ends here. */

describe('resolveWheelAction', () => {
  // PF1: the projection picks the action; `ctrlKey` (a trackpad pinch) never does.
  const rows: ReadonlyArray<
    Readonly<{ ctrlKey: boolean; perspective: boolean; action: CameraWheelAction; reroute: boolean }>
  > = [
    { ctrlKey: false, perspective: true, action: 'dolly', reroute: false },
    { ctrlKey: true, perspective: true, action: 'dolly', reroute: true },
    { ctrlKey: false, perspective: false, action: 'zoom', reroute: false },
    { ctrlKey: true, perspective: false, action: 'zoom', reroute: false },
  ];

  it.each(rows)(
    'ctrlKey $ctrlKey, perspective $perspective: $action, reroute $reroute',
    ({ ctrlKey, perspective, action, reroute }) => {
      expect(resolveWheelAction({ ctrlKey, perspective })).toBe(action);
      expect(shouldRerouteWheel({ ctrlKey, perspective })).toBe(reroute);
    },
  );
});

describe('resolvePinchRatio', () => {
  it.each([
    { previousScale: 1, scale: 2, ratio: 2 },
    { previousScale: 2, scale: 1, ratio: 0.5 },
    { previousScale: 1.5, scale: 1.5, ratio: undefined },
    { previousScale: 0, scale: 1, ratio: undefined },
    { previousScale: 1, scale: 0, ratio: undefined },
    { previousScale: 1, scale: -1, ratio: undefined },
    { previousScale: 1, scale: Number.NaN, ratio: undefined },
    { previousScale: Number.POSITIVE_INFINITY, scale: 1, ratio: undefined },
  ])('from $previousScale to $scale: $ratio', ({ previousScale, scale, ratio }) => {
    expect(resolvePinchRatio({ previousScale, scale })).toBe(ratio);
  });
});

type Rig = Readonly<{
  controls: CameraControlsImpl;
  element: HTMLElement;
  camera: PerspectiveCamera | OrthographicCamera;
  wheel: (init: WheelEventInit) => WheelEvent;
  gesture: (type: 'gesturestart' | 'gesturechange' | 'gestureend', scale: number) => Event;
  controlEvents: () => number;
}>;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/*
 * A Safari pinch moves the camera through a `camera-controls` transition, which with no smoothing still settles to
 * within about 1e-7 of its end; six places is far finer than any pinch step.
 */

/** Real `camera-controls` on a surface, undamped as the viewer's feel is, with the router attached beside it. */
const createRig = (projection: 'perspective' | 'orthographic', router = true): Rig => {
  const camera = projection === 'perspective' ? new PerspectiveCamera(45, 1) : new OrthographicCamera(-1, 1, 1, -1);
  camera.position.set(0, 0, 10);
  const element = document.createElement('div');
  document.body.append(element);
  const controls = new CameraControlsImpl(camera);
  controls.smoothTime = 0;
  controls.draggingSmoothTime = 0;
  controls.mouseButtons.wheel =
    projection === 'perspective' ? CameraControlsImpl.ACTION.DOLLY : CameraControlsImpl.ACTION.ZOOM;
  controls.connect(element);
  const detach = router ? attachCameraWheelRouter({ controls, element }) : undefined;
  let controlEvents = 0;
  controls.addEventListener('control', () => {
    controlEvents += 1;
  });
  cleanups.push(() => {
    detach?.();
    controls.dispose();
    element.remove();
  });
  return {
    controls,
    element,
    camera,
    wheel(init) {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      element.dispatchEvent(event);
      controls.update(1);
      return event;
    },
    gesture(type, scale) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'scale', { value: scale });
      element.dispatchEvent(event);
      controls.update(1);
      return event;
    },
    controlEvents: () => controlEvents,
  };
};

describe('attachCameraWheelRouter', () => {
  it.each([100, -100])('dollies a perspective ctrlKey wheel of deltaY %d as a plain wheel does', (deltaY) => {
    const plain = createRig('perspective');
    plain.wheel({ deltaY });
    const pinch = createRig('perspective');
    const event = pinch.wheel({ deltaY, ctrlKey: true });

    expect(pinch.controls.distance).not.toBeCloseTo(10, 3);
    expect(pinch.controls.distance).toBeCloseTo(plain.controls.distance, 9);
    expect(Math.sign(pinch.controls.distance - 10)).toBe(Math.sign(deltaY));
    expect(pinch.camera.zoom).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    expect(pinch.controlEvents()).toBe(1);
  });

  it('zooms a perspective ctrlKey wheel without the router, the behaviour it replaces', () => {
    const rig = createRig('perspective', false);
    rig.wheel({ deltaY: -100, ctrlKey: true });

    expect(rig.controls.distance).toBeCloseTo(10, 9);
    expect(rig.camera.zoom).toBeGreaterThan(1);
  });

  it.each([100, -100])('passes an orthographic ctrlKey wheel of deltaY %d through as a zoom', (deltaY) => {
    const plain = createRig('orthographic');
    plain.wheel({ deltaY });
    const pinch = createRig('orthographic');
    pinch.wheel({ deltaY, ctrlKey: true });

    expect(pinch.camera.zoom).not.toBe(1);
    expect(pinch.camera.zoom).toBeCloseTo(plain.camera.zoom, 9);
    expect(pinch.controls.distance).toBeCloseTo(10, 9);
    expect(pinch.controlEvents()).toBe(1);
  });

  it('leaves a plain wheel to the controls', () => {
    const rig = createRig('perspective');
    rig.wheel({ deltaY: 100 });

    expect(rig.controls.distance).toBeGreaterThan(10);
    expect(rig.controlEvents()).toBe(1);
  });

  it('dollies a perspective Safari pinch by the change of its scale and keeps the page from zooming', () => {
    const rig = createRig('perspective');
    const start = rig.gesture('gesturestart', 1);
    const spread = rig.gesture('gesturechange', 2);

    expect(start.defaultPrevented).toBe(true);
    expect(spread.defaultPrevented).toBe(true);
    expect(rig.controls.distance).toBeCloseTo(5, 6);
    expect(rig.camera.zoom).toBe(1);

    rig.gesture('gesturechange', 1);
    expect(rig.controls.distance).toBeCloseTo(10, 6);
    expect(rig.gesture('gestureend', 1).defaultPrevented).toBe(true);
    expect(rig.controlEvents()).toBe(2);
  });

  it('zooms an orthographic Safari pinch by the change of its scale', () => {
    const rig = createRig('orthographic');
    rig.gesture('gesturestart', 1);
    rig.gesture('gesturechange', 2);

    expect(rig.camera.zoom).toBeCloseTo(2, 6);
    expect(rig.controls.distance).toBeCloseTo(10, 9);
  });

  it('drops a ctrlKey wheel inside a Safari pinch, so a pinch moves the camera once', () => {
    const rig = createRig('perspective');
    rig.gesture('gesturestart', 1);
    const event = rig.wheel({ deltaY: -100, ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(rig.controls.distance).toBeCloseTo(10, 9);
    expect(rig.camera.zoom).toBe(1);

    rig.gesture('gestureend', 1);
    rig.wheel({ deltaY: -100, ctrlKey: true });
    expect(rig.controls.distance).toBeLessThan(10);
  });

  it('leaves every event alone while the controls are disabled or their wheel does nothing', () => {
    const disabled = createRig('perspective');
    disabled.controls.enabled = false;
    expect(disabled.wheel({ deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(disabled.gesture('gesturestart', 1).defaultPrevented).toBe(false);
    expect(disabled.gesture('gesturechange', 2).defaultPrevented).toBe(false);
    expect(disabled.controls.distance).toBeCloseTo(10, 9);

    const noWheel = createRig('perspective');
    noWheel.controls.mouseButtons.wheel = CameraControlsImpl.ACTION.NONE;
    expect(noWheel.wheel({ deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(noWheel.controls.distance).toBeCloseTo(10, 9);
    expect(noWheel.camera.zoom).toBe(1);
  });

  it('stops routing once detached', () => {
    const camera = new PerspectiveCamera(45, 1);
    camera.position.set(0, 0, 10);
    const element = document.createElement('div');
    const controls = new CameraControlsImpl(camera);
    controls.smoothTime = 0;
    controls.connect(element);
    const detach = attachCameraWheelRouter({ controls, element });
    detach();
    element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true }));
    controls.update(1);

    expect(controls.distance).toBeCloseTo(10, 9);
    expect(camera.zoom).toBeGreaterThan(1);
    controls.dispose();
  });
});
