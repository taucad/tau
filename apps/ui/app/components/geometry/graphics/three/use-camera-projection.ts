import { useEffect } from 'react';
import * as THREE from 'three';

/**
 * Custom hook to handle camera projection based on angle changes
 * Updates camera FOV and position to maintain perceived object size
 */
export function useCameraProjection(camera: THREE.Camera, cameraAngle: number, invalidate: () => void): void {
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      return;
    }

    // Apply FOV change based on angle
    const minFov = 1;
    const maxFov = 120;
    const oldFov = camera.fov;
    const newFov = minFov + (maxFov - minFov) * (cameraAngle / 90);

    // Only update if there's a meaningful change
    if (Math.abs(camera.fov - newFov) < 0.1) {
      return;
    }

    camera.fov = newFov;

    // Adjust camera distance to maintain perceived size
    const oldHalfFovRad = THREE.MathUtils.degToRad(oldFov / 2);
    const newHalfFovRad = THREE.MathUtils.degToRad(newFov / 2);

    if (oldHalfFovRad !== 0 && newHalfFovRad !== 0) {
      const direction = camera.position.clone().normalize();
      const distanceRatio = Math.tan(oldHalfFovRad) / Math.tan(newHalfFovRad);
      const currentDistance = camera.position.length();
      const newDistance = currentDistance * distanceRatio;

      camera.position.copy(direction.multiplyScalar(newDistance));
    }

    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, cameraAngle, invalidate]);
}
