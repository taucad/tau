import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewportGizmoCube } from '#components/geometry/graphics/three/controls/viewport-gizmo-cube.js';

const mocks = vi.hoisted(() => {
  const perspectiveCamera = { kind: 'perspective' };
  const orthographicCamera = { kind: 'orthographic' };
  const rig = { activeCamera: perspectiveCamera, perspectiveCamera, orthographicCamera };
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
  const gizmos: Array<{
    camera: unknown;
    add: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }> = [];
  let retarget: ((camera: typeof perspectiveCamera) => void) | undefined;
  let fov = 60;

  return {
    binding,
    compileAsync,
    getFov: () => fov,
    getRetarget: () => retarget,
    graphicsActor,
    gizmos,
    gl,
    invalidate,
    interactionLock,
    orthographicCamera,
    perspectiveCamera,
    rig,
    setFov: (value: number) => {
      fov = value;
    },
    setRetarget: (callback: typeof retarget) => {
      retarget = callback;
    },
    state,
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));

vi.mock('three-viewport-gizmo', () => ({
  ViewportGizmo: class ViewportGizmo {
    // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids constructor parameter properties.
    public camera: unknown;
    public readonly add = vi.fn();
    public readonly dispose = vi.fn();
    public readonly update = vi.fn();
    public readonly scale = { multiplyScalar: vi.fn() };

    public constructor(camera: unknown, _renderer: unknown, _options: unknown) {
      this.camera = camera;
      mocks.gizmos.push(this);
    }
  },
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mocks.rig,
  useCameraSelector: () => mocks.getFov(),
  useCameraRetarget: (retarget: (camera: typeof mocks.perspectiveCamera) => void) => {
    React.useLayoutEffect(() => {
      mocks.setRetarget(retarget);
      retarget(mocks.rig.activeCamera);
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
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme enum.
  Theme: { DARK: 'dark' },
  useTheme: () => ({ theme: 'light' }),
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
  syncGizmoFov: vi.fn(),
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
    mocks.setFov(60);
    mocks.setRetarget(undefined);
  });

  it('retargets one gizmo and binding without recreation', () => {
    const mounted = render(<ViewportGizmoCube />);
    const gizmo = mocks.gizmos[0]!;
    expect(mocks.gizmos).toHaveLength(1);

    act(() => mocks.getRetarget()?.(mocks.orthographicCamera));
    expect(mocks.gizmos).toEqual([gizmo]);
    expect(gizmo.camera).toBe(mocks.orthographicCamera);
    expect(mocks.binding.setCamera).toHaveBeenCalledWith(mocks.orthographicCamera);
    expect(gizmo.update).toHaveBeenCalledWith(false);

    mocks.setFov(0);
    mounted.rerender(<ViewportGizmoCube />);
    expect(mocks.gizmos).toEqual([gizmo]);
  });

  it('warms the axes for both native camera endpoints', () => {
    render(<ViewportGizmoCube />);
    expect(mocks.compileAsync).toHaveBeenCalledTimes(2);
    expect(mocks.compileAsync.mock.calls.map((call) => call[1])).toEqual([
      mocks.perspectiveCamera,
      mocks.orthographicCamera,
    ]);
  });
});
