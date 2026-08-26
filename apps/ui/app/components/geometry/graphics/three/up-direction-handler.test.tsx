import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { UpDirectionHandler } from '#components/geometry/graphics/three/up-direction-handler.js';

type MockThreeState = Readonly<{
  camera: THREE.Camera;
  scene: THREE.Scene;
  controls: unknown;
  invalidate: () => void;
}>;

const mockUseThree = vi.fn<() => MockThreeState>();
const mockCameraSend = vi.fn();
let mockThreeState: MockThreeState;
const mockGetThreeState = (): MockThreeState => mockThreeState;
const mockCameraRig = {
  actorRef: {
    getSnapshot: () => ({
      context: { view: { target: [4, 5, 6], direction: [1, 0, 0], up: [0, 0, 1], verticalSpan: 20 } },
    }),
    send: mockCameraSend,
  },
};

vi.mock('@react-three/fiber', () => ({
  useThree: (selector?: (state: MockThreeState & { get: () => MockThreeState }) => unknown): unknown => {
    mockThreeState = mockUseThree();
    const selectableState = { ...mockThreeState, get: mockGetThreeState };
    return selector ? selector(selectableState) : selectableState;
  },
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => mockCameraRig,
}));

describe('UpDirectionHandler', () => {
  beforeEach(() => {
    mockUseThree.mockReset();
    mockCameraSend.mockReset();
  });

  it('should preserve the actor camera up during initial scene setup', () => {
    const calls: string[] = [];
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    const child = new THREE.Object3D();
    scene.add(child);
    const controls = {
      getTarget: (target: THREE.Vector3): THREE.Vector3 => target.set(10, 20, 30),
      updateCameraUp: vi.fn(() => {
        calls.push('updateCameraUp');
      }),
      setTarget: vi.fn(() => {
        calls.push('setTarget');
      }),
    };
    mockUseThree.mockReturnValue({
      camera,
      scene,
      controls,
      invalidate: vi.fn(),
    });

    render(<UpDirectionHandler upDirection='x' />);

    expect(camera.up).toEqual(new THREE.Vector3(0, 0, 1));
    expect(child.up).toEqual(new THREE.Vector3(1, 0, 0));
    expect(controls.updateCameraUp).toHaveBeenCalledOnce();
    expect(controls.setTarget).not.toHaveBeenCalled();
    expect(mockCameraSend).not.toHaveBeenCalled();
    expect(calls).toEqual(['updateCameraUp']);
  });

  it('should recompute and persist camera up after an actual world-axis change', () => {
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    const controls = { updateCameraUp: vi.fn() };
    mockUseThree.mockReturnValue({ camera, scene, controls, invalidate: vi.fn() });
    const mounted = render(<UpDirectionHandler upDirection='z' />);
    mockCameraSend.mockClear();

    mounted.rerender(<UpDirectionHandler upDirection='y' />);

    expect(mockCameraSend).toHaveBeenCalledWith({
      type: 'setView',
      target: [4, 5, 6],
      direction: [1, 0, 0],
      up: [0, 1, 0],
      verticalSpan: 20,
    });
  });

  it('should not traverse or reset when only the active camera identity changes', () => {
    const firstCamera = new THREE.PerspectiveCamera();
    const secondCamera = new THREE.OrthographicCamera();
    const scene = new THREE.Scene();
    const traverse = vi.spyOn(scene, 'traverse');
    const controls = { updateCameraUp: vi.fn() };
    const invalidate = vi.fn();
    mockUseThree.mockReturnValue({ camera: firstCamera, scene, controls, invalidate });

    const { rerender } = render(<UpDirectionHandler upDirection='z' />);
    expect(traverse).toHaveBeenCalledOnce();
    expect(mockCameraSend).not.toHaveBeenCalled();

    mockUseThree.mockReturnValue({ camera: secondCamera, scene, controls, invalidate });
    rerender(<UpDirectionHandler upDirection='z' />);

    expect(traverse).toHaveBeenCalledOnce();
    expect(mockCameraSend).not.toHaveBeenCalled();
  });
});
