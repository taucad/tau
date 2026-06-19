import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCameraCapability } from '#hooks/use-graphics.js';
import { syncCameraControlsUp } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

type UpDirectionHandlerProperties = {
  readonly upDirection: 'x' | 'y' | 'z';
};

/**
 * Component that handles dynamic up direction changes for the camera and all scene objects.
 * Must be inside the Canvas component to access the Three.js context.
 */
export function UpDirectionHandler({ upDirection }: UpDirectionHandlerProperties): undefined {
  const { camera, scene, controls, invalidate } = useThree();
  const cameraCapabilityActor = useCameraCapability();

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

    // Update the camera's up vector and CameraControls' cached up-space before
    // any target/lookAt/reset work re-encodes spherical state.
    syncCameraControlsUp({ camera, controls: controls ?? undefined, up: newUp });

    // Set up vectors on all objects without matrix updates during traverse,
    // then call updateMatrixWorld once on the scene root. This reduces O(N²)
    // work (recursive update inside traverse) to a single O(N) pass.
    scene.traverse((object) => {
      object.up.copy(newUp);
    });
    scene.updateMatrixWorld(true);

    camera.updateProjectionMatrix();

    // Trigger a camera reset to properly position the camera for the new up direction
    cameraCapabilityActor.send({ type: 'reset' });

    // Force a render
    invalidate();
  }, [upDirection, camera, scene, controls, invalidate, cameraCapabilityActor]);

  return undefined;
}
