import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import { resetCamera as resetCameraFn } from '~/components/geometry/graphics/three/camera-reset.js';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';

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
  setCurrentZoom: (zoom: number) => void;
  setSceneRadius: (radius: number) => void;
  originalDistanceReference?: RefObject<number | undefined>;
};

/**
 * Hook that provides camera reset functionality and registers it with the graphics context
 */
export function useCameraReset(parameters: ResetCameraParameters): () => void {
  const { camera, invalidate } = useThree();
  const { camera: graphicsCamera } = useGraphics();
  const isRegistered = useRef(false);

  const { shapeRadius, rotation, perspective, setCurrentZoom, setSceneRadius, originalDistanceReference } = parameters;

  // Create the reset function
  const resetCamera = useCallback(() => {
    // Reset original distance reference if available
    if (originalDistanceReference?.current !== undefined) {
      originalDistanceReference.current = undefined;
    }

    resetCameraFn({
      camera,
      shapeRadius,
      rotation,
      perspective,
      setCurrentZoom,
      setSceneRadius,
      invalidate,
    });
  }, [
    camera,
    invalidate,
    shapeRadius,
    rotation,
    perspective,
    setCurrentZoom,
    setSceneRadius,
    originalDistanceReference,
  ]);

  // Register the reset function with the graphics context only once
  useEffect(() => {
    if (!isRegistered.current) {
      graphicsCamera.registerReset(resetCamera);
      isRegistered.current = true;
    }
  }, [graphicsCamera, resetCamera]);

  // Return the reset function for direct use if needed
  return resetCamera;
}
