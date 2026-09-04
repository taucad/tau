import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCameraView } from '@taucad/camera';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';

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
  const themeState = { theme: 'light', isHighContrast: false };
  const gizmos: Array<{
    camera: unknown;
    options: { edges: { color: number }; right: { color: number; labelColor: number } };
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
    public readonly options: { edges: { color: number }; right: { color: number; labelColor: number } };

    public constructor(
      camera: unknown,
      _renderer: unknown,
      options: { edges: { color: number }; right: { color: number; labelColor: number } },
    ) {
      this.camera = camera;
      this.options = options;
      mocks.gizmos.push(this);
    }
  },
}));

vi.mock('#hooks/use-graphics.js', () => ({
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
}));

// oxlint-disable-next-line tau-lint/no-hardcoded-color -- Fixed mock value, not rendered application styling.
vi.mock('#hooks/use-color.js', () => ({ useColor: () => ({ serialized: { hex: '#00aaff' } }) }));
vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark' },
  useTheme: () => mocks.themeState,
}));
vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgpu',
}));
vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-cube-axes.js', () => ({
  createViewportGizmoCubeAxes: () => ({ isAxes: true }),
}));
vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-controls-adapter.js', () => ({
  bindViewportGizmoControls: () => mocks.binding,
}));
vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js', () => ({
  useViewportGizmoInteractionLock: () => mocks.interactionLock,
}));
vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js', () => ({
  bindViewportGizmoInvalidationEvents: () => vi.fn(),
  useViewportGizmoRenderLoop: () => undefined,
}));
vi.mock('#components/geometry/graphics/three/utils/gizmo.utils.js', () => ({
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

  it('warms the axes for both native camera endpoints', () => {
    render(<ViewportGizmoCube />);
    expect(mocks.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.compileAsync.mock.calls.map((call) => call[1])).toEqual([
      mocks.perspectiveCamera,
      mocks.orthographicCamera,
    ]);
  });

  it('uses stronger neutral faces and edges in high-contrast dark mode', () => {
    mocks.themeState.theme = 'dark';
    mocks.themeState.isHighContrast = true;

    render(<ViewportGizmoCube />);

    expect(mocks.gizmos[0]!.options.right).toMatchObject({ color: 0x66_66_66, labelColor: 0xff_ff_ff });
    expect(mocks.gizmos[0]!.options.edges.color).toBe(0xff_ff_ff);
  });
});
