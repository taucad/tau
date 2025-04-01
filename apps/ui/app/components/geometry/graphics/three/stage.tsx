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
  ref?: React.RefObject<{
    resetCamera: () => void;
  } | null>;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id'>;

export function Stage({ children, center = false, stageOptions, ref, ...properties }: StageProperties) {
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

  const { perspective, orthographic, rotation } = useMemo(() => {
    return {
      perspective: { ...DEFAULT_SCENE_OPTIONS.perspective, ...stageOptions.perspective },
      orthographic: { ...DEFAULT_SCENE_OPTIONS.orthographic, ...stageOptions.orthographic },
      rotation: { ...DEFAULT_SCENE_OPTIONS.rotation, ...stageOptions.rotation },
    };
  }, [stageOptions]);

  // Track previous size for orthographic camera adjustments
  const previousSize = React.useRef<{ width: number; height: number } | null>(null);

  // Add a ref to store the base frustum size for orthographic camera
  const baseFrustumSize = React.useRef<number | null>(null);

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

  const resetCamera = React.useCallback(() => {
    const hasCameraTypeChanged = previousCameraType.current !== null && previousCameraType.current !== camera.type;

    // Reset zoom tracking state using the appropriate configured zoom level
    setCurrentZoom(camera instanceof THREE.OrthographicCamera ? orthographic.zoomLevel : perspective.zoomLevel);

    // eslint-disable-next-line unicorn/no-null -- null is required for React.useRef
    originalDistanceReference.current = null;

    if (camera instanceof THREE.OrthographicCamera) {
      const [x, y] = getPositionOnCircle(shapeRadius, rotation.side);
      const [, z] = getPositionOnCircle(shapeRadius, rotation.vertical);
      camera.position.set(x, y, z);

      // Store current size to detect changes
      previousSize.current = { width: size.width, height: size.height };

      // Get aspect ratio
      const aspect = size.width / size.height;

      // On first setup or camera type change, initialize the base frustum size
      if (baseFrustumSize.current === null || hasCameraTypeChanged) {
        baseFrustumSize.current = shapeRadius * 70;
      }

      // Reset zoom to initial value
      camera.zoom = orthographic.zoomLevel;

      // Use the stored base frustum size and apply current zoom
      const frustumHeight = baseFrustumSize.current / camera.zoom;
      const frustumWidth = frustumHeight * aspect;

      // Set camera frustum
      camera.left = -frustumWidth / 2;
      camera.right = frustumWidth / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;

      // Adjust near and far planes to accommodate the much larger view
      camera.near = -Math.max(orthographic.minimumNearPlane, shapeRadius * orthographic.offsetRatio * 5);
      camera.far = Math.abs(camera.near) * 2; // Make far plane even more generous
    } else {
      // Reset our base frustum size when switching away from orthographic
      // eslint-disable-next-line unicorn/no-null -- null is required for React.useRef
      baseFrustumSize.current = null;

      const [x, y] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.side);
      const [, z] = getPositionOnCircle(shapeRadius * perspective.offsetRatio, rotation.vertical);
      camera.position.set(x, y, z);
      camera.zoom = perspective.zoomLevel;
      camera.near = perspective.nearPlane;
      camera.far = Math.max(perspective.minimumFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);
    }

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
    size.width,
    size.height,
    orthographic.minimumNearPlane,
    orthographic.offsetRatio,
    orthographic.zoomLevel,
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
    // Check if camera type has changed
    const hasCameraTypeChanged = previousCameraType.current !== null && previousCameraType.current !== camera.type;

    // Check if window size has changed for orthographic camera
    const hasSizeChanged =
      camera instanceof THREE.OrthographicCamera &&
      previousSize.current &&
      (previousSize.current.width !== size.width || previousSize.current.height !== size.height);

    // If the scene radius is undefined, we need to initialize the camera, so we default to true.
    // Force update when camera type changes
    const isSignificantChange =
      sceneRadius === undefined
        ? true
        : Math.abs(shapeRadius - sceneRadius) / sceneRadius > SIGNIFICANT_RADIUS_CHANGE_RATIO;

    // Update the previous camera type reference
    previousCameraType.current = camera.type;

    if (isSignificantChange || hasCameraTypeChanged || hasSizeChanged) {
      resetCamera();
    }
  }, [camera, resetCamera, sceneRadius, shapeRadius, size.height, size.width]);

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
  // console.log(camera);
  // console.log(controls);
  // console.log(gridSizes);

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
