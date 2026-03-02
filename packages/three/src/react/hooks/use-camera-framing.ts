import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useCameraReset } from '#react/use-camera-reset.js';
import { useViewerStore } from '#react/stores/store-context.js';
import type { StageOptions } from '#react/stage.js';
import { defaultStageOptions } from '#react/stage.js';

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
export function useCameraFraming(
  geometryRadius: number,
  geometryCenter: THREE.Vector3,
  stageOptions: StageOptions = defaultStageOptions,
): (options?: { enableConfiguredAngles?: boolean }) => void {
  const cameraFovAngle = useViewerStore((state) => state.fieldOfView);

  // Merge caller options with defaults
  const { offsetRatio, nearPlane, minimumFarPlane, farPlaneRadiusMultiplier, zoomLevel, rotation } = useMemo(
    () => ({
      ...defaultStageOptions,
      ...stageOptions,
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
    }),
    [stageOptions],
  );

  // Internal state: the "committed" scene radius that the camera was last
  // framed to. Compared against the live geometryRadius to decide whether a
  // camera reset is needed.
  const [sceneRadius, setSceneRadius] = useState<number | undefined>(undefined);

  const setSceneRadiusCallback = useCallback((radius: number) => {
    setSceneRadius(radius);
  }, []);

  // Ref tracking the original camera distance for zoom-relative positioning
  const originalDistanceReference = useRef<number | undefined>(undefined);

  // Whether the very first camera reset (with configured angles) has fired
  const isInitialResetDoneRef = useRef<boolean>(false);

  // Wire everything into the lower-level camera reset hook
  const resetCamera = useCameraReset({
    geometryRadius,
    geometryCenter,
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
    setSceneRadius: setSceneRadiusCallback,
    originalDistanceReference,
    cameraFovAngle,
  });

  /**
   * Auto-reset the camera when the geometry's bounding sphere changes
   * significantly relative to the last committed scene radius.
   */
  useLayoutEffect(() => {
    const changeRatio = sceneRadius === undefined ? 0 : Math.abs((geometryRadius - sceneRadius) / sceneRadius);
    const isSignificantChange = sceneRadius === undefined ? true : changeRatio > significantRadiusChangeRatio;

    if (isSignificantChange) {
      // Only mark the initial reset as complete once we have real geometry
      // (geometryRadius > 0). Before that, the camera may be replaced by
      // PerspectiveCamera makeDefault, leaving it at (0,0,0). If we marked
      // the flag earlier, subsequent resets would skip configured angles and
      // compute the viewing direction from (0,0,0) toward geometryCenter,
      // which can point the camera below the scene.
      if (isInitialResetDoneRef.current && geometryRadius > 0) {
        resetCamera({ enableConfiguredAngles: false });
      } else {
        resetCamera();
        if (geometryRadius > 0) {
          isInitialResetDoneRef.current = true;
        }
      }
    }
  }, [resetCamera, sceneRadius, geometryRadius]);

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
