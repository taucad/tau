import { describe, expect, it, vi } from 'vitest';
import { shouldUpdateTauCameraControlsFrame } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';

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
