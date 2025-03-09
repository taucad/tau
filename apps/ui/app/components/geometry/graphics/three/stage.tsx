import * as React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { PerspectiveCamera } from '@react-three/drei';

export type StageOptions = {
  perspective?: {
    /**
     * The ratio of the camera's side offset to the scene's radius.
     */
    sideOffsetRatio?: number;
    /**
     * The ratio of the camera's vertical offset to the scene's radius.
     */
    verticalOffsetRatio?: number;
    /**
     * The multiplier for the camera's height.
     */
    heightMultiplier?: number;
    /**
     * The near plane of the camera.
     */
    nearPlane?: number;
    /**
     * The minimum far plane of the camera.
     */
    minFarPlane?: number;
    /**
     * The multiplier for the camera's far plane.
     */
    farPlaneRadiusMultiplier?: number;
    /**
     * The zoom level of the camera.
     */
    zoomLevel?: number;
  };
  orthographic?: {
    /**
     * The ratio of the camera's position to the scene's radius.
     */
    positionRatio?: number;
    /**
     * The ratio of the camera's vertical offset to the scene's radius.
     */
    verticalOffsetRatio?: number;
    /**
     * The zoom level of the camera.
     */
    zoomLevel?: number;
  };
};

// Default configuration constants
export const DEFAULT_SCENE_OPTIONS = {
  perspective: {
    sideOffsetRatio: 0.25,
    verticalOffsetRatio: -2.5,
    heightMultiplier: 1.5,
    nearPlane: 0.2,
    minFarPlane: 10_000,
    farPlaneRadiusMultiplier: 5,
    zoomLevel: 0.75,
  },
  orthographic: {
    positionRatio: 1,
    verticalOffsetRatio: -0.5,
    zoomLevel: 5,
  },
} as const satisfies StageOptions;

// The ratio of the radius change that is considered significant enough to warrant a camera update
const SIGNIFICANT_RADIUS_CHANGE_RATIO = 0.5;

type StageProperties = {
  children: React.ReactNode;
  controls: React.RefObject<any>;
  center?: boolean;
  stageOptions: StageOptions;
} & React.HTMLAttributes<HTMLDivElement>;

export function Stage({ children, center = true, stageOptions, ...properties }: StageProperties) {
  const camera = useThree((state) => state.camera);
  const { invalidate } = useThree();
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  const [{ shapeRadius, sceneRadius, top }, set] = React.useState<{
    // The radius of the scene. Used to determine if the camera needs to be updated
    sceneRadius: number | undefined;
    // The radius of the shape.
    shapeRadius: number;
    // The top of the scene
    top: number;
  }>({
    sceneRadius: undefined,
    shapeRadius: 0,
    top: 0,
  });

  const { perspective, orthographic } = useMemo(() => {
    return {
      perspective: { ...DEFAULT_SCENE_OPTIONS.perspective, ...stageOptions.perspective },
      orthographic: { ...DEFAULT_SCENE_OPTIONS.orthographic, ...stageOptions.orthographic },
    };
  }, [stageOptions]);

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

    if (center) {
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
      return { shapeRadius: sphere.radius, sceneRadius: previous.sceneRadius, top: box3.max.z };
    });
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  /**
   * Rotate the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // If the scene radius is undefined, we need to initialize the camera
    const isSignificantChange =
      sceneRadius === undefined
        ? true
        : Math.abs(shapeRadius - sceneRadius) / sceneRadius > SIGNIFICANT_RADIUS_CHANGE_RATIO;

    if (isSignificantChange) {
      if (camera.type === 'OrthographicCamera') {
        camera.position.set(
          shapeRadius * orthographic.positionRatio,
          shapeRadius * orthographic.verticalOffsetRatio,
          shapeRadius,
        );
        camera.zoom = orthographic.zoomLevel;
        camera.near = -Math.max(perspective.minFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);
      } else {
        // Perspective camera settings
        camera.position.set(
          shapeRadius * perspective.sideOffsetRatio,
          shapeRadius * perspective.verticalOffsetRatio,
          Math.max(shapeRadius) * perspective.heightMultiplier,
        );
        camera.zoom = perspective.zoomLevel;
        camera.near = perspective.nearPlane;
        camera.far = Math.max(perspective.minFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);
        camera.lookAt(0, 0, 0);
      }
      // Update the radius
      set((previous) => {
        return {
          ...previous,
          sceneRadius: shapeRadius,
        };
      });
      camera.updateProjectionMatrix();
      invalidate();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeRadius, top, sceneRadius, stageOptions]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault zoom={perspective.zoomLevel} />
      <group ref={outer}>
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}
