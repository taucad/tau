import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
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
  orthographic?: {
    /**
     * The ratio of the scene's radius to offset the camera from the center. Adjusting this value will change the applied perspective of the scene.
     */
    offsetRatio?: number;
    /**
     * The zoom level of the camera.
     */
    zoomLevel?: number;
    /**
     * The minimum near plane of the camera.
     */
    minimumNearPlane?: number;
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

const SIGNIFICANT_RADIUS_CHANGE_RATIO = 0.4;

// Default configuration constants
export const DEFAULT_SCENE_OPTIONS = {
  perspective: {
    offsetRatio: 3,
    nearPlane: 0.2,
    minimumFarPlane: 1_000_000,
    farPlaneRadiusMultiplier: 5,
    zoomLevel: 1.25,
  },
  orthographic: {
    offsetRatio: 3,
    zoomLevel: 5,
    minimumNearPlane: 1,
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
  cameraMode?: 'perspective' | 'orthographic';
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({ children, center = false, stageOptions, ...properties }: StageProperties) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);
  const { invalidate } = useThree();
  const size = useThree((state) => state.size); // Get the canvas size
  const outer = React.useRef<THREE.Group>(null);
  const inner = React.useRef<THREE.Group>(null);

  // Add state for tracking zoom
  const [currentZoom, setCurrentZoom] = React.useState<number>(1);
  const originalDistanceReference = React.useRef<number | null>(null);
  // Store previous camera type to detect changes
  const previousCameraType = React.useRef<string | null>(null);

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

  // Add effect to track zoom changes
  React.useEffect(() => {
    if (!controls) return;

    const handleControlsChange = () => {
      if (camera.type === 'OrthographicCamera') {
        const zoom = camera.zoom;
        setCurrentZoom(zoom);
      } else {
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
      }
    };

    // @ts-expect-error addEventListener exists on OrbitControls
    controls.addEventListener?.('change', handleControlsChange);

    return () => {
      // @ts-expect-error removeEventListener exists on OrbitControls
      controls.removeEventListener?.('change', handleControlsChange);
    };
  }, [camera.type, camera.zoom, controls]);

  /**
   * Position the camera based on the scene's bounding box.
   */
  React.useLayoutEffect(() => {
    // Check if camera type has changed
    const hasCameraTypeChanged = previousCameraType.current !== null && previousCameraType.current !== camera.type;

    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    // Force update when camera type changes
    const isSignificantChange =
      sceneRadius === undefined
        ? true
        : Math.abs(shapeRadius - sceneRadius) / sceneRadius > SIGNIFICANT_RADIUS_CHANGE_RATIO;

    // Update the previous camera type reference
    previousCameraType.current = camera.type;

    if (isSignificantChange || hasCameraTypeChanged) {
      if (camera instanceof THREE.OrthographicCamera) {
        const [x, y] = getPositionOnCircle(shapeRadius, rotation.side);
        const [, z] = getPositionOnCircle(shapeRadius, rotation.vertical);
        camera.position.set(x, y, z);

        // Use the canvas dimensions from Three.js state
        const aspect = size.width / size.height;

        // Add these lines to set the orthographic camera frustum.
        // 6 is a magic number that works to align the orthographic zoom to the perspective zoom.
        const frustumSize = shapeRadius * 6;
        camera.left = -frustumSize * aspect;
        camera.right = frustumSize * aspect;
        camera.top = frustumSize;
        camera.bottom = -frustumSize;

        // Adjust near and far planes to ensure the entire scene is visible
        camera.near = -Math.max(orthographic.minimumNearPlane, shapeRadius * orthographic.offsetRatio * 2);
        camera.far = Math.abs(camera.near); // Make far plane symmetric with near plane

        camera.zoom = orthographic.zoomLevel;
      } else {
        const [x, y] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.side);
        const [, z] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.vertical);
        camera.position.set(x, y, z);
        camera.zoom = perspective.zoomLevel;
        camera.near = perspective.nearPlane;
        camera.far = Math.max(perspective.minimumFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);
        // @ts-expect-error saveState exists on OrbitControls
        controls?.saveState();
      }
      originalDistanceReference.current = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
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
    }
  }, [
    shapeRadius,
    top,
    sceneRadius,
    stageOptions,
    camera,
    invalidate,
    orthographic.offsetRatio,
    orthographic.zoomLevel,
    perspective.minimumFarPlane,
    perspective.farPlaneRadiusMultiplier,
    perspective.zoomLevel,
    perspective.nearPlane,
    rotation.side,
    perspective.offsetRatio,
    rotation.vertical,
    orthographic.minimumNearPlane,
    controls,
    size.width,
    size.height,
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
    let effectiveZoom;
    // eslint-disable-next-line unicorn/prefer-ternary -- the math is easier to read this way
    if (camera.type === 'OrthographicCamera') {
      effectiveZoom = currentZoom / 28;
    } else {
      effectiveZoom = currentZoom;
    }
    const baseSize = shapeRadius * effectiveZoom;
    const effectiveSize = (1 / baseSize) * 50;

    // Calculate the appropriate grid size using logarithms
    // This finds the nearest power of 10 multiplied by either 1 or 5
    const exponent = Math.floor(Math.log10(effectiveSize));
    const mantissa = effectiveSize / Math.pow(10, exponent);

    let largeSize;
    // eslint-disable-next-line unicorn/prefer-ternary -- the math is easier to read this way
    if (mantissa < 2.5) {
      largeSize = Math.pow(10, exponent);
    } else {
      largeSize = 5 * Math.pow(10, exponent);
    }

    const value = {
      smallSize: largeSize / 10, // Smaller grid is 1/10th of the larger grid
      largeSize,
      effectiveSize,
      baseSize,
    };

    return value;
  }, [camera.type, currentZoom, properties.enableGrid, shapeRadius]);
  console.log(camera);
  console.log(controls);
  console.log(gridSizes);

  return (
    <group {...properties}>
      {properties.cameraMode === 'perspective' && <PerspectiveCamera makeDefault />}
      {properties.cameraMode === 'orthographic' && <OrthographicCamera makeDefault />}
      <group ref={outer}>
        {properties.enableAxesHelper && <AxesHelper />}
        {properties.enableGrid && <InfiniteGrid smallSize={10} largeSize={100} />}
        <group ref={inner}>{children}</group>
        {/* <Html position={[0, 0, 10]}>
          <div className="rounded-md border bg-background p-1 text-xs">
            {Object.entries(gridSizes).map(([key, value]) => (
              <div key={key}>
                <span className="whitespace-nowrap">
                  {key}: {value}
                </span>
              </div>
            ))}
            <div>
              <span className="whitespace-nowrap">shapeRadius: {shapeRadius}</span>
            </div>
            <div>
              <span className="whitespace-nowrap">zoom: {currentZoom}</span>
            </div>
            <div>
              <span className="whitespace-nowrap">
                distance to origin camera: {camera.position.distanceTo(new THREE.Vector3(0, 0, 0))}
              </span>
            </div>
          </div>
        </Html> */}
      </group>
    </group>
  );
}
