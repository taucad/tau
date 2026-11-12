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
import { resolveCameraControlProps } from '#graphics/three/controls/tau-camera-controls.jsx';
import { asCameraActor } from '#services/graphics-camera-registry.js';
import { cameraMappings, cameraPresetIds } from '#graphics/three/controls/camera-presets.js';
import type {
  CameraDragButton,
  CameraGesture,
  CameraMappingId,
  CameraModifier,
} from '#graphics/three/controls/camera-presets.js';
import type { CameraInput, CameraInputRouting } from '#graphics/three/controls/camera-wheel-router.js';

/*
 * C1 to C8, C13 and C14 in a real browser: the view's camera is the graphics child presented by the controls adapter,
 * on a real surface, driven by real pointer and wheel events. Each row reads the camera's azimuth, polar angle,
 * distance, zoom and target before and after a gesture and classifies the change.
 */

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;

type Viewer = Readonly<{
  rig: ThreeCameraRig;
  surface: HTMLElement;
  controls: CameraControlsImpl;
  /** Changes the camera input the router reads at the next gesture. */
  setInput: (input: CameraInput | undefined) => void;
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

const mountRoutedViewer = (
  input: CameraInput | undefined,
  options: Readonly<{ projection?: 'perspective' | 'orthographic'; scene?: Scene }> = {},
): Viewer => {
  const projection = options.projection ?? 'perspective';
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
  surface.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px';
  document.body.append(surface);
  viewers.push({ graphics, rig, surface });
  const state = {
    camera: rig.activeCamera as Camera,
    controls: null as RootState['controls'],
    gl: { domElement: surface },
    events: { connected: undefined as HTMLElement | undefined },
    scene: options.scene ?? new Scene(),
    raycaster: new Raycaster(),
    size: { width: 800, height: 600, top: 0, left: 0 },
    invalidate: vi.fn(),
    set(patch: Partial<RootState>) {
      Object.assign(state, patch);
    },
    get: () => state,
    internal: { subscribe: () => () => undefined },
  } as unknown as RootState;
  let routing: CameraInputRouting | undefined =
    input === undefined ? undefined : { cameraInput: input, enablePan: true, enableZoom: true };
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
  // The feel `Controls` applies to the adapter's instance: undamped, the viewer's speeds and today's bindings.
  const controls = state.controls as unknown as CameraControlsImpl;
  const { mouseButtons, ...feel } = resolveCameraControlProps({
    enablePan: true,
    enableZoom: true,
    projectionKind: projection,
  });
  Object.assign(controls, feel);
  Object.assign(controls.mouseButtons, mouseButtons);
  return {
    rig,
    surface,
    controls,
    setInput(next) {
      routing = next === undefined ? undefined : { cameraInput: next, enablePan: true, enableZoom: true };
    },
  };
};

type CameraReading = Readonly<{
  azimuth: number;
  polar: number;
  distance: number;
  zoom: number;
  target: readonly [number, number, number];
}>;

const readCamera = (viewer: Viewer): CameraReading => {
  const target = viewer.controls.getTarget(new Vector3());
  return {
    azimuth: viewer.controls.azimuthAngle,
    polar: viewer.controls.polarAngle,
    distance: viewer.controls.distance,
    zoom: viewer.rig.activeCamera.zoom,
    target: [target.x, target.y, target.z],
  };
};

const settle = (viewer: Viewer): void => {
  for (let frame = 0; frame < 4; frame += 1) {
    viewer.controls.update(1 / 60);
  }
};

const buttonNumber: Readonly<Record<CameraDragButton, number>> = { left: 0, middle: 1, right: 2 };
const buttonBits: Readonly<Record<CameraDragButton, number>> = { left: 1, middle: 4, right: 2 };

type Keys = Readonly<{ shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }>;

const keysOf = (modifiers: readonly CameraModifier[]): Keys => ({
  shiftKey: modifiers.includes('shift'),
  ctrlKey: modifiers.includes('ctrl'),
  altKey: modifiers.includes('alt'),
});

/**
 * One drag from the canvas centre: a press, steps of `step` pixels, and a release.
 */
const drag = (
  viewer: Viewer,
  options: Readonly<{
    button: CameraDragButton;
    keys?: Keys;
    steps?: number;
    step?: readonly [number, number];
    start?: readonly [number, number];
  }>,
): void => {
  const { button, keys = {}, steps = 4, step = [10, 6], start = [400, 300] } = options;
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: buttonNumber[button],
    buttons: buttonBits[button],
    ...keys,
  };
  viewer.surface.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientX: start[0], clientY: start[1] }));
  settle(viewer);
  for (let index = 1; index <= steps; index += 1) {
    viewer.surface.dispatchEvent(
      new PointerEvent('pointermove', {
        ...init,
        button: -1,
        clientX: start[0] + step[0] * index,
        clientY: start[1] + step[1] * index,
      }),
    );
    settle(viewer);
  }
  viewer.surface.dispatchEvent(
    new PointerEvent('pointerup', {
      ...init,
      buttons: 0,
      clientX: start[0] + step[0] * steps,
      clientY: start[1] + step[1] * steps,
    }),
  );
  settle(viewer);
};

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
  settle(viewer);
  return event;
};

