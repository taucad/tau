import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { Html, PerspectiveCamera } from '@react-three/drei';
import { InfiniteGrid } from './infinite-grid';
import { AxesHelper } from './axes-helper';

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

// Default configuration constants
export const DEFAULT_SCENE_OPTIONS = {
  perspective: {
    offsetRatio: 3,
    nearPlane: 0.2,
    minFarPlane: 10_000,
    farPlaneRadiusMultiplier: 5,
    zoomLevel: 1.25,
  },
  orthographic: {
    positionRatio: 1,
    verticalOffsetRatio: -0.5,
    zoomLevel: 5,
  },
  rotation: {
    side: -Math.PI / 4, // Default rotation is 45 degrees counter-clockwise
    vertical: Math.PI / 4, // Default rotation is 45 degrees upwards
  },
} as const satisfies StageOptions;

/**
 * Get the position on the circumference of a circle given the radius and angle in radians.
 * @param radius - The radius of the circle.
 * @param angleInRadians - The angle in radians.
 * @returns The position on the circle.
 */
function getPositionOnCircle(radius: number, angleInRadians: number): [number, number] {
  return [radius * Math.cos(angleInRadians), radius * Math.sin(angleInRadians)];
}

type StageProperties = {
  children: React.ReactNode;
  center?: boolean;
  stageOptions: StageOptions;
  enableGrid?: boolean;
  enableAxesHelper?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({ children, center = false, stageOptions, ...properties }: StageProperties) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const { invalidate } = useThree();
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  // Add state for tracking zoom
  const [currentZoom, setCurrentZoom] = React.useState<number>(1);
  const originalDistanceReference = React.useRef<number | null>(null);

  // Add effect to track zoom changes
  React.useEffect(() => {
    if (!controls) return;

    const handleControlsChange = () => {
      if (originalDistanceReference.current === null) {
        // @ts-expect-error getDistance exists on OrbitControls
        originalDistanceReference.current = controls.getDistance?.();
      }

      // @ts-expect-error getDistance exists on OrbitControls
      const distance = controls.getDistance?.();
      if (distance && originalDistanceReference.current) {
        const zoom = originalDistanceReference.current / distance;
        // Multiply by 10_000 to avoid floating point precision issues
        setCurrentZoom(Math.round(zoom * 10_000) / 10_000);
      }
    };

    // @ts-expect-error addEventListener exists on OrbitControls
    controls.addEventListener?.('change', handleControlsChange);

    return () => {
      // @ts-expect-error removeEventListener exists on OrbitControls
      controls.removeEventListener?.('change', handleControlsChange);
    };
  }, [controls]);

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

  const { perspective, orthographic, rotation } = useMemo(() => {
    return {
      perspective: { ...DEFAULT_SCENE_OPTIONS.perspective, ...stageOptions.perspective },
      orthographic: { ...DEFAULT_SCENE_OPTIONS.orthographic, ...stageOptions.orthographic },
      rotation: { ...DEFAULT_SCENE_OPTIONS.rotation, ...stageOptions.rotation },
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
  }, [center, children]);

  /**
   * Position the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    const isSignificantChange = true;

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
        const [x, y] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.side);
        const [, z] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.vertical);

        camera.zoom = perspective.zoomLevel;
        camera.position.set(x, y, z);
        camera.near = perspective.nearPlane;
        camera.far = Math.max(perspective.minFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);
        camera.lookAt(0, 0, sceneRadius ?? 0);
        originalDistanceReference.current = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
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
  }, [
    shapeRadius,
    top,
    sceneRadius,
    stageOptions,
    camera,
    invalidate,
    orthographic.positionRatio,
    orthographic.verticalOffsetRatio,
    orthographic.zoomLevel,
    perspective.minFarPlane,
    perspective.farPlaneRadiusMultiplier,
    perspective.zoomLevel,
    perspective.nearPlane,
    rotation.side,
    perspective.offsetRatio,
    rotation.vertical,
  ]);

  // Calculate grid sizes based on zoom and shape radius
  const gridSizes = useMemo(() => {
    if (!properties.enableGrid) {
      return {
        smallSize: 0,
        largeSize: 0,
        effectiveSize: 0,
      };
    }
    const effectiveZoom = currentZoom * perspective.zoomLevel;
    const baseSize = shapeRadius * effectiveZoom;
    const effectiveSize = (1 / baseSize) * 50e1;

    // Define grid size thresholds in millimeters
    const sizes = [
      0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000, 5000, 10_000, 50_000, 100_000, 500_000,
      1_000_000,
    ];

    // Find the appropriate size based on the current zoom level
    let largeSize = sizes[0]; // Start with smallest size as default

    // Look for larger sizes if needed
    for (const size of sizes) {
      // We want smaller grid sizes when baseSize is larger (when zoomed in)
      if (effectiveSize > size) {
        largeSize = size;
      } else {
        break;
      }
    }

    const value = {
      smallSize: largeSize / 10, // Smaller grid is 1/10th of the larger grid
      largeSize,
      effectiveSize,
      baseSize,
    };

    return value;
  }, [currentZoom, perspective.zoomLevel, properties.enableGrid, shapeRadius]);

  // console.log('camera', camera);
  // console.log('gridSizes', gridSizes);
  // console.log('currentZoom', currentZoom);
  // console.log('shapeRadius', shapeRadius);
  // console.log('effectiveSize', gridSizes.effectiveSize);
  // console.log('multiplied', (1 / (shapeRadius * currentZoom * perspective.zoomLevel)) * 70);

  return (
    <group {...properties}>
      <PerspectiveCamera makeDefault />
      <group ref={outer}>
        {properties.enableAxesHelper && <AxesHelper />}
        {properties.enableGrid && <InfiniteGrid smallSize={gridSizes.smallSize} largeSize={gridSizes.largeSize} />}
        <group ref={inner}>{children}</group>
        <Html
          // position={[0, 0, 0]}
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            pointerEvents: 'none',
            zIndex: 999,
            width: '100%',
            height: '100%',
          }}
          transform={false}
          translate={'yes'}
          // fullscreen
          portal={{
            current: document.body,
          }}
          distanceFactor={0}
        >
          <div className="w-32 rounded-md border bg-white p-1">
            <span>Grid Size: {gridSizes.largeSize}mm</span>
          </div>
        </Html>
      </group>
    </group>
  );
}
