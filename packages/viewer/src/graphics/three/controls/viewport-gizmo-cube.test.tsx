import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCameraView } from '@taucad/camera';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { ViewportGizmoCube } from '#graphics/three/controls/viewport-gizmo-cube.jsx';
import type * as ViewerEnvironmentModule from '#environment/viewer-environment.jsx';
import { Color } from 'three';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  let driverSnapshot: CameraDriverSnapshot;
  const rig = {
    activeCamera: perspectiveCamera,
    perspectiveCamera,
    orthographicCamera,
    actorRef: {
      getSnapshot: () => ({ context: { view: driverSnapshot.view } }),
    },
  };
  const compileAsync = vi.fn(async (_scene: unknown, _camera: unknown) => undefined);
  const gl = {
    compileAsync,
    domElement: undefined as unknown as HTMLCanvasElement,
  };
  const controls = { enabled: true };
  const scene = { isScene: true };
  const invalidate = vi.fn();
  const state = { gl, controls, scene, invalidate };
  const binding = { detach: vi.fn(), setCamera: vi.fn() };
  const graphicsActor = { send: vi.fn() };
  const interactionLock = { activeRef: { current: false } };
  const themeState: { theme: 'light' | 'dark'; isHighContrast: boolean } = { theme: 'light', isHighContrast: false };
  const graphicsState = { context: { upDirection: 'z' as 'x' | 'y' | 'z' } };
  const gizmos: Array<{
    camera: unknown;
    options: { up: 'x' | 'y' | 'z'; edges: { color: number }; right: { color: number; labelColor: number } };
    add: ReturnType<typeof vi.fn>;
    cameraUpdate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }> = [];
  let retarget:
    | ((camera: typeof perspectiveCamera | typeof orthographicCamera, snapshot: CameraDriverSnapshot) => void)
    | undefined;
  const syncGizmoFov = vi.fn();

  return {
    binding,
    compileAsync,
    getDriverSnapshot: () => driverSnapshot,
    getRetarget: () => retarget,
    graphicsActor,
    graphicsState,
    gizmos,
    gl,
    invalidate,
    interactionLock,
    orthographicCamera,
    perspectiveCamera,
    rig,
    setDriverSnapshot: (snapshot: CameraDriverSnapshot) => {
      driverSnapshot = snapshot;
    },
    setRetarget: (callback: typeof retarget) => {
      retarget = callback;
    },
    state,
    syncGizmoFov,
    themeState,
  };
});

const createDriverSnapshot = (requestedVerticalFieldOfView: number, revision: number): CameraDriverSnapshot => ({
  projection:
    requestedVerticalFieldOfView === 0
      ? { kind: 'orthographic' }
      : { kind: 'perspective', verticalFieldOfView: requestedVerticalFieldOfView },
  view: createCameraView({
    frameId: 'test-root',
    requestedVerticalFieldOfView,
    perspectiveZoom: 1,
    target: [0, 0, 0],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    viewport: { width: 800, height: 600, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
  perspectiveVerticalFieldOfView: requestedVerticalFieldOfView === 0 ? 60 : requestedVerticalFieldOfView,
  revision,
});

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));

vi.mock('three-viewport-gizmo', () => ({
  ViewportGizmo: class ViewportGizmo {
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids constructor parameter properties.
    public camera: unknown;
    public readonly add = vi.fn();
    public readonly cameraUpdate = vi.fn();
    public readonly dispose = vi.fn();
    public readonly update = vi.fn();
    public readonly scale = { multiplyScalar: vi.fn() };

    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids constructor parameter properties.
    public readonly options: {
      up: 'x' | 'y' | 'z';
      edges: { color: number };
      right: { color: number; labelColor: number };
    };

    public constructor(
      camera: unknown,
      _renderer: unknown,
      options: { up: 'x' | 'y' | 'z'; edges: { color: number }; right: { color: number; labelColor: number } },
    ) {
      this.camera = camera;
      this.options = options;
      mocks.gizmos.push(this);
    }
  },
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => mocks.rig,
  useCameraRetarget: (
    retarget: (
      camera: typeof mocks.perspectiveCamera | typeof mocks.orthographicCamera,
      snapshot: CameraDriverSnapshot,
    ) => void,
  ) => {
    React.useLayoutEffect(() => {
      mocks.setRetarget(retarget);
      retarget(mocks.rig.activeCamera, mocks.getDriverSnapshot());
      return () => {
        mocks.setRetarget(undefined);
      };
    }, [retarget]);
  },
  useGraphics: () => mocks.graphicsActor,
  useGraphicsSelector: (selector: (state: typeof mocks.graphicsState) => unknown) => selector(mocks.graphicsState),
}));

vi.mock('#environment/viewer-environment.jsx', async (importOriginal) => {
  const actual = await importOriginal<typeof ViewerEnvironmentModule>();
  return {
    ...actual,
    useViewerEnvironment: () => ({
      ...actual.defaultViewerEnvironment,
      colorScheme: mocks.themeState.theme,
      isHighContrast: mocks.themeState.isHighContrast,
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Fixed mock value, not rendered application styling.
      accentColor: '#00aaff',
    }),
  };
});
vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => 'webgpu',
}));
vi.mock('#graphics/three/controls/viewport-gizmo-cube-axes.js', () => ({
  createViewportGizmoCubeAxes: () => ({ isAxes: true }),
}));
vi.mock('#graphics/three/controls/viewport-gizmo-cube-surface.js', () => ({
  applyViewportGizmoSurface: vi.fn(),
}));
vi.mock('#graphics/three/controls/viewport-gizmo-controls-adapter.js', () => ({
  bindViewportGizmoControls: () => mocks.binding,
}));
vi.mock('#graphics/three/controls/viewport-gizmo-interaction-lock.jsx', () => ({
  useViewportGizmoInteractionLock: () => mocks.interactionLock,
}));
vi.mock('#graphics/three/controls/viewport-gizmo-render-loop.jsx', () => ({
  bindViewportGizmoInvalidationEvents: () => vi.fn(),
  useViewportGizmoRenderLoop: () => undefined,
}));
vi.mock('#graphics/three/utils/gizmo.utils.js', () => ({
  resolveGizmoContainer: () => document.body,
  syncGizmoFov: mocks.syncGizmoFov,
  useGizmoResizeSync: () => undefined,
}));

