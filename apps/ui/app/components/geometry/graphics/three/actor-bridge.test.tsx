import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import type { Camera } from 'three';
import { createCameraView } from '@taucad/camera';
import type { CameraProjection } from '@taucad/camera';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { ThreeCamera, ThreeCameraRig } from '@taucad/three/camera';
import { ActorBridge } from '#components/geometry/graphics/three/actor-bridge.js';

const mockUseThree = vi.fn();
const mockGraphicsSend = vi.fn();
const mockCameraSend = vi.fn();
const mockConnectorRef: { current: ((camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void) | undefined } = {
  current: undefined,
};
const mockConsumersRef = {
  current: new Set<(camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void>(),
};
let mockRig: ThreeCameraRig;

const createDriverSnapshot = (projection: CameraProjection, revision: number): CameraDriverSnapshot => ({
  projection,
  view: createCameraView({
    requestedVerticalFieldOfView: projection.kind === 'orthographic' ? 0 : projection.verticalFieldOfView,
    target: [0, 0, 0],
    direction: [1, -1, 0.7],
    up: [0, 0, 1],
    verticalSpan: 10,
    viewport: { width: 800, height: 600, pixelRatio: 1 },
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  }),
  effectiveVerticalFieldOfView: projection.kind === 'orthographic' ? 0 : projection.verticalFieldOfView,
  perspectiveVerticalFieldOfView: projection.kind === 'orthographic' ? 60 : projection.verticalFieldOfView,
  revision,
});

vi.mock('@react-three/fiber', () => ({
  useThree: (): ReturnType<typeof mockUseThree> => mockUseThree(),
}));

vi.mock('#components/geometry/graphics/three/controls-listener-bridge.js', () => ({
  ControlsListenerBridge: () => <div data-testid='controls-listener-bridge' />,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphics: () => ({ send: mockGraphicsSend }),
  useCameraRig: () => mockRig,
  useCameraConnectorRef: () => mockConnectorRef,
  useCameraConsumersRef: () => mockConsumersRef,
}));

describe('ActorBridge', () => {
  beforeEach(() => {
    const perspectiveCamera = new PerspectiveCamera();
    const orthographicCamera = new OrthographicCamera();
    mockRig = {
      perspectiveCamera,
      orthographicCamera,
      activeCamera: perspectiveCamera,
      actorRef: {
        getSnapshot: () => ({
          context: {
            view: {
              target: [0, 0, 0],
              verticalSpan: 10,
              viewport: { width: 800, height: 600, pixelRatio: 1 },
            },
            effectiveVerticalFieldOfView: 60,
            lastPerspectiveVerticalFieldOfView: 60,
            pixelBudget: 0.25,
            revision: 0,
          },
        }),
        send: mockCameraSend,
      },
      dispose: vi.fn(),
    } as unknown as ThreeCameraRig;
    mockConnectorRef.current = undefined;
    mockConsumersRef.current.clear();
    mockGraphicsSend.mockReset();
    mockCameraSend.mockReset();
  });

  it('retargets retained consumers before publishing one camera and invalidating once', () => {
    const calls: string[] = [];
    const state = {
      camera: mockRig.perspectiveCamera as Camera,
      controls: null,
      raycaster: { near: 0, far: 0 },
    };
    const set = vi.fn(({ camera }: { camera: Camera }) => {
      calls.push('publish');
      state.camera = camera;
    });
    const invalidate = vi.fn(() => calls.push('invalidate'));
    mockConsumersRef.current.add(() => calls.push('retarget'));
    mockUseThree.mockReturnValue({
      ...state,
      get: () => state,
      invalidate,
      set,
      size: { width: 800, height: 600 },
    });

    render(<ActorBridge />);
    calls.length = 0;
    invalidate.mockClear();
    const { orthographicCamera } = mockRig;
    mockConnectorRef.current?.(orthographicCamera, createDriverSnapshot({ kind: 'orthographic' }, 1));

    expect(calls).toEqual(['retarget', 'publish', 'invalidate']);
    expect(state.camera).toBe(orthographicCamera);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(mockGraphicsSend).toHaveBeenLastCalledWith({ type: 'cameraViewChanged', verticalSpan: 10 });
  });

  it('retargets a same-camera FOV revision before invalidating', () => {
    const calls: string[] = [];
    const state = {
      camera: mockRig.perspectiveCamera as Camera,
      controls: null,
      raycaster: { near: 0, far: 0 },
    };
    const invalidate = vi.fn(() => calls.push('invalidate'));
    const set = vi.fn(() => calls.push('publish'));
    mockConsumersRef.current.add((_camera, snapshot) => {
      calls.push(`retarget:${snapshot.view.requestedVerticalFieldOfView}`);
    });
    mockUseThree.mockReturnValue({
      ...state,
      get: () => state,
      invalidate,
      set,
      size: { width: 800, height: 600 },
    });

    render(<ActorBridge />);
    calls.length = 0;
    invalidate.mockClear();
    set.mockClear();
    mockConnectorRef.current?.(
      mockRig.perspectiveCamera,
      createDriverSnapshot({ kind: 'perspective', verticalFieldOfView: 39 }, 1),
    );

    expect(calls).toEqual(['retarget:39', 'invalidate']);
    expect(set).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('mounts the interaction listener only after controls exist', () => {
    const state = {
      camera: mockRig.perspectiveCamera,
      controls: undefined as undefined | { addEventListener: () => void; removeEventListener: () => void },
      raycaster: { near: 0, far: 0 },
    };
    mockUseThree.mockReturnValue({
      ...state,
      get: () => state,
      invalidate: vi.fn(),
      set: vi.fn(),
      size: { width: 800, height: 600 },
    });
    const { rerender } = render(<ActorBridge />);
    expect(screen.queryByTestId('controls-listener-bridge')).not.toBeInTheDocument();

    state.controls = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    mockUseThree.mockReturnValue({
      ...state,
      get: () => state,
      invalidate: vi.fn(),
      set: vi.fn(),
      size: { width: 800, height: 600 },
    });
    rerender(<ActorBridge />);
    expect(screen.getByTestId('controls-listener-bridge')).toBeInTheDocument();
  });

  it('republishes raycaster clipping when clip planes change without a camera revision', () => {
    const state = {
      camera: mockRig.perspectiveCamera as Camera,
      controls: null,
      raycaster: { near: 0, far: 0 },
    };
    const invalidate = vi.fn();
    mockUseThree.mockReturnValue({
      ...state,
      get: () => state,
      invalidate,
      set: vi.fn(),
      size: { width: 800, height: 600 },
    });

    render(<ActorBridge />);
    invalidate.mockClear();
    mockRig.perspectiveCamera.near = 0.01;
    mockRig.perspectiveCamera.far = 1_000_000;
    mockConnectorRef.current?.(
      mockRig.perspectiveCamera,
      createDriverSnapshot({ kind: 'perspective', verticalFieldOfView: 60 }, 0),
    );

    expect(state.raycaster).toEqual({ near: 0.01, far: 1_000_000 });
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
