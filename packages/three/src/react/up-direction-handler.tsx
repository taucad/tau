import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three/addons';
import * as THREE from 'three';

type UpDirectionHandlerProperties = {
  readonly upDirection: 'x' | 'y' | 'z';
  readonly onResetCamera?: () => void;
};

/**
 * Component that handles dynamic up direction changes for the camera and all scene objects.
 * Must be inside the Canvas component to access the Three.js context.
 */
export function UpDirectionHandler({ upDirection, onResetCamera }: UpDirectionHandlerProperties): undefined {
  const { camera, scene, controls, invalidate } = useThree();

  useEffect(() => {
    const newUp =
      upDirection === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : upDirection === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);

    THREE.Object3D.DEFAULT_UP.copy(newUp);

    camera.up.copy(newUp);

    scene.traverse((object) => {
      object.up.copy(newUp);
    });
    scene.updateMatrixWorld(true);

    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (controls && 'target' in controls && 'update' in controls) {
      const orbitControls = controls as OrbitControls;
      orbitControls.target.set(0, 0, 0);
      orbitControls.update();
    }

    onResetCamera?.();

    invalidate();
  }, [upDirection, camera, scene, controls, invalidate, onResetCamera]);

  return undefined;
}
