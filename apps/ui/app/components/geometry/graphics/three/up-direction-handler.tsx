import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three/addons';
import * as THREE from 'three';
import { useBuild } from '#hooks/use-build.js';

type UpDirectionHandlerProperties = {
  readonly upDirection: 'x' | 'y' | 'z';
};

/**
 * Component that handles dynamic up direction changes for the camera and all scene objects.
 * Must be inside the Canvas component to access the Three.js context.
 */
export function UpDirectionHandler({ upDirection }: UpDirectionHandlerProperties): undefined {
  const { camera, scene, controls, invalidate } = useThree();
  const { cameraRef: cameraCapabilityActor } = useBuild();

  useEffect(() => {
    // Define the new up direction based on the selected axis
    // x: X-up (1, 0, 0) - Alternative coordinate system
    // y: Y-up (0, 1, 0) - Standard Three.js
    // z: Z-up (0, 0, 1) - CAD/engineering default
    const newUp =
      upDirection === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : upDirection === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);

    // Set the global default for new objects
    THREE.Object3D.DEFAULT_UP.copy(newUp);

    // Update the camera's up vector
    camera.up.copy(newUp);

    // Traverse the scene and update each object's up vector
    scene.traverse((object) => {
      if (object instanceof THREE.Object3D) {
        object.up.copy(newUp);
        object.updateMatrixWorld(true);
      }
    });

    // Update the camera's orientation
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // Update controls if they exist (OrbitControls type)
    if (controls && 'target' in controls && 'update' in controls) {
      const orbitControls = controls as OrbitControls;
      orbitControls.target.set(0, 0, 0);
      orbitControls.update();
    }

    // Trigger a camera reset to properly position the camera for the new up direction
    cameraCapabilityActor.send({ type: 'reset' });

    // Force a render
    invalidate();
  }, [upDirection, camera, scene, controls, invalidate, cameraCapabilityActor]);

  return undefined;
}
