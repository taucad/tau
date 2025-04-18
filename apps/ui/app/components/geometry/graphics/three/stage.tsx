import React, { useMemo } from 'react';
import type { JSX, ReactNode, RefObject } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { InfiniteGrid } from '@/components/geometry/graphics/three/infinite-grid.js';
import { AxesHelper } from '@/components/geometry/graphics/three/axes-helper.js';

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
    nearPlane: 0.2,
    minimumFarPlane: 1_000_000,
    farPlaneRadiusMultiplier: 5,
    zoomLevel: 1.25,
  },
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 4, // Default rotation is 45 degrees upwards
  },
} as const satisfies StageOptions;

// Grid size calculation constants
export const gridSizeConstants = {
  // How aggressively the grid size scales with object size (higher = more aggressive)
  shapeRadiusLogFactor: 2.5,
  // Coefficient for the grid size calculation to fine-tune the result
  baseGridSizeCoefficient: 20,
  // Minimum base grid size to prevent too small grids, in mm
  minimumBaseGridSize: 0.1,
  // Threshold for rounding to 1× or 5× powers of 10
  roundingThreshold: 2.5,
  // For perspective mode - multiplier for the effectiveSize calculation
  perspectiveEffectiveSizeFactor: 50,
} as const;

/**
 * Get the position on the circumference of a circle given the radius and angle in radians.
 * @param radius - The radius of the circle.
 * @param angleInRadians - The angle in radians.
 * @returns The position on the circle.
 */
function getPositionOnCircle(radius: number, angleInRadians: number): [number, number] {
  return [radius * Math.cos(angleInRadians), radius * Math.sin(angleInRadians)];
}

export type GridSizes = {
  smallSize: number;
  largeSize: number;
  effectiveSize?: number;
  baseSize?: number;
  zoomFactor?: number;
};

type StageProperties = {
  readonly children: ReactNode;
  readonly isCentered?: boolean;
  readonly stageOptions?: StageOptions;
  readonly hasGrid?: boolean;
  readonly hasAxesHelper?: boolean;
  readonly onGridChange?: (gridSizes: GridSizes) => void;
  /**
   * The base distance falloff scale for the grid.
   * @default 800
   */
  readonly distanceFalloffScale?: number;
  /**
   * Whether to make the distance falloff scale dynamic based on zoom.
   * @default true
   */
  readonly hasDynamicDistanceFalloff?: boolean;
  /**
   * The minimum distance falloff scale.
   * @default 800
   */
  readonly minDistanceFalloffScale?: number;
  /**
   * The maximum distance falloff scale.
   * @default 10000
   */
  readonly maxDistanceFalloffScale?: number;
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
  distanceFalloffScale = 800,
  hasDynamicDistanceFalloff = true,
  minDistanceFalloffScale = 800,
  maxDistanceFalloffScale = 100_000_000,
  ...properties
}: StageProperties): JSX.Element {
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
    // The top of the scene
    top: number;
  }>({
    sceneRadius: undefined,
    shapeRadius: 0,
    top: 0,
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
      return { shapeRadius: sphere.radius, sceneRadius: previous.sceneRadius, top: box3.max.z };
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
    // Reset zoom tracking state using the appropriate configured zoom level
    setCurrentZoom(perspective.zoomLevel);

    originalDistanceReference.current = null;

    const [x, y] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.side);
    const [, z] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.vertical);
    camera.position.set(x, y, z);
    camera.zoom = perspective.zoomLevel;
    camera.near = perspective.nearPlane;
    camera.far = Math.max(perspective.minimumFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);

    // Aim the camera at the center of the scene
    camera.lookAt(0, 0, 0);
    // Update the radius
    set((previous) => {
      return {
        ...previous,
        sceneRadius: shapeRadius,
      };
    });
    camera.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    invalidate,
    shapeRadius,
    rotation.side,
    rotation.vertical,
    perspective.offsetRatio,
    perspective.zoomLevel,
    perspective.nearPlane,
    perspective.minimumFarPlane,
    perspective.farPlaneRadiusMultiplier,
  ]);

  React.useImperativeHandle(ref, () => ({
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

  // Calculate grid sizes based on zoom and shape radius
  const gridSizes = useMemo(() => {
    if (!properties.hasGrid) {
      return {
        smallSize: 0,
        largeSize: 0,
        effectiveSize: 0,
      };
    }

    // Base factor - how much we scale the grid based on shape size
    const baseFactor = Math.max(1, Math.log10(shapeRadius) * gridSizeConstants.shapeRadiusLogFactor);

    const inverseZoom = 1 / currentZoom;

    // Calculate grid size using logarithmic scale that grows as we zoom out
    const baseGridSize = Math.max(
      gridSizeConstants.minimumBaseGridSize,
      inverseZoom * baseFactor * gridSizeConstants.baseGridSizeCoefficient,
    );

    // Find appropriate power of 10
    const exponent = Math.floor(Math.log10(baseGridSize));
    const mantissa = baseGridSize / 10 ** exponent;

    // Round to either 1 or 5 times a power of 10
    const largeSize = mantissa < gridSizeConstants.roundingThreshold ? 10 ** exponent : 5 * 10 ** exponent;

    return {
      smallSize: largeSize / 10, // Smaller grid is 1/10th of the larger grid
      largeSize,
      effectiveSize: baseGridSize,
      baseSize: shapeRadius * inverseZoom,
      zoomFactor: inverseZoom,
    };
  }, [currentZoom, properties.hasGrid, shapeRadius]);

  // Calculate dynamic falloff scale based on zoom
  const dynamicFalloffScale = useMemo(() => {
    if (!hasDynamicDistanceFalloff) {
      return distanceFalloffScale;
    }

    // Calculate scaling factor based on camera distance/zoom
    const cameraDistance = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));

    // Apply a more aggressive scaling formula that increases distanceFalloffScale as we zoom out
    // Using a higher multiplier (2 + cameraDistance / 500) for stronger scaling at far distances
    return Math.max(
      minDistanceFalloffScale,
      Math.min(maxDistanceFalloffScale, distanceFalloffScale * (2 + cameraDistance / 500)),
    );
  }, [
    camera.position,
    distanceFalloffScale,
    hasDynamicDistanceFalloff,
    minDistanceFalloffScale,
    maxDistanceFalloffScale,
  ]);

  // Call onGridChange when gridSizes change
  React.useEffect(() => {
    onGridChange?.(gridSizes);
  }, [gridSizes, onGridChange]);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        {properties.hasAxesHelper ? <AxesHelper /> : null}
        {properties.hasGrid ? (
          <InfiniteGrid
            smallSize={gridSizes.smallSize}
            largeSize={gridSizes.largeSize}
            distanceFalloffScale={dynamicFalloffScale}
          />
        ) : null}
        <group ref={inner}>{children}</group>
      </group>
    </group>
  );
}
