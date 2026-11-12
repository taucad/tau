/**
 * Camera navigation in steps: what one arrow key, plus or minus key, or single-click control does to the view's
 * camera (WCAG 2.5.7, the onboarding blueprint's N1 and N2). Every mouse preset needs a drag, often with a modifier,
 * to orbit, pan or zoom; these steps do the same without one, under every preset.
 *
 * A step moves the `camera-controls` instance at once, without a transition, as the input router does, so the pose
 * reaches the camera through the controls adapter's `update` as the person's input.
 */
import type CameraControlsImpl from 'camera-controls';
import { MathUtils, OrthographicCamera, PerspectiveCamera } from 'three';

/**
 * Which way an orbit or pan step goes.
 *
 * @public
 */
export type CameraNavigationDirection = 'left' | 'right' | 'up' | 'down';

/**
 * One navigation step: an orbit or a pan in a direction, or a zoom in or out.
 *
 * @public
 */
export type CameraNavigationStep =
  | Readonly<{ kind: 'orbit' | 'pan'; direction: CameraNavigationDirection }>
  | Readonly<{ kind: 'zoom'; direction: 'in' | 'out' }>;

/**
 * Every navigation step, orbit first, then pan, then zoom.
 *
 * @public
 */
export const cameraNavigationSteps: readonly CameraNavigationStep[] = [
  { kind: 'orbit', direction: 'left' },
  { kind: 'orbit', direction: 'right' },
  { kind: 'orbit', direction: 'up' },
  { kind: 'orbit', direction: 'down' },
  { kind: 'pan', direction: 'left' },
  { kind: 'pan', direction: 'right' },
  { kind: 'pan', direction: 'up' },
  { kind: 'pan', direction: 'down' },
  { kind: 'zoom', direction: 'in' },
  { kind: 'zoom', direction: 'out' },
];

/**
 * How far one orbit step turns the camera about its target: 15°.
 *
 * @public
 */
export const cameraOrbitStepRadians = Math.PI / 12;

/**
 * How far one pan step moves the view, as a share of its visible height at the target.
 *
 * @public
 */
export const cameraPanStepFraction = 0.1;

/**
 * What one zoom-in step multiplies the camera's distance by (perspective), or divides its zoom by (orthographic).
 *
 * @public
 */
export const cameraZoomStepScale = 0.8;

/**
 * The parts of a `camera-controls` instance a navigation step reads and drives.
 *
 * @public
 */
export type CameraNavigationControls = Pick<
  CameraControlsImpl,
  'camera' | 'enabled' | 'distance' | 'rotate' | 'truck' | 'dollyTo' | 'zoomTo' | 'minDistance' | 'maxDistance'
> &
  Partial<Pick<CameraControlsImpl, 'minZoom' | 'maxZoom'>>;

const directionSigns: Readonly<Record<CameraNavigationDirection, readonly [x: number, y: number]>> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

/** The view's visible height at the target, in the controls' units. */
const visibleHeight = (controls: CameraNavigationControls): number => {
  const { camera } = controls;
  if (camera instanceof OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom;
  }
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 60;
  return (2 * controls.distance * Math.tan(MathUtils.degToRad(fov) / 2)) / camera.zoom;
};

/**
 * Moves the camera by one navigation step: an orbit turns it {@link cameraOrbitStepRadians} about the target, a pan
 * moves the view {@link cameraPanStepFraction} of its visible height, and a zoom scales the distance (perspective) or
 * the zoom (orthographic) by {@link cameraZoomStepScale}, within the controls' limits. Left and up orbit and pan as
 * the canvas prototype's arrow keys do. Invert zoom does not apply: a key names its direction.
 *
 * @param input - The controls, the step, and whether the viewer lets the person pan and zoom (default: yes).
 * @returns Whether the step moved, or tried to move, the camera: false while the controls are disabled or the step's
 *   gesture is off.
 * @public
 */
export const applyCameraNavigationStep = ({
  controls,
  step,
  enablePan = true,
  enableZoom = true,
}: Readonly<{
  controls: CameraNavigationControls;
  step: CameraNavigationStep;
  enablePan?: boolean;
  enableZoom?: boolean;
}>): boolean => {
  if (!controls.enabled) {
    return false;
  }
  switch (step.kind) {
    case 'orbit': {
      const [x, y] = directionSigns[step.direction];
      void controls.rotate(x * cameraOrbitStepRadians, y * cameraOrbitStepRadians, false);
      return true;
    }
    case 'pan': {
      if (!enablePan) {
        return false;
      }
      const [x, y] = directionSigns[step.direction];
      const distance = visibleHeight(controls) * cameraPanStepFraction;
      void controls.truck(x * distance, y * distance, false);
      return true;
    }
    case 'zoom': {
      if (!enableZoom) {
        return false;
      }
      const scale = step.direction === 'in' ? cameraZoomStepScale : 1 / cameraZoomStepScale;
      if (controls.camera instanceof OrthographicCamera) {
        const zoom = controls.camera.zoom / scale;
        void controls.zoomTo(
          MathUtils.clamp(zoom, controls.minZoom ?? 0, controls.maxZoom ?? Number.POSITIVE_INFINITY),
          false,
        );
        return true;
      }
      void controls.dollyTo(
        MathUtils.clamp(controls.distance * scale, controls.minDistance, controls.maxDistance),
        false,
      );
      return true;
    }
  }
};
