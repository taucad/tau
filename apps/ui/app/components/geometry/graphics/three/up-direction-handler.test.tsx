import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { UpDirectionHandler } from '#components/geometry/graphics/three/up-direction-handler.js';

const mockUseThree = vi.fn();
const mockCameraCapabilitySend = vi.fn();

vi.mock('@react-three/fiber', () => ({
  useThree: (): ReturnType<typeof mockUseThree> => mockUseThree(),
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraCapability: (): { send: typeof mockCameraCapabilitySend } => ({
    send: mockCameraCapabilitySend,
  }),
}));

describe('UpDirectionHandler', () => {
  beforeEach(() => {
    mockUseThree.mockReset();
    mockCameraCapabilitySend.mockReset();
  });

  it('should sync CameraControls up before reset without forcing origin target', () => {
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
    mockCameraCapabilitySend.mockImplementation(() => {
      calls.push('reset');
    });
    mockUseThree.mockReturnValue({
      camera,
      scene,
      controls,
      invalidate: vi.fn(),
    });

    render(<UpDirectionHandler upDirection='x' />);

    expect(camera.up).toEqual(new THREE.Vector3(1, 0, 0));
    expect(child.up).toEqual(new THREE.Vector3(1, 0, 0));
    expect(controls.updateCameraUp).toHaveBeenCalledOnce();
    expect(controls.setTarget).not.toHaveBeenCalled();
    expect(mockCameraCapabilitySend).toHaveBeenCalledWith({ type: 'reset' });
    expect(calls).toEqual(['updateCameraUp', 'reset']);
  });
});
