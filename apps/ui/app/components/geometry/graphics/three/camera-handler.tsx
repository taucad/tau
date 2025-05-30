import { useCallback, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useSelector } from '@xstate/react';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';

/**
 * Internal component that handles the camera matrix manipulation in response to changing field of view.
 * This MUST be used inside a Canvas/R3F component tree.
 */
export function CameraHandler(): JSX.Element {
  const camera = useThree((state) => state.camera);
  const { invalidate } = useThree();
  const cameraAngle = useSelector(graphicsActor, (state) => state.context.cameraAngle);

  // Store original camera settings to maintain consistent view
  const cameraState = useRef({
    initialized: false,
    originalFov: 60, // Default FOV if not set
    originalPosition: new THREE.Vector3(),
    originalZoom: 1,
    targetDistance: 10_000,
    target: new THREE.Vector3(0, 0, 0),
  });

  // Separate function for camera updates to avoid code duplication
  const updateCameraProjection = useCallback(
    (camera: THREE.PerspectiveCamera, newAngle: number) => {
      if (!cameraState.current.initialized) return;

      // Apply a FOV change based on angle
      const minFov = 1; // Very narrow FOV at 0 degrees (nearly orthographic)
      const maxFov = 90; // Very wide FOV at 90 degrees (extreme perspective)

      // Store old FOV before changing
      const oldFov = camera.fov;

      // Calculate new FOV with dramatic change
      const newFov = minFov + (maxFov - minFov) * (newAngle / 90);

      // Apply the FOV change to the camera
      camera.fov = newFov;

      // Adjust camera distance to maintain perceived size
      // The formula is: d2 = d1 * (tan(fov1/2) / tan(fov2/2))
      // This keeps objects the same apparent size when FOV changes
      const oldHalfFovRad = THREE.MathUtils.degToRad(oldFov / 2);
      const newHalfFovRad = THREE.MathUtils.degToRad(newFov / 2);

      if (oldHalfFovRad !== 0 && newHalfFovRad !== 0) {
        // Direction from camera to target
        const direction = camera.position.clone().normalize();

        // Calculate the adjustment ratio - inverse of what we had before
        // When FOV decreases, we need to move camera farther away
        const distanceRatio = Math.tan(oldHalfFovRad) / Math.tan(newHalfFovRad);

        // Apply distance adjustment preserving direction
        const currentDistance = camera.position.length();
        const newDistance = currentDistance * distanceRatio;

        camera.position.copy(direction.multiplyScalar(newDistance));
      }

      camera.updateProjectionMatrix();
      invalidate();
    },
    [invalidate],
  );

  // Initialize camera state on first render
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      console.error('CameraHandler requires PerspectiveCamera - found:', camera.type);
      return;
    }

    // Initialize once
    if (!cameraState.current.initialized) {
      cameraState.current.originalFov = camera.fov;
      cameraState.current.originalPosition.copy(camera.position);
      cameraState.current.originalZoom = camera.zoom;
      cameraState.current.targetDistance = camera.position.length();
      cameraState.current.initialized = true;

      // Force immediate update with initial angle
      updateCameraProjection(camera, cameraAngle);
    }
  }, [camera, cameraAngle, updateCameraProjection]);

  // Update camera projection when angle changes
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      console.error('Camera is not PerspectiveCamera:', camera.type);
      return;
    }

    if (!cameraState.current.initialized) {
      console.warn('CameraHandler not yet initialized');
      return;
    }

    updateCameraProjection(camera, cameraAngle);
  }, [camera, cameraAngle, updateCameraProjection]);

  // Use an empty group as R3F requires returning a valid Three.js object
  return <group name="camera-handler" />;
}
