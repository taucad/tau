import React, { useMemo } from 'react';
import type { JSX, ReactNode, RefObject } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { AxesHelper } from '@/components/geometry/graphics/three/axes-helper.js';
import { resetCamera as resetCameraFn } from '@/components/geometry/graphics/camera-control.js';
import { Grid } from '@/components/geometry/graphics/three/grid.js';
import type { GridSizes } from '@/components/geometry/graphics/three/grid.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';

export type StageOptions = {
  perspective?: {
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
  };
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

const significantRadiusChangeRatio = 0.4;

// Default configuration constants
export const defaultStageOptions = {
  perspective: {
    offsetRatio: 3,
    nearPlane: 1,
    minimumFarPlane: 1_000_000,
    farPlaneRadiusMultiplier: 5,
    zoomLevel: 1.25,
  },
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 4, // Default rotation is 45 degrees upwards
  },
} as const satisfies StageOptions;

// Grid size calculation constants moved to grid.tsx

// GridSizes type moved to grid.tsx

type StageProperties = {
  readonly children: ReactNode;
  readonly isCentered?: boolean;
  readonly stageOptions?: StageOptions;
  readonly hasGrid?: boolean;
  readonly hasAxesHelper?: boolean;
  readonly onGridChange?: (gridSizes: GridSizes) => void;
  readonly ref?: RefObject<
    | {
        resetCamera: () => void;
      }
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null is required by React
    | null
  >;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({
  children,
  isCentered = false,
  stageOptions = defaultStageOptions,
  ref,
  onGridChange,
  ...properties
}: StageProperties): JSX.Element {
  const { stageRef } = useGraphics();
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as RootState['controls'] & {
    /**
     * Get the distance between the camera and the target.
     *
     * @returns The distance between the camera and the target.
     *
     * @note this does exist, it's just not typed
     */
    getDistance: () => number;
  };
  const { invalidate } = useThree();
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  // Add state for tracking zoom
  const [currentZoom, setCurrentZoom] = React.useState<number>(1);
  const originalDistanceReference = React.useRef<number | undefined>(null);

  const [{ shapeRadius, sceneRadius }, set] = React.useState<{
    // The radius of the scene. Used to determine if the camera needs to be updated
    sceneRadius: number | undefined;
    // The radius of the shape.
    shapeRadius: number;
  }>({
    sceneRadius: undefined,
    shapeRadius: 0,
  });

  const { perspective, rotation } = useMemo(() => {
    return {
      perspective: { ...defaultStageOptions.perspective, ...stageOptions.perspective },
      rotation: { ...defaultStageOptions.rotation, ...stageOptions.rotation },
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

    if (isCentered) {
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
  }, [isCentered, children]);

  // Add effect to track zoom changes
  React.useEffect(() => {
    if (!controls) return;

    const handleControlsChange = () => {
      if (originalDistanceReference.current === null) {
        originalDistanceReference.current = controls.getDistance?.();
      }

      const distance = controls.getDistance?.();
      if (distance && originalDistanceReference.current) {
        const zoom = originalDistanceReference.current / distance;
        setCurrentZoom(zoom);
      }
    };

    // @ts-expect-error addEventListener exists on OrbitControls
    controls.addEventListener?.('change', handleControlsChange);

    return () => {
      // @ts-expect-error removeEventListener exists on OrbitControls
      controls.removeEventListener?.('change', handleControlsChange);
    };
  }, [camera.type, camera.zoom, controls]);

  const resetCamera = React.useCallback(() => {
    originalDistanceReference.current = null;

    // Use the shared resetCamera function from camera-control.tsx
    resetCameraFn({
      camera,
      shapeRadius,
      rotation,
      perspective,
      setCurrentZoom,
      setSceneRadius(radius) {
        set((previous) => ({
          ...previous,
          sceneRadius: radius,
        }));
      },
      invalidate,
    });
  }, [camera, invalidate, shapeRadius, rotation, perspective, setCurrentZoom]);

  // Set up the ref in both GraphicsProvider and local ref
  React.useImperativeHandle(ref, () => ({
    resetCamera,
  }));

  // Also set the resetCamera function on the stageRef in the GraphicsProvider
  React.useImperativeHandle(stageRef, () => ({
    resetCamera,
  }));

  /**
   * Position the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    // Force update when camera type changes
    const isSignificantChange =
      sceneRadius === undefined
        ? true
        : Math.abs(shapeRadius - sceneRadius) / sceneRadius > significantRadiusChangeRatio;

    if (isSignificantChange) {
      resetCamera();
    }
  }, [camera, resetCamera, sceneRadius, shapeRadius]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        {properties.hasAxesHelper ? <AxesHelper /> : null}
        {properties.hasGrid ? <Grid currentZoom={currentZoom} /> : null}
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}