const epsilon = 1e-6;

/** Which of orbit, pan and zoom a change between two readings is, or `none`. */
const classify = (before: CameraReading, after: CameraReading): CameraGesture | 'mixed' => {
  const rotated = Math.abs(after.azimuth - before.azimuth) > epsilon || Math.abs(after.polar - before.polar) > epsilon;
  const panned = after.target.some((value, index) => Math.abs(value - before.target[index]!) > epsilon);
  const zoomed = Math.abs(after.distance - before.distance) > epsilon || Math.abs(after.zoom - before.zoom) > epsilon;
  const changes = [rotated && 'orbit', panned && 'pan', zoomed && 'zoom'].filter(Boolean);
  if (changes.length === 0) {
    return 'none';
  }
  return changes.length === 1 ? (changes[0] as CameraGesture) : 'mixed';
};

const mappingIds: readonly CameraMappingId[] = [...cameraPresetIds, 'trackpad'];
const inputOf = (mapping: CameraMappingId): CameraInput =>
  mapping === 'trackpad' ? { inputDevice: 'trackpad', preset: 'alt' } : { preset: mapping };

const modifierSets: ReadonlyArray<readonly CameraModifier[]> = [
  [],
  ['shift'],
  ['ctrl'],
  ['alt'],
  ['shift', 'ctrl'],
  ['shift', 'alt'],
  ['ctrl', 'alt'],
  ['shift', 'ctrl', 'alt'],
];

const listed = mappingIds.flatMap((mapping) =>
  cameraMappings[mapping].drag.map((binding) => ({
    mapping,
    button: binding.button,
    modifiers: binding.modifiers,
    gesture: binding.gesture,
  })),
);

const unlisted = mappingIds.flatMap((mapping) =>
  (['left', 'middle', 'right'] as const).flatMap((button) =>
    modifierSets
      .filter(
        (modifiers) =>
          !cameraMappings[mapping].drag.some(
            (binding) =>
              binding.button === button &&
              binding.modifiers.length === modifiers.length &&
              binding.modifiers.every((name) => modifiers.includes(name)),
          ),
      )
      .map((modifiers) => ({ mapping, button, modifiers })),
  ),
);