describe('ViewportGizmoCube camera retention', () => {
  beforeEach(() => {
    mocks.binding.detach.mockClear();
    mocks.binding.setCamera.mockClear();
    mocks.compileAsync.mockClear();
    mocks.gizmos.length = 0;
    mocks.gl.domElement = document.createElement('canvas');
    mocks.invalidate.mockClear();
    mocks.rig.activeCamera = mocks.perspectiveCamera;
    mocks.setDriverSnapshot(createDriverSnapshot(60, 0));
    mocks.setRetarget(undefined);
    mocks.syncGizmoFov.mockClear();
    mocks.themeState.theme = 'light';
    mocks.themeState.isHighContrast = false;
    mocks.graphicsState.context.upDirection = 'z';
  });

  it('builds the gizmo around the view up axis and rebuilds when it changes', () => {
    const mounted = render(<ViewportGizmoCube />);
    expect(mocks.gizmos[0]!.options.up).toBe('z');

    mocks.graphicsState.context.upDirection = 'y';
    mounted.rerender(<ViewportGizmoCube />);
    expect(mocks.gizmos).toHaveLength(2);
    expect(mocks.gizmos[0]!.dispose).toHaveBeenCalledOnce();
    expect(mocks.gizmos[1]!.options.up).toBe('y');
  });

  it('retargets one gizmo and binding without recreation', () => {
    const mounted = render(<ViewportGizmoCube />);
    const gizmo = mocks.gizmos[0]!;
    expect(mocks.gizmos).toHaveLength(1);

    act(() => mocks.getRetarget()?.(mocks.orthographicCamera, createDriverSnapshot(0, 1)));
    expect(mocks.gizmos).toEqual([gizmo]);
    expect(gizmo.camera).toBe(mocks.orthographicCamera);
    expect(mocks.binding.setCamera).toHaveBeenCalledWith(mocks.orthographicCamera);
    expect(gizmo.cameraUpdate).toHaveBeenCalledOnce();

    mocks.setDriverSnapshot(createDriverSnapshot(0, 1));
    mounted.rerender(<ViewportGizmoCube />);
    expect(mocks.gizmos).toEqual([gizmo]);
  });

  it('synchronizes a same-camera FOV revision before React rerenders', () => {
    render(<ViewportGizmoCube />);
    const gizmo = mocks.gizmos[0]!;
    mocks.binding.setCamera.mockClear();
    mocks.syncGizmoFov.mockClear();
    gizmo.cameraUpdate.mockClear();

    act(() => mocks.getRetarget()?.(mocks.perspectiveCamera, createDriverSnapshot(39, 1)));

    expect(mocks.gizmos).toEqual([gizmo]);
    expect(mocks.binding.setCamera).toHaveBeenCalledWith(mocks.perspectiveCamera);
    expect(mocks.syncGizmoFov).toHaveBeenCalledWith(gizmo, 39);
    expect(gizmo.cameraUpdate).toHaveBeenCalledOnce();
  });

  it('warms the cube and axes for both native camera endpoints', () => {
    render(<ViewportGizmoCube />);
    expect(mocks.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.compileAsync.mock.calls.map((call) => call[1])).toEqual([
      mocks.perspectiveCamera,
      mocks.orthographicCamera,
    ]);
    expect(mocks.compileAsync.mock.calls.every((call) => call[0] === mocks.gizmos[0])).toBe(true);
  });

  it('should repaint loaded fonts without reverting a camera retarget', async () => {
    const loaded = Promise.withResolvers<FontFace[]>();
    const fonts = { check: () => false, load: vi.fn(async () => loaded.promise) };
    const previousFonts = document.fonts;
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    try {
      render(<ViewportGizmoCube />);
      act(() => mocks.getRetarget()?.(mocks.orthographicCamera, createDriverSnapshot(0, 1)));
      await act(async () => {
        loaded.resolve([]);
        await loaded.promise;
      });
      expect(mocks.gizmos).toHaveLength(2);
      expect(mocks.gizmos[0]!.dispose).toHaveBeenCalledOnce();
      expect(mocks.gizmos[1]!.camera).toBe(mocks.orthographicCamera);
      expect(fonts.load).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: previousFonts });
    }
  });

  it('should rebuild with stronger faces and legible labels in high-contrast dark mode', () => {
    mocks.themeState.theme = 'dark';
    const mounted = render(<ViewportGizmoCube />);
    const normalFace = mocks.gizmos[0]!.options.right.color;
    mocks.themeState.isHighContrast = true;
    mounted.rerender(<ViewportGizmoCube />);
    const { color, labelColor } = mocks.gizmos[1]!.options.right;
    const face = new Color(color);
    const label = new Color(labelColor);
    const luminance = (value: Color): number => 0.2126 * value.r + 0.7152 * value.g + 0.0722 * value.b;
    expect(color).not.toBe(normalFace);
    expect((luminance(label) + 0.05) / (luminance(face) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(mocks.gizmos[0]!.dispose).toHaveBeenCalledOnce();
  });
});
