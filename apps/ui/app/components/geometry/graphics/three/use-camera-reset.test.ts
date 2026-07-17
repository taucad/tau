import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useCameraReset } from '#components/geometry/graphics/three/use-camera-reset.js';

const { cameraCapabilityActor, resetCamera } = vi.hoisted(() => ({
  cameraCapabilityActor: { send: vi.fn() },
  resetCamera: vi.fn<(parameters: Record<string, unknown>) => void>(),
}));

const camera = new THREE.PerspectiveCamera();
const firstControls = { id: 'first' };
const secondControls = { id: 'second' };
let liveControls: Record<string, unknown> = firstControls;

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera,
    controls: firstControls,
    get: () => ({ controls: liveControls }),
    invalidate: vi.fn(),
    size: { width: 800, height: 600 },
  }),
}));

vi.mock('#components/geometry/graphics/three/utils/camera.utils.js', () => ({
  resetCamera,
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraCapability: () => cameraCapabilityActor,
}));

describe('useCameraReset', () => {
  beforeEach(() => {
    cameraCapabilityActor.send.mockClear();
    resetCamera.mockClear();
    liveControls = firstControls;
  });

  it('should resolve the current controls when reset executes', () => {
    const geometryCenter = new THREE.Vector3(10, 20, 30);
    const { result } = renderHook(() =>
      useCameraReset({
        geometryRadius: 10,
        geometryCenter,
        geometryBounds: new THREE.Box3().setFromCenterAndSize(geometryCenter, new THREE.Vector3(20, 20, 20)),
        rotation: { side: -Math.PI / 4, vertical: Math.PI / 6 },
        perspective: {
          offsetRatio: 2,
          zoomLevel: 1,
          nearPlane: 0.001,
          minimumFarPlane: 10_000,
          farPlaneRadiusMultiplier: 5,
        },
        fitMargin: 0.1,
        setSceneRadius: vi.fn(),
        cameraFovAngle: 60,
      }),
    );

    liveControls = secondControls;
    act(() => {
      result.current();
    });

    expect(resetCamera).toHaveBeenCalledOnce();
    expect(resetCamera.mock.calls[0]?.[0]?.['controls']).toBe(secondControls);
  });
});
