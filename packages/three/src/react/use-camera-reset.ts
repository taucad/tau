import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import type * as THREE from 'three';
import { resetCamera as resetCameraFn } from '#utils/camera.utils.js';

type ResetRotation = {
  side: number;
  vertical: number;
};

type ResetPerspective = {
  offsetRatio: number;
  zoomLevel: number;
  nearPlane: number;
  minimumFarPlane: number;
  farPlaneRadiusMultiplier: number;
};

type ResetCameraParameters = {
  geometryRadius: number;
  geometryCenter: THREE.Vector3;
  rotation: ResetRotation;
  perspective: ResetPerspective;
  setSceneRadius: (radius: number) => void;
  originalDistanceReference?: RefObject<number | undefined>;
  cameraFovAngle: number;
  onResetCamera?: (reset: () => void) => void;
};

/**
 * Hook that provides camera reset functionality.
 *
 * Consumers can pass an optional `onResetCamera` callback to register the
 * reset function externally (e.g. with a capability actor in the host app).
 */
export function useCameraReset(parameters: ResetCameraParameters): (options?: {
  enableConfiguredAngles?: boolean;
}) => void {
  const { camera, controls, invalidate, size } = useThree();
  const viewportAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;

  const viewportAspectRef = useRef(viewportAspect);
  viewportAspectRef.current = viewportAspect;

  const {
    geometryRadius,
    geometryCenter,
    rotation,
    perspective,
    setSceneRadius,
    originalDistanceReference,
    cameraFovAngle,
    onResetCamera,
  } = parameters;

  const resetCamera = useCallback(
    (options?: { enableConfiguredAngles?: boolean }) => {
      if (originalDistanceReference?.current !== undefined) {
        originalDistanceReference.current = undefined;
      }

      resetCameraFn({
        camera,
        geometryRadius,
        geometryCenter,
        rotation,
        perspective,
        setSceneRadius,
        invalidate,
        enableConfiguredAngles: options?.enableConfiguredAngles,
        cameraFovAngle,
        controls: (controls ?? undefined) as { target: THREE.Vector3; update: () => void } | undefined,
        viewportAspect: viewportAspectRef.current,
      });
    },
    [
      originalDistanceReference,
      camera,
      controls,
      geometryRadius,
      geometryCenter,
      rotation,
      perspective,
      setSceneRadius,
      invalidate,
      cameraFovAngle,
    ],
  );

  useEffect(() => {
    onResetCamera?.(resetCamera);
  }, [resetCamera, onResetCamera]);

  return resetCamera;
}
