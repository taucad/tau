import {
  Box3,
  MathUtils,
  Matrix4,
  OrthographicCamera,
  Quaternion,
  Raycaster,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { EventDispatcher, PerspectiveCamera } from 'three';
import { forwardRef, useEffect, useLayoutEffect, useState } from 'react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import type { EventManager, ThreeElement } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { useViewportGizmoInteractionLock } from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';
import type { ViewportGizmoInteractionLock } from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';
import type { SecondaryMouseButtonMode } from '#graphics/three/three-viewer-properties.js';

/**
 * Props for {@link TauCameraControls}: the `camera-controls` element props plus the camera, DOM target, initial target and event callbacks.
 *
 * @public
 */
export type TauCameraControlsProps = Omit<
  ThreeElement<typeof CameraControlsImpl>,
  'ref' | 'args' | keyof EventDispatcher
> & {
  readonly camera?: PerspectiveCamera | OrthographicCamera;
  readonly domElement?: HTMLElement;
  readonly initialTarget?: readonly [number, number, number];
  readonly makeDefault?: boolean;
  readonly onControlStart?: (event?: { type: 'controlstart' }) => void;
  readonly onControl?: (event?: { type: 'control' }) => void;
  readonly onControlEnd?: (event?: { type: 'controlend' }) => void;
  readonly onTransitionStart?: (event?: { type: 'transitionstart' }) => void;
  readonly onUpdate?: (event?: { type: 'update' }) => void;
  readonly onWake?: (event?: { type: 'wake' }) => void;
  readonly onRest?: (event?: { type: 'rest' }) => void;
  readonly onSleep?: (event?: { type: 'sleep' }) => void;
  readonly onStart?: (event?: { type: 'controlstart' }) => void;
  readonly onEnd?: (event?: { type: 'controlend' }) => void;
  readonly onChange?: (event?: { type: string }) => void;
  readonly regress?: boolean;
};

type TauCameraControlsFrameState = {
  readonly controls: Pick<CameraControlsImpl, 'enabled' | 'update'>;
  readonly interactionLock: Pick<ViewportGizmoInteractionLock, 'activeRef'>;
};

/**
 * The parts of a `camera-controls` instance that {@link retargetCameraControls} reads and writes.
 *
 * @public
 */
export type RetargetableCameraControls = Pick<CameraControlsImpl, 'cancel' | 'updateCameraUp'> & {
  camera: PerspectiveCamera | OrthographicCamera;
  mouseButtons: { wheel: CameraControlsImpl['mouseButtons']['wheel'] };
  touches: { two: CameraControlsImpl['touches']['two'] };
};

/**
 * Points the controls at a new camera, swapping wheel and pinch between dolly and zoom to suit its projection.
 *
 * @param options - The controls and the camera they should drive.
 * @returns Whether the camera changed.
 * @public
 */
export const retargetCameraControls = ({
  controls,
  camera,
}: {
  readonly controls: RetargetableCameraControls;
  readonly camera: PerspectiveCamera | OrthographicCamera;
}): boolean => {
  if (controls.camera === camera) {
    return false;
  }

  controls.cancel();
  controls.camera = camera;
  if (camera instanceof OrthographicCamera) {
    if (controls.mouseButtons.wheel === CameraControlsImpl.ACTION.DOLLY) {
      controls.mouseButtons.wheel = CameraControlsImpl.ACTION.ZOOM;
    }
    if (controls.touches.two === CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK) {
      controls.touches.two = CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK;
    }
  } else {
    if (controls.mouseButtons.wheel === CameraControlsImpl.ACTION.ZOOM) {
      controls.mouseButtons.wheel = CameraControlsImpl.ACTION.DOLLY;
    }
    if (controls.touches.two === CameraControlsImpl.ACTION.TOUCH_ZOOM_TRUCK) {
      controls.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY_TRUCK;
    }
  }
  controls.updateCameraUp();
  return true;
};

/**
 * Decides whether the controls should update this frame: only while enabled and no viewport gizmo interaction holds the lock.
 *
 * @param state - The controls and the gizmo interaction lock.
 * @returns Whether to call `update` on the controls.
 * @public
 */
export const shouldUpdateTauCameraControlsFrame = ({
  controls,
  interactionLock,
}: TauCameraControlsFrameState): boolean => {
  return controls.enabled && !interactionLock.activeRef.current;
};

const installCameraControlsImpl = (): void => {
  CameraControlsImpl.install({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `camera-controls` requires this exact install shape.
    THREE: {
      Box3,
      MathUtils: {
        clamp: MathUtils.clamp,
      },
      Matrix4,
      Quaternion,
      Raycaster,
      Sphere,
      Spherical,
      Vector2,
      Vector3,
      Vector4,
    },
  });
  extend({ CameraControlsImpl });
};

/**
 * React Three Fiber component that owns a `camera-controls` instance, updates it each frame and forwards its events.
 *
 * @public
 */
export const TauCameraControls: ForwardRefExoticComponent<TauCameraControlsProps & RefAttributes<CameraControlsImpl>> =
  forwardRef<CameraControlsImpl, TauCameraControlsProps>(function TauCameraControls(props, ref) {
    const {
      camera,
      domElement,
      initialTarget,
      makeDefault,
      onControlStart,
      onControl,
      onControlEnd,
      onTransitionStart,
      onUpdate,
      onWake,
      onRest,
      onSleep,
      onStart,
      onEnd,
      onChange,
      regress,
      ...restProperties
    } = props;

    useState(() => {
      installCameraControlsImpl();
    });

    const defaultCamera = useThree((state) => state.camera);
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const events = useThree((state) => state.events) as EventManager<HTMLElement>;
    const set = useThree((state) => state.set);
    const get = useThree((state) => state.get);
    const performance = useThree((state) => state.performance);
    const interactionLock = useViewportGizmoInteractionLock();

    const resolvedCamera = camera ?? defaultCamera;
    const resolvedDomElement = domElement ?? events.connected ?? gl.domElement;
    const [controls] = useState(() => {
      const instance = new CameraControlsImpl(resolvedCamera);
      if (initialTarget) {
        void instance.setLookAt(
          resolvedCamera.position.x,
          resolvedCamera.position.y,
          resolvedCamera.position.z,
          initialTarget[0],
          initialTarget[1],
          initialTarget[2],
          false,
        );
        instance.update(0);
      }
      return instance;
    });

    useLayoutEffect(() => {
      retargetCameraControls({ controls, camera: resolvedCamera });
    }, [controls, resolvedCamera]);

    useFrame((_state, delta) => {
      if (!shouldUpdateTauCameraControlsFrame({ controls, interactionLock })) {
        return;
      }

      controls.update(delta);
    }, -1);

    useEffect(() => {
      controls.connect(resolvedDomElement);
      return () => {
        controls.disconnect();
      };
    }, [controls, resolvedDomElement]);

    useEffect(() => {
      const invalidateAndRegress = (): void => {
        invalidate();
        if (regress) {
          performance.regress();
        }
      };

      const handleControlStart = (event: { type: 'controlstart' }): void => {
        invalidateAndRegress();
        onControlStart?.(event);
        onStart?.(event);
      };
      const handleControl = (event: { type: 'control' }): void => {
        invalidateAndRegress();
        onControl?.(event);
        onChange?.(event);
      };
      const handleControlEnd = (event: { type: 'controlend' }): void => {
        onControlEnd?.(event);
        onEnd?.(event);
      };
      const handleTransitionStart = (event: { type: 'transitionstart' }): void => {
        invalidateAndRegress();
        onTransitionStart?.(event);
        onChange?.(event);
      };
      const handleUpdate = (event: { type: 'update' }): void => {
        invalidateAndRegress();
        onUpdate?.(event);
        onChange?.(event);
      };
      const handleWake = (event: { type: 'wake' }): void => {
        invalidateAndRegress();
        onWake?.(event);
        onChange?.(event);
      };
      const handleRest = (event: { type: 'rest' }): void => {
        onRest?.(event);
      };
      const handleSleep = (event: { type: 'sleep' }): void => {
        onSleep?.(event);
      };

      controls.addEventListener('controlstart', handleControlStart);
      controls.addEventListener('control', handleControl);
      controls.addEventListener('controlend', handleControlEnd);
      controls.addEventListener('transitionstart', handleTransitionStart);
      controls.addEventListener('update', handleUpdate);
      controls.addEventListener('wake', handleWake);
      controls.addEventListener('rest', handleRest);
      controls.addEventListener('sleep', handleSleep);

      return () => {
        controls.removeEventListener('controlstart', handleControlStart);
        controls.removeEventListener('control', handleControl);
        controls.removeEventListener('controlend', handleControlEnd);
        controls.removeEventListener('transitionstart', handleTransitionStart);
        controls.removeEventListener('update', handleUpdate);
        controls.removeEventListener('wake', handleWake);
        controls.removeEventListener('rest', handleRest);
        controls.removeEventListener('sleep', handleSleep);
      };
    }, [
      controls,
      invalidate,
      onChange,
      onControl,
      onControlEnd,
      onControlStart,
      onEnd,
      onRest,
      onSleep,
      onStart,
      onTransitionStart,
      onUpdate,
      onWake,
      performance,
      regress,
    ]);

    useLayoutEffect(() => {
      if (!makeDefault) {
        return undefined;
      }

      const previousControls = get().controls;
      set({ controls: controls as unknown as EventDispatcher });

      return () => {
        set({ controls: previousControls });
      };
    }, [controls, get, makeDefault, set]);

    return <primitive ref={ref} object={controls} {...restProperties} />;
  });

TauCameraControls.displayName = 'TauCameraControls';

/**
 * The viewer's camera feel: undamped rotate, truck and dolly at the viewer's speeds. Every canvas
 * with a camera the person drives uses it, so they all move alike.
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
}): Pick<
  React.ComponentProps<typeof TauCameraControls>,
  'dollySpeed' | 'truckSpeed' | 'smoothTime' | 'draggingSmoothTime' | 'mouseButtons'
> {
  return {
    dollySpeed: zoomSpeed * 0.5,
    truckSpeed: enablePan ? 2 : 0,
    smoothTime: 0,
    draggingSmoothTime: 0,
    mouseButtons: resolveCameraControlMouseButtons({ enablePan, enableZoom, secondaryMouseButtonMode, projectionKind }),
  };
}

/**
 * Maps the mouse buttons and wheel to camera actions for the given pan, zoom and projection settings.
 *
 * @param options - Whether pan and zoom are enabled, the secondary button mode and the projection kind.
 * @returns The `mouseButtons` setting for {@link TauCameraControls}.
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
}): React.ComponentProps<typeof TauCameraControls>['mouseButtons'] {
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
