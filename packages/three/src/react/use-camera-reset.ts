import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import type * as THREE from 'three';
import { resetCamera as resetCameraFn } from '#utils/camera.utils.js';
import { useCameraCapability } from '#hooks/use-graphics.js';

// Define the specific types needed for camera reset
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
};

/**
 * Hook that provides camera reset functionality and registers it with the graphics context
 *
 * @param parameters - The parameters for the camera reset.
 * @returns The reset function.
 */
export function useCameraReset(parameters: ResetCameraParameters): (options?: {
  /**
   * Whether to enable configured angles.
   * @default true
   */
  enableConfiguredAngles?: boolean;
}) => void {
  const { camera, controls, invalidate, size } = useThree();
  const viewportAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const cameraCapabilityActor = useCameraCapability();
  const isRegistered = useRef(false);

  // Store viewportAspect in a ref so the resetCamera callback remains stable
  // during resize. The aspect is read lazily when reset is actually called,
  // preventing callback recreation on every resize pixel.
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
  } = parameters;

  const resetCamera = useCallback(
    (options?: { enableConfiguredAngles?: boolean }) => {
      // Reset original distance reference if available
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

  // Register the reset function with the camera capability actor only once
  useEffect(() => {
    if (!isRegistered.current) {
      cameraCapabilityActor.send({ type: 'registerReset', reset: resetCamera });
      isRegistered.current = true;
    }
  }, [resetCamera, cameraCapabilityActor]);

  // Return the reset function for direct use if needed
  return resetCamera;
}
