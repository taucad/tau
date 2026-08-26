import { describe, expect, it, vi } from 'vitest';
import CameraControlsImpl from 'camera-controls';
import { OrthographicCamera, PerspectiveCamera } from 'three';
import {
  retargetCameraControls,
  shouldUpdateTauCameraControlsFrame,
} from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import type { RetargetableCameraControls } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';

describe('TauCameraControls frame ownership', () => {
  it('updates controls only while controls are enabled and no viewport gizmo owns the camera', () => {
    const controls = {
      enabled: true,
      update: vi.fn(),
    };
    const interactionLock = {
      activeRef: { current: false },
    };

    expect(shouldUpdateTauCameraControlsFrame({ controls, interactionLock })).toBe(true);

    interactionLock.activeRef.current = true;
    expect(shouldUpdateTauCameraControlsFrame({ controls, interactionLock })).toBe(false);

    interactionLock.activeRef.current = false;
    controls.enabled = false;
    expect(shouldUpdateTauCameraControlsFrame({ controls, interactionLock })).toBe(false);
  });
});

describe('TauCameraControls camera identity', () => {
  it('retargets one controls instance and projection-specific input mappings', () => {
    const perspective = new PerspectiveCamera();
    const orthographic = new OrthographicCamera();
    const controls: RetargetableCameraControls = {
      camera: perspective,
      cancel: vi.fn(),
      mouseButtons: { wheel: CameraControlsImpl.ACTION.DOLLY },
      touches: { two: CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK },
      updateCameraUp: vi.fn(),
    };

    expect(retargetCameraControls({ controls, camera: orthographic })).toBe(true);
    expect(controls.camera).toBe(orthographic);
    expect(controls.mouseButtons.wheel).toBe(CameraControlsImpl.ACTION.ZOOM);
    expect(controls.touches.two).toBe(CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK);
    expect(controls.cancel).toHaveBeenCalledOnce();
    expect(controls.updateCameraUp).toHaveBeenCalledOnce();

    expect(retargetCameraControls({ controls, camera: orthographic })).toBe(false);
    expect(controls.cancel).toHaveBeenCalledOnce();
  });

  it('preserves a disabled wheel policy while retargeting to orthographic', () => {
    const controls: RetargetableCameraControls = {
      camera: new PerspectiveCamera(),
      cancel: vi.fn(),
      mouseButtons: { wheel: CameraControlsImpl.ACTION.NONE },
      touches: { two: CameraControlsImpl.ACTION.NONE },
      updateCameraUp: vi.fn(),
    };

    retargetCameraControls({ controls, camera: new OrthographicCamera() });

    expect(controls.mouseButtons.wheel).toBe(CameraControlsImpl.ACTION.NONE);
    expect(controls.touches.two).toBe(CameraControlsImpl.ACTION.NONE);
  });
});
