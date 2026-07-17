import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { RefObject } from 'react';
import type * as THREE from 'three';
import { resetCamera as resetCameraFunction } from '#components/geometry/graphics/three/utils/camera.utils.js';
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
  geometryBounds: THREE.Box3;
  rotation: ResetRotation;
  perspective: ResetPerspective;
  fitMargin: number;
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
  const { camera, get, invalidate, size } = useThree();
  const viewportAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const cameraCapabilityActor = useCameraCapability();
  const resetCameraRef = useRef<(options?: { enableConfiguredAngles?: boolean }) => void>(() => undefined);

  // Store viewportAspect in a ref so the resetCamera callback remains stable
  // during resize. The aspect is read lazily when reset is actually called,
  // preventing callback recreation on every resize pixel.
  const viewportAspectRef = useRef(viewportAspect);
  viewportAspectRef.current = viewportAspect;

  const {
    geometryRadius,
    geometryCenter,
    geometryBounds,
    rotation,
    perspective,
    fitMargin,
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

      resetCameraFunction({
        camera,
        geometryRadius,
        geometryCenter,
        geometryBounds,
        rotation,
        perspective,
        fitMargin,
        setSceneRadius,
        invalidate,
        enableConfiguredAngles: options?.enableConfiguredAngles,
        cameraFovAngle,
        controls: get().controls ?? undefined,
        viewportAspect: viewportAspectRef.current,
      });
    },
    [
      originalDistanceReference,
      camera,
      get,
      geometryRadius,
      geometryCenter,
      geometryBounds,
      rotation,
      perspective,
      fitMargin,
      setSceneRadius,
      invalidate,
      cameraFovAngle,
    ],
  );

  resetCameraRef.current = resetCamera;

  // Register a stable wrapper so the camera capability always reaches the latest
  // camera/controls captures without retaining stale R3F instances after remounts.
  useEffect(() => {
    cameraCapabilityActor.send({
      type: 'registerReset',
      reset: (options?: { enableConfiguredAngles?: boolean }) => {
        resetCameraRef.current(options);
      },
    });
  }, [cameraCapabilityActor]);

  // Return the reset function for direct use if needed
  return resetCamera;
}
