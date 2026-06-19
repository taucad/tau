import { Box3, MathUtils, Matrix4, Quaternion, Raycaster, Sphere, Spherical, Vector2, Vector3, Vector4 } from 'three';
import type { EventDispatcher, OrthographicCamera, PerspectiveCamera } from 'three';
import { forwardRef, useEffect, useMemo } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import type { EventManager, ThreeElement } from '@react-three/fiber';
import { CameraControlsImpl } from '@react-three/drei/core/CameraControls.js';
import { useViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';
import type { ViewportGizmoInteractionLock } from '#components/geometry/graphics/three/controls/viewport-gizmo-interaction-lock.js';

export type TauCameraControlsProps = Omit<
  ThreeElement<typeof CameraControlsImpl>,
  'ref' | 'args' | keyof EventDispatcher
> & {
  readonly camera?: PerspectiveCamera | OrthographicCamera;
  readonly domElement?: HTMLElement;
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

export const TauCameraControls = forwardRef<CameraControlsImpl, TauCameraControlsProps>(
  function TauCameraControls(props, ref) {
    const {
      camera,
      domElement,
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

    useMemo(() => {
      installCameraControlsImpl();
    }, []);

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
    const controls = useMemo(() => new CameraControlsImpl(resolvedCamera), [resolvedCamera]);

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

    useEffect(() => {
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
  },
);

TauCameraControls.displayName = 'TauCameraControls';
