/**
 * The viewer's camera feel for `camera-controls`: speeds and the mouse-button map. Every canvas with a camera the
 * person drives uses it, so they all move alike.
 *
 * @module
 */
import CameraControlsImpl from 'camera-controls';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';

/**
 * The `camera-controls` settings the feel sets.
 *
 * @public
 */
export type CameraControlsFeel = Pick<
  CameraControlsImpl,
  'dollySpeed' | 'truckSpeed' | 'smoothTime' | 'draggingSmoothTime' | 'mouseButtons'
>;

/**
 * Maps the mouse buttons and wheel to camera actions for the given pan, zoom and projection settings.
 *
 * @param options - Whether pan and zoom are enabled, the secondary button mode and the projection kind.
 * @returns The `mouseButtons` setting for a `camera-controls` instance.
 * @public
 */
export function resolveCameraControlMouseButtons({
  enablePan,
  enableZoom,
  secondaryMouseButtonMode,
  projectionKind = 'perspective',
}: {
  readonly enablePan: boolean;
  readonly enableZoom: boolean;
  readonly secondaryMouseButtonMode: SecondaryMouseButtonMode;
  readonly projectionKind?: 'orthographic' | 'perspective';
}): CameraControlsFeel['mouseButtons'] {
  return {
    left: CameraControlsImpl.ACTION.ROTATE,
    middle: enablePan ? CameraControlsImpl.ACTION.TRUCK : CameraControlsImpl.ACTION.NONE,
    right:
      enablePan && secondaryMouseButtonMode === 'camera-pan'
        ? CameraControlsImpl.ACTION.TRUCK
        : CameraControlsImpl.ACTION.NONE,
    wheel: enableZoom
      ? projectionKind === 'orthographic'
        ? CameraControlsImpl.ACTION.ZOOM
        : CameraControlsImpl.ACTION.DOLLY
      : CameraControlsImpl.ACTION.NONE,
  };
}

/**
 * The viewer's camera feel: undamped rotate, truck and dolly at the viewer's speeds.
 *
 * @param options - Whether pan and zoom are enabled, the secondary button mode, the projection kind and the zoom speed.
 * @returns The settings to apply to a `camera-controls` instance.
 * @public
 */
export function resolveCameraControlProps({
  enablePan,
  enableZoom,
  secondaryMouseButtonMode = 'camera-pan',
  projectionKind = 'perspective',
  zoomSpeed = 2,
}: {
  readonly enablePan: boolean;
  readonly enableZoom: boolean;
  readonly secondaryMouseButtonMode?: SecondaryMouseButtonMode;
  readonly projectionKind?: 'orthographic' | 'perspective';
  readonly zoomSpeed?: number;
}): CameraControlsFeel {
  return {
    dollySpeed: zoomSpeed * 0.5,
    truckSpeed: enablePan ? 2 : 0,
    smoothTime: 0,
    draggingSmoothTime: 0,
    mouseButtons: resolveCameraControlMouseButtons({ enablePan, enableZoom, secondaryMouseButtonMode, projectionKind }),
  };
}
