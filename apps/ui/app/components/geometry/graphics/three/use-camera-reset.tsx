import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import { resetCamera as resetCameraFn } from '~/components/geometry/graphics/three/camera-reset.js';
import { cameraCapabilityActor } from '~/routes/builds_.$id/graphics-actor.js';

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
  shapeRadius: number;
  rotation: ResetRotation;
  perspective: ResetPerspective;
  setSceneRadius: (radius: number) => void;
  originalDistanceReference?: RefObject<number | undefined>;
};

/**
 * Hook that provides camera reset functionality and registers it with the graphics context
 */
export function useCameraReset(
  parameters: ResetCameraParameters,
): (options?: { withConfiguredAngles?: boolean }) => void {
  const { camera, invalidate } = useThree();
  const isRegistered = useRef(false);

  const { shapeRadius, rotation, perspective, setSceneRadius, originalDistanceReference } = parameters;

  // Create the reset function that now accepts an optional options object
  const resetCamera = useCallback(
    (options?: { withConfiguredAngles?: boolean }) => {
      // Reset original distance reference if available
      if (originalDistanceReference?.current !== undefined) {
        originalDistanceReference.current = undefined;
      }

      resetCameraFn({
        camera,
        shapeRadius,
        rotation,
        perspective,
        setSceneRadius,
        invalidate,
        withConfiguredAngles: options?.withConfiguredAngles,
      });
    },
    [camera, invalidate, shapeRadius, rotation, perspective, setSceneRadius, originalDistanceReference],
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
