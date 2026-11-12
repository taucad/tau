// @vitest-environment jsdom
import { useRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type CameraControlsImpl from 'camera-controls';
import { Raycaster, Scene, Vector3 } from 'three';
import type { Camera } from 'three';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RootState } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { createThreeCameraRig } from '@taucad/three/camera';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { createControlsAdapter } from '#graphics/three/adapters/controls-adapter.js';
import type { CameraPresetId } from '#graphics/three/controls/camera-presets.js';
import type { CameraInputRouting } from '#graphics/three/controls/camera-wheel-router.js';
import { GraphicsProvider } from '#hooks/use-graphics.jsx';
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';
import type { ViewerShortcutKeys } from '#hooks/use-viewer-shortcuts.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { asCameraActor } from '#services/graphics-camera-registry.js';

/*
 * N1 from the camera's state: in a focused viewer, under two mouse presets, the arrow keys orbit, Shift with an arrow
 * key pans and plus and minus zoom, through the real graphics actor, controls adapter and `camera-controls`. They do
 * nothing in a text field, nor while the host leaves them off.
 */

type CameraUpdateHandler = (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void;
type Ticker = Readonly<{ current: (state: RootState, delta: number) => void }>;

type Mounted = Readonly<{
  graphics: Actor<typeof graphicsMachine>;
  rig: ThreeCameraRig;
  controls: CameraControlsImpl;
  /** Steps the controls one frame, as the canvas's loop does. */
  tick: () => void;
}>;

const cameraView = {
  frameId: 'tau:root',
  target: [0, 0, 0],
  direction: [1, -1, 0.7],
  up: [0, 0, 1],
  verticalSpan: 10,
  perspectiveZoom: 1,
} as const;

const mounted: Mounted[] = [];

afterEach(() => {
  for (const { graphics, rig } of mounted.splice(0)) {
    graphics.stop();
    rig.dispose();
  }
  vi.restoreAllMocks();
});

const startViewer = (preset: CameraPresetId): Mounted => {
  const graphics = createActor(
    graphicsMachine.provide({
      actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) },
    }),
    { input: { camera: { cameraView } } },
  ).start();
  const { cameraRef } = graphics.getSnapshot().context;
  const connectorRef: { current: CameraUpdateHandler | undefined } = {
    current: undefined,
  };
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
    invalidate: vi.fn(),
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
  const routing: CameraInputRouting = {
    cameraInput: { preset },
    enablePan: true,
    enableZoom: true,
  };
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
  const viewer: Mounted = {
    graphics,
    rig,
    controls: state.controls as unknown as CameraControlsImpl,
    tick() {
      ticker?.current(state, 1 / 60);
    },
  };
  mounted.push(viewer);
  return viewer;
};

let shortcutKeys: ViewerShortcutKeys | undefined;

function Viewer({ navigation }: Readonly<{ navigation: boolean }>): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  shortcutKeys = useViewerShortcuts(barRef, () => undefined, { navigation });
  return (
    <section data-viewer-frame aria-label='Viewer'>
      <div ref={barRef}>
        <button type='button'>Viewer control</button>
        <input aria-label='Viewer field' />
      </div>
    </section>
  );
}

const renderViewer = (viewer: Mounted, navigation = true): void => {
  render(
    <KeyboardProvider>
      <GraphicsProvider graphicsRef={viewer.graphics}>
        <Viewer navigation={navigation} />
      </GraphicsProvider>
    </KeyboardProvider>,
  );
  act(() => {
    screen.getByRole('button', { name: 'Viewer control' }).focus();
  });
};

type Reading = Readonly<{
  azimuth: number;
  polar: number;
  distance: number;
  target: Vector3;
}>;

const read = (viewer: Mounted): Reading => ({
  azimuth: viewer.controls.azimuthAngle,
  polar: viewer.controls.polarAngle,
  distance: viewer.controls.distance,
  target: viewer.controls.getTarget(new Vector3()),
});

const epsilon = 1e-6;

const classify = (before: Reading, after: Reading): string => {
  const rotated = Math.abs(after.azimuth - before.azimuth) > epsilon || Math.abs(after.polar - before.polar) > epsilon;
  const panned = after.target.distanceTo(before.target) > epsilon;
  const zoomed = Math.abs(after.distance - before.distance) > epsilon;
  const changes = [rotated && 'orbit', panned && 'pan', zoomed && 'zoom'].filter(Boolean);
  return changes.length === 0 ? 'none' : changes.join('+');
};

/** Presses `keys` and returns what the camera did, after one frame. */
const press = async (viewer: Mounted, keys: string): Promise<string> => {
  const before = read(viewer);
  await userEvent.keyboard(keys);
  viewer.tick();
  return classify(before, read(viewer));
};

const rows: ReadonlyArray<readonly [keys: string, gesture: string]> = [
  ['{ArrowLeft}', 'orbit'],
  ['{ArrowRight}', 'orbit'],
  ['{ArrowUp}', 'orbit'],
  ['{ArrowDown}', 'orbit'],
  ['{Shift>}{ArrowLeft}{/Shift}', 'pan'],
  ['{Shift>}{ArrowRight}{/Shift}', 'pan'],
  ['{Shift>}{ArrowUp}{/Shift}', 'pan'],
  ['{Shift>}{ArrowDown}{/Shift}', 'pan'],
  ['+', 'zoom'],
  ['=', 'zoom'],
  ['-', 'zoom'],
];

describe('viewer navigation keys (N1)', () => {
  describe.each(['tau', 'alt'] as const satisfies readonly CameraPresetId[])('under the %s preset', (preset) => {
    it.each(rows)('%s does a %s', async (keys, gesture) => {
      const viewer = startViewer(preset);
      renderViewer(viewer);
      expect(await press(viewer, keys)).toBe(gesture);
    });

    it('zooms in with plus and back out with minus', async () => {
      const viewer = startViewer(preset);
      renderViewer(viewer);
      const { distance } = read(viewer);
      await press(viewer, '+');
      expect(read(viewer).distance).toBeLessThan(distance);
      await press(viewer, '-');
      expect(read(viewer).distance).toBeCloseTo(distance, 9);
    });
  });

  it("reports each step to the camera as the person's input", async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    await press(viewer, '{ArrowLeft}');
    expect(viewer.graphics.getSnapshot().context.cameraRef.getSnapshot().context.lastChange.source).toBe('input');
  });

  it('does nothing while focus is in a text field', async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    act(() => {
      screen.getByRole('textbox', { name: 'Viewer field' }).focus();
    });
    expect(await press(viewer, '{ArrowLeft}')).toBe('none');
    expect(await press(viewer, '-')).toBe('none');
  });

  it('does nothing while the host leaves navigation off', async () => {
    const viewer = startViewer('tau');
    renderViewer(viewer, false);
    expect(await press(viewer, '{ArrowLeft}')).toBe('none');
    expect(await press(viewer, '+')).toBe('none');
  });

  it('gives each step its key for tooltips', () => {
    const viewer = startViewer('tau');
    renderViewer(viewer);
    expect(shortcutKeys?.navigation.zoomIn).toBe('+');
    expect(shortcutKeys?.navigation.zoomOut).toBe('-');
    expect(shortcutKeys?.navigation.panLeft).not.toBe(shortcutKeys?.navigation.orbitLeft);
  });
});
