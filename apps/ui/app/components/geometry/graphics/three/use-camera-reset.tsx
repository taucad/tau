import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import { resetCamera as resetCameraFn } from '#components/geometry/graphics/three/utils/camera.utils.js';
import { cameraCapabilityActor } from '#routes/builds_.$id/graphics-actor.js';

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
  const { camera, invalidate } = useThree();
  const isRegistered = useRef(false);

  const { geometryRadius, rotation, perspective, setSceneRadius, originalDistanceReference, cameraFovAngle } =
    parameters;

  const resetCamera = useCallback(
    (options?: { enableConfiguredAngles?: boolean }) => {
      // Reset original distance reference if available
      if (originalDistanceReference?.current !== undefined) {
        originalDistanceReference.current = undefined;
      }

      resetCameraFn({
        camera,
        geometryRadius,
        rotation,
        perspective,
        setSceneRadius,
        invalidate,
        enableConfiguredAngles: options?.enableConfiguredAngles,
        cameraFovAngle,
      });
    },
    [
      originalDistanceReference,
      camera,
      geometryRadius,
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
  }, [resetCamera]);

  // Return the reset function for direct use if needed
  return resetCamera;
}
