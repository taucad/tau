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
  resolvePressedButton,
  resolveWheelAction,
  resolveWheelZoomScale,
  shouldRerouteWheel,
  toCameraControlsAction,
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

describe('resolvePressedButton', () => {
  const keys = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

  it.each([
    { platform: 'mac', button: 0, ctrlKey: true, metaKey: false, pressed: 'right', ctrl: false },
    { platform: 'mac', button: 0, ctrlKey: true, metaKey: true, pressed: 'right', ctrl: true },
    { platform: 'mac', button: 0, ctrlKey: false, metaKey: true, pressed: 'left', ctrl: true },
    { platform: 'other', button: 0, ctrlKey: true, metaKey: false, pressed: 'left', ctrl: true },
    { platform: 'other', button: 2, ctrlKey: true, metaKey: false, pressed: 'right', ctrl: true },
    { platform: 'other', button: 1, ctrlKey: false, metaKey: false, pressed: 'middle', ctrl: false },
  ] as const)(
    'on $platform, button $button with ctrl $ctrlKey and meta $metaKey is $pressed with ctrl $ctrl (C14)',
    ({ platform, button, ctrlKey, metaKey, pressed, ctrl }) => {
      expect(resolvePressedButton({ ...keys, button, ctrlKey, metaKey, platform })).toEqual({
        button: pressed,
        modifiers: { shift: false, ctrl, alt: false },
      });
    },
  );

  it('binds no back or forward button', () => {
    expect(resolvePressedButton({ ...keys, button: 3, platform: 'other' })).toBeUndefined();
  });
});

describe('toCameraControlsAction', () => {
  it.each([
    { gesture: 'orbit', perspective: true, action: CameraControlsImpl.ACTION.ROTATE },
    { gesture: 'pan', perspective: false, action: CameraControlsImpl.ACTION.TRUCK },
    { gesture: 'zoom', perspective: true, action: CameraControlsImpl.ACTION.DOLLY },
    { gesture: 'zoom', perspective: false, action: CameraControlsImpl.ACTION.ZOOM },
    { gesture: 'none', perspective: true, action: CameraControlsImpl.ACTION.NONE },
  ] as const)('$gesture (perspective $perspective)', ({ gesture, perspective, action }) => {
    expect(toCameraControlsAction(gesture, perspective)).toBe(action);
  });
});

describe('resolveWheelZoomScale', () => {
  const step = { deltaMode: 0, ctrlKey: false, dollySpeed: 1, invertZoom: false } as const;

  it('moves away for a positive delta and closer for a negative one', () => {
    expect(resolveWheelZoomScale({ ...step, deltaY: 40, platform: 'other' })).toBeGreaterThan(1);
    expect(resolveWheelZoomScale({ ...step, deltaY: -40, platform: 'other' })).toBeLessThan(1);
  });

  it('reverses with invert zoom (C12)', () => {
    const scale = resolveWheelZoomScale({ ...step, deltaY: 40, platform: 'mac' });
    expect(resolveWheelZoomScale({ ...step, deltaY: 40, platform: 'mac', invertZoom: true })).toBeCloseTo(
      1 / scale,
      12,
    );
  });

  it('matches camera-controls for a pinch and for a line-mode wheel', () => {
    expect(resolveWheelZoomScale({ ...step, deltaY: 30, ctrlKey: true, platform: 'other' })).toBeCloseTo(
      0.95 ** -1,
      12,
    );
    expect(resolveWheelZoomScale({ ...step, deltaY: 3, deltaMode: 1, platform: 'other' })).toBeCloseTo(0.95 ** -1, 12);
  });
});

/** Jsdom has no `PointerEvent`: a mouse event that carries the pointer fields the router and `camera-controls` read. */
const mousePointer = (type: string, init: MouseEventInit): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 1 } });
  return event;
};

describe('the routed press on macOS', () => {
  it('treats Ctrl + click as the secondary click: a Tau default pan, not an orbit (C14)', () => {
    const camera = new PerspectiveCamera(45, 1);
    camera.position.set(0, 0, 10);
    const element = document.createElement('div');
    document.body.append(element);
    const controls = new CameraControlsImpl(camera);
    controls.connect(element);
    const detach = attachCameraWheelRouter({
      controls,
      element,
      platform: 'mac',
      getRouting: () => ({ cameraInput: { preset: 'tau' }, enablePan: true, enableZoom: true }),
    });
    cleanups.push(() => {
      detach();
      controls.dispose();
      element.remove();
    });
    element.dispatchEvent(mousePointer('pointerdown', { button: 0, buttons: 1, ctrlKey: true }));
    expect(controls.mouseButtons.left).toBe(CameraControlsImpl.ACTION.TRUCK);

    element.dispatchEvent(mousePointer('pointerup', { button: 0 }));
    element.dispatchEvent(mousePointer('pointerdown', { button: 0, buttons: 1 }));
    expect(controls.mouseButtons.left).toBe(CameraControlsImpl.ACTION.ROTATE);
  });
});