describe('camera input router in the browser', () => {
  it.each(listed)(
    '$mapping: $modifiers + $button drag → $gesture (C1 to C7)',
    ({ mapping, button, modifiers, gesture }) => {
      const viewer = mountRoutedViewer(inputOf(mapping));
      const before = readCamera(viewer);
      drag(viewer, { button, keys: keysOf(modifiers) });
      expect(classify(before, readCamera(viewer))).toBe(gesture);
    },
  );

  it.each(unlisted)('$mapping: $modifiers + $button drag does nothing (C8)', ({ mapping, button, modifiers }) => {
    const viewer = mountRoutedViewer(inputOf(mapping));
    const before = readCamera(viewer);
    drag(viewer, { button, keys: keysOf(modifiers) });
    expect(classify(before, readCamera(viewer))).toBe('none');
  });

  it.each(cameraPresetIds)('%s: the wheel zooms', (preset) => {
    const viewer = mountRoutedViewer({ preset });
    const before = readCamera(viewer);
    const event = wheel(viewer, { deltaY: 40 });
    expect(event.defaultPrevented).toBe(true);
    // Zoom to cursor at the canvas centre is a zoom toward the target.
    expect(classify(before, readCamera(viewer))).toBe('zoom');
  });

  it.each([
    { name: 'a two-finger scroll pans', init: { deltaX: 12, deltaY: 30 }, gesture: 'pan' },
    { name: 'Alt + two-finger scroll orbits', init: { deltaX: 12, deltaY: 30, altKey: true }, gesture: 'orbit' },
    { name: 'a pinch zooms', init: { deltaY: 30, ctrlKey: true }, gesture: 'zoom' },
  ] as const)('trackpad: $name (C7)', ({ init, gesture }) => {
    const viewer = mountRoutedViewer({ inputDevice: 'trackpad', preset: 'middle-ctrl' });
    const before = readCamera(viewer);
    wheel(viewer, init);
    expect(classify(before, readCamera(viewer))).toBe(gesture);
  });

  it('turning the trackpad switch off restores the stored preset (C7)', () => {
    const viewer = mountRoutedViewer({ inputDevice: 'trackpad', preset: 'middle-ctrl' });
    let before = readCamera(viewer);
    drag(viewer, { button: 'left' });
    expect(classify(before, readCamera(viewer))).toBe('orbit');

    viewer.setInput({ inputDevice: 'mouse', preset: 'middle-ctrl' });
    before = readCamera(viewer);
    drag(viewer, { button: 'left' });
    expect(classify(before, readCamera(viewer))).toBe('none');
    before = readCamera(viewer);
    drag(viewer, { button: 'middle' });
    expect(classify(before, readCamera(viewer))).toBe('orbit');
    before = readCamera(viewer);
    wheel(viewer, { deltaY: 30 });
    expect(classify(before, readCamera(viewer))).toBe('zoom');
  });

  it('follows a preset change at the next gesture, without a new canvas', () => {
    const viewer = mountRoutedViewer({ preset: 'tau' });
    let before = readCamera(viewer);
    drag(viewer, { button: 'right' });
    expect(classify(before, readCamera(viewer))).toBe('pan');

    viewer.setInput({ preset: 'right-orbit' });
    before = readCamera(viewer);
    drag(viewer, { button: 'right' });
    expect(classify(before, readCamera(viewer))).toBe('orbit');
  });

  describe('without a camera input', () => {
    it.each([
      { button: 'left', keys: {}, gesture: 'orbit' },
      { button: 'left', keys: { shiftKey: true }, gesture: 'orbit' },
      { button: 'left', keys: { ctrlKey: true }, gesture: 'orbit' },
      { button: 'middle', keys: {}, gesture: 'pan' },
      { button: 'right', keys: {}, gesture: 'pan' },
      { button: 'right', keys: { altKey: true }, gesture: 'pan' },
    ] as const)("keeps today's binding: $keys + $button → $gesture", ({ button, keys, gesture }) => {
      const viewer = mountRoutedViewer(undefined);
      const before = readCamera(viewer);
      drag(viewer, { button, keys });
      expect(classify(before, readCamera(viewer))).toBe(gesture);
    });
  });

  describe('right button, click or drag (C13)', () => {
    it.each([
      { preset: 'tau', gesture: 'pan' },
      { preset: 'right-orbit', gesture: 'orbit' },
    ] as const)('$preset: a press and release within 4 px does not move the camera', ({ preset }) => {
      const viewer = mountRoutedViewer({ preset });
      const before = readCamera(viewer);
      drag(viewer, { button: 'right', steps: 3, step: [1, 0.5] });
      expect(classify(before, readCamera(viewer))).toBe('none');
    });

    it.each([
      { preset: 'tau', gesture: 'pan' },
      { preset: 'right-orbit', gesture: 'orbit' },
    ] as const)('$preset: a longer drag moves the camera ($gesture)', ({ preset, gesture }) => {
      const viewer = mountRoutedViewer({ preset });
      const before = readCamera(viewer);
      drag(viewer, { button: 'right', steps: 4, step: [3, 2] });
      expect(classify(before, readCamera(viewer))).toBe(gesture);
    });

    it('does not withhold a short move from the page', () => {
      const viewer = mountRoutedViewer({ preset: 'tau' });
      const seen = vi.fn();
      viewer.surface.addEventListener('pointermove', seen);
      drag(viewer, { button: 'right', steps: 2, step: [1, 0] });
      expect(seen).toHaveBeenCalledTimes(2);
    });
  });

  describe('known hazards (C14)', () => {
    it('a Ctrl + wheel inside the viewer never zooms the page, even with zoom off', () => {
      const viewer = mountRoutedViewer({ preset: 'tau' });
      viewer.controls.enabled = false;
      expect(wheel(viewer, { deltaY: 30, ctrlKey: true }).defaultPrevented).toBe(true);
    });

    it('a Ctrl + wheel outside the viewer is left to the browser', () => {
      mountRoutedViewer({ preset: 'tau' });
      const outside = document.createElement('div');
      document.body.append(outside);
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 30, ctrlKey: true });
      outside.dispatchEvent(event);
      outside.remove();
      expect(event.defaultPrevented).toBe(false);
    });
  });
});
