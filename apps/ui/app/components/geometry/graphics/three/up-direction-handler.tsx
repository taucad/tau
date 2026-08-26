import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCameraRig } from '#hooks/use-graphics.js';
import {
  resolveCameraUp,
  syncCameraControlsUp,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

type UpDirectionHandlerProperties = {
  readonly upDirection: 'x' | 'y' | 'z';
};

/**
 * Component that handles dynamic up direction changes for the camera and all scene objects.
 * Must be inside the Canvas component to access the Three.js context.
 */
export function UpDirectionHandler({ upDirection }: UpDirectionHandlerProperties): undefined {
  const get = useThree((state) => state.get);
  const cameraRig = useCameraRig();
  const previousUpDirectionRef = useRef<typeof upDirection | undefined>(undefined);

  useEffect(() => {
    const { camera, scene, controls, invalidate } = get();
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

    const {
      context: { view },
    } = cameraRig.actorRef.getSnapshot();
    const isInitialSetup = previousUpDirectionRef.current === undefined;
    previousUpDirectionRef.current = upDirection;
    const cameraUp = isInitialSetup
      ? new THREE.Vector3(...view.up)
      : resolveCameraUp({
          direction: new THREE.Vector3(...view.direction),
          preferredUp: newUp,
          fallbackUp: new THREE.Vector3(...view.up),
        });

    // Update the camera's up vector and CameraControls' cached up-space before
    // any target/lookAt/reset work re-encodes spherical state.
    syncCameraControlsUp({ camera, controls: controls ?? undefined, up: cameraUp });

    // Set up vectors on all objects without matrix updates during traverse,
    // then call updateMatrixWorld once on the scene root. This reduces O(N²)
    // work (recursive update inside traverse) to a single O(N) pass.
    scene.traverse((object) => {
      object.up.copy(newUp);
    });
    scene.updateMatrixWorld(true);

    camera.updateProjectionMatrix();

    if (!isInitialSetup) {
      cameraRig.actorRef.send({
        type: 'setView',
        target: view.target,
        direction: view.direction,
        up: [cameraUp.x, cameraUp.y, cameraUp.z],
        verticalSpan: view.verticalSpan,
      });
    }

    // Force a render
    invalidate();
  }, [upDirection, get, cameraRig]);

  return undefined;
}
