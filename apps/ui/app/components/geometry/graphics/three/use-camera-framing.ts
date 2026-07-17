import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useCameraReset } from '#components/geometry/graphics/three/use-camera-reset.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import type { StageOptions } from '#components/geometry/graphics/three/stage.js';
import { defaultStageOptions } from '#components/geometry/graphics/three/stage.js';

const significantRadiusChangeRatio = 0.1;
const significantAspectChangeRatio = 0.1;

/**
 * Camera framing policy hook.
 *
 * Resolves `StageOptions` into concrete camera parameters, wires them into
 * `useCameraReset`, and runs the auto-reset `useLayoutEffect` that decides
 * whether an initial (with configured angles) or subsequent (preserving the
 * current viewing direction) camera reset is needed when the geometry bounds
 * change significantly.
 *
 * Returns `resetCamera` for manual (e.g. toolbar button) resets.
 */
export function useCameraFraming({
  geometryRadius,
  geometryCenter,
  geometryBounds,
  stageOptions = defaultStageOptions,
}: {
  geometryRadius: number;
  geometryCenter: THREE.Vector3;
  geometryBounds: THREE.Box3;
  stageOptions?: StageOptions;
}): (options?: { enableConfiguredAngles?: boolean }) => void {
  const cameraFovAngle = useGraphicsSelector((state) => state.context.cameraFovAngle);

  // Merge caller options with defaults
  const { offsetRatio, nearPlane, minimumFarPlane, farPlaneRadiusMultiplier, zoomLevel, fitMargin, rotation } = useMemo(
    () => ({
      ...defaultStageOptions,
      ...stageOptions,
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
    }),
    [stageOptions],
  );

  const sceneRadiusRef = useRef<number | undefined>(undefined);
  const sceneBoundsRef = useRef<THREE.Box3 | undefined>(undefined);

  const setSceneRadiusCallback = useCallback(
    (radius: number) => {
      sceneRadiusRef.current = radius;
      sceneBoundsRef.current = geometryBounds.clone();
    },
    [geometryBounds],
  );

  // Ref tracking the original camera distance for zoom-relative positioning
  const originalDistanceReference = useRef<number | undefined>(undefined);

  // Whether the very first camera reset (with configured angles) has fired
  const isInitialResetDoneRef = useRef<boolean>(false);

  // Wire everything into the lower-level camera reset hook
  const resetCamera = useCameraReset({
    geometryRadius,
    geometryCenter,
    geometryBounds,
    rotation: {
      side: rotation.side,
      vertical: rotation.vertical,
    },
    perspective: {
      offsetRatio,
      zoomLevel,
      nearPlane,
      minimumFarPlane,
      farPlaneRadiusMultiplier,
    },
    fitMargin,
    setSceneRadius: setSceneRadiusCallback,
    originalDistanceReference,
    cameraFovAngle,
  });

  /**
   * Auto-reset the camera when the geometry's bounding sphere changes
   * significantly relative to the last committed scene radius.
   */
  useLayoutEffect(() => {
    const sceneRadius = sceneRadiusRef.current;
    const changeRatio =
      sceneRadius === undefined || sceneRadius === 0
        ? Infinity
        : Math.abs((geometryRadius - sceneRadius) / sceneRadius);
    const previousBounds = sceneBoundsRef.current;
    const boundsScale = Math.max(sceneRadius ?? 0, geometryRadius, 1e-9);
    const boundsChange = previousBounds
      ? Math.max(
          Math.abs(previousBounds.min.x - geometryBounds.min.x),
          Math.abs(previousBounds.min.y - geometryBounds.min.y),
          Math.abs(previousBounds.min.z - geometryBounds.min.z),
          Math.abs(previousBounds.max.x - geometryBounds.max.x),
          Math.abs(previousBounds.max.y - geometryBounds.max.y),
          Math.abs(previousBounds.max.z - geometryBounds.max.z),
        ) / boundsScale
      : Infinity;
    const hasGeometry = geometryRadius > 0 && !geometryBounds.isEmpty();
    const isSignificantChange =
      sceneRadius === undefined ||
      (hasGeometry && (changeRatio > significantRadiusChangeRatio || boundsChange > significantRadiusChangeRatio));

    if (isSignificantChange) {
      // Only real geometry completes the initial reset. Empty bootstrap bounds
      // must not prevent the first model from using the configured angles.
      if (isInitialResetDoneRef.current && geometryRadius > 0) {
        resetCamera({ enableConfiguredAngles: false });
      } else {
        resetCamera();
        if (geometryRadius > 0) {
          isInitialResetDoneRef.current = true;
        }
      }
    }
  }, [resetCamera, geometryRadius, geometryBounds]);

  // Track viewport aspect ratio and re-frame when it changes significantly.
  // This ensures the model remains fully visible when Dockview panels are
  // resized (e.g. split into narrow portrait viewports).
  const { size } = useThree();
  const viewportAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1;
  const lastAspectRef = useRef<number>(viewportAspect);

  useLayoutEffect(() => {
    // Skip if the initial geometry reset hasn't happened yet
    if (!isInitialResetDoneRef.current || geometryRadius <= 0) {
      lastAspectRef.current = viewportAspect;
      return;
    }

    const lastAspect = lastAspectRef.current;
    const aspectChange = Math.abs(viewportAspect - lastAspect) / Math.max(lastAspect, 1e-9);

    if (aspectChange > significantAspectChangeRatio) {
      lastAspectRef.current = viewportAspect;
      resetCamera({ enableConfiguredAngles: false });
    }
  }, [viewportAspect, resetCamera, geometryRadius]);

  return resetCamera;
}
