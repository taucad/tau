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

  const [{ radius, previousRadius, top }, set] = React.useState<{
    previousRadius: number | undefined;
    radius: number;
    top: number;
  }>({
    previousRadius: undefined,
    radius: 0,
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

    set({ radius: sphere.radius, previousRadius: radius, top: box3.max.z });
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  /**
   * Rotate the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    if (previousRadius && previousRadius !== radius) {
      const ratio = radius / previousRadius;
      camera.position.set(camera.position.x * ratio, camera.position.y * ratio, camera.position.z * ratio);

      camera.far = Math.max(perspective.minFarPlane, radius * perspective.farPlaneRadiusMultiplier);

      invalidate();
      return;
    }

    if (camera.type === 'OrthographicCamera') {
      camera.position.set(radius * orthographic.positionRatio, radius * orthographic.verticalOffsetRatio, radius);
      camera.zoom = orthographic.zoomLevel;
      camera.near = -Math.max(perspective.minFarPlane, radius * perspective.farPlaneRadiusMultiplier);
      camera.updateProjectionMatrix();
    } else {
      // Perspective camera settings
      camera.position.set(
        radius * perspective.sideOffsetRatio,
        radius * perspective.verticalOffsetRatio,
        Math.max(radius) * perspective.heightMultiplier,
      );
      camera.zoom = perspective.zoomLevel;
      camera.near = perspective.nearPlane;
      camera.far = Math.max(perspective.minFarPlane, radius * perspective.farPlaneRadiusMultiplier);
      camera.lookAt(0, 0, 0);
    }

    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, top, previousRadius, stageOptions]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault zoom={perspective.zoomLevel} />
      <group ref={outer}>
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}
