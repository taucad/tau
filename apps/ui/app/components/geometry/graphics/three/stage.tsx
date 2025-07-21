import React, { useMemo, useCallback } from 'react';
import type { JSX, ReactNode } from 'react';
import * as THREE from 'three';
import { PerspectiveCamera } from '@react-three/drei';
import { AxesHelper } from '~/components/geometry/graphics/three/axes-helper.js';
import { Grid } from '~/components/geometry/graphics/three/grid.js';
import { useCameraReset } from '~/components/geometry/graphics/three/use-camera-reset.js';

export type StageOptions = {
  /**
   * The ratio of the scene's radius to offset the camera from the center. Adjusting this value will change the applied perspective of the scene.
   */
  offsetRatio?: number;
  /**
   * The near plane of the camera.
   */
  nearPlane?: number;
  /**
   * The minimum far plane of the camera.
   */
  minimumFarPlane?: number;
  /**
   * The multiplier for the camera's far plane.
   */
  farPlaneRadiusMultiplier?: number;
  /**
   * The zoom level of the camera.
   */
  zoomLevel?: number;
  rotation?: {
    /**
     * The initial z-axis rotation of the camera in radians.
     */
    side?: number;

    /**
     * The initial xy-plane rotation of the camera in radians.
     */
    vertical?: number;
  };
};

const significantRadiusChangeRatio = 0.1;

// Default configuration constants
export const defaultStageOptions = {
  offsetRatio: 3,
  nearPlane: 0.1,
  minimumFarPlane: 10_000_000_000,
  farPlaneRadiusMultiplier: 5,
  zoomLevel: 1,
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 6, // Default rotation is 30 degrees upwards
  },
} as const satisfies StageOptions;

type StageProperties = {
  readonly children: ReactNode;
  readonly enableCentering?: boolean;
  readonly stageOptions?: StageOptions;
  readonly enableGrid?: boolean;
  readonly enableAxes?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({
  children,
  enableCentering = false,
  stageOptions = defaultStageOptions,
  ...properties
}: StageProperties): React.JSX.Element {
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  // State for camera reset functionality
  const originalDistanceReference = React.useRef<number | undefined>(undefined);
  const isInitialResetDoneRef = React.useRef<boolean>(false);

  const [{ shapeRadius, sceneRadius }, set] = React.useState<{
    // The radius of the scene. Used to determine if the camera needs to be updated
    sceneRadius: number | undefined;
    // The radius of the shape.
    shapeRadius: number;
  }>({
    sceneRadius: undefined,
    shapeRadius: 0,
  });

  const { offsetRatio, nearPlane, minimumFarPlane, farPlaneRadiusMultiplier, zoomLevel, rotation } = useMemo(() => {
    return {
      ...defaultStageOptions,
      ...stageOptions,
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
    };
  }, [stageOptions]);

  // Function to set scene radius
  const setSceneRadius = useCallback((radius: number) => {
    set((previous) => ({
      ...previous,
      sceneRadius: radius,
    }));
  }, []);

  // Use the camera reset hook
  const resetCamera = useCameraReset({
    shapeRadius,
    // Explicitly provide the required properties
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
    setSceneRadius,
    originalDistanceReference,
  });

  /**
   * Position the scene.
   */
  React.useLayoutEffect(() => {
    if (outer.current) {
      outer.current.updateWorldMatrix(true, true);
    }

    if (!inner.current) {
      return;
    }

    const box3 = new THREE.Box3().setFromObject(inner.current);

    if (enableCentering) {
      const centerPoint = new THREE.Vector3();
      box3.getCenter(centerPoint);
      if (outer.current) {
        outer.current.position.set(
          outer.current.position.x - centerPoint.x,
          outer.current.position.y - centerPoint.y,
          outer.current.position.z - centerPoint.z,
        );
      }
    }

    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);

    set((previous) => {
      return { shapeRadius: sphere.radius, sceneRadius: previous.sceneRadius };
    });
  }, [enableCentering, children]);

  /**
   * Position the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    // Force update when camera type changes
    const changeRatio = sceneRadius === undefined ? 0 : Math.abs((shapeRadius - sceneRadius) / sceneRadius);
    const isSignificantChange = sceneRadius === undefined ? true : changeRatio > significantRadiusChangeRatio;

    if (isSignificantChange) {
      if (isInitialResetDoneRef.current) {
        resetCamera({ enableConfiguredAngles: false }); // Subsequent resets without XY rotation
      } else {
        resetCamera(); // Initial reset with rotation
        isInitialResetDoneRef.current = true;
      }
    }
  }, [resetCamera, sceneRadius, shapeRadius]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        {properties.enableAxes ? <AxesHelper /> : null}
        {properties.enableGrid ? <Grid /> : null}
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}
