import { CameraControlsImpl } from '@react-three/drei/core/CameraControls.js';
import { describe, expect, it } from 'vitest';
import { resolveCameraControlMouseButtons } from '#components/geometry/graphics/three/controls.js';

describe('resolveCameraControlMouseButtons', () => {
  it('should preserve right-button camera pan when secondary mouse owns camera pan', () => {
    expect(
      resolveCameraControlMouseButtons({
        enablePan: true,
        enableZoom: true,
        secondaryMouseButtonMode: 'camera-pan',
      }),
    ).toEqual({
      left: CameraControlsImpl.ACTION.ROTATE,
      middle: CameraControlsImpl.ACTION.TRUCK,
      right: CameraControlsImpl.ACTION.TRUCK,
      wheel: CameraControlsImpl.ACTION.DOLLY,
    });
  });

  it('should release right-button context menus while keeping middle-button camera pan', () => {
    expect(
      resolveCameraControlMouseButtons({
        enablePan: true,
        enableZoom: true,
        secondaryMouseButtonMode: 'context-menu',
      }),
    ).toEqual({
      left: CameraControlsImpl.ACTION.ROTATE,
      middle: CameraControlsImpl.ACTION.TRUCK,
      right: CameraControlsImpl.ACTION.NONE,
      wheel: CameraControlsImpl.ACTION.DOLLY,
    });
  });

  it('should release right-button gestures when secondary mouse is disabled', () => {
    expect(
      resolveCameraControlMouseButtons({
        enablePan: true,
        enableZoom: false,
        secondaryMouseButtonMode: 'none',
      }),
    ).toEqual({
      left: CameraControlsImpl.ACTION.ROTATE,
      middle: CameraControlsImpl.ACTION.TRUCK,
      right: CameraControlsImpl.ACTION.NONE,
      wheel: CameraControlsImpl.ACTION.NONE,
    });
  });

  it('should disable pan actions when panning is disabled', () => {
    expect(
      resolveCameraControlMouseButtons({
        enablePan: false,
        enableZoom: false,
        secondaryMouseButtonMode: 'camera-pan',
      }),
    ).toEqual({
      left: CameraControlsImpl.ACTION.ROTATE,
      middle: CameraControlsImpl.ACTION.NONE,
      right: CameraControlsImpl.ACTION.NONE,
      wheel: CameraControlsImpl.ACTION.NONE,
    });
  });
});
