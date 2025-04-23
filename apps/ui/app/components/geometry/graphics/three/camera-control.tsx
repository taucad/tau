import type { JSX } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Slider } from '@/components/ui/slider.js';
import { buttonVariants } from '@/components/ui/button.js';
import { cn } from '@/utils/ui.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type CameraControlProps = {
  /**
   * Default camera angle in degrees (0 = orthographic, 90 = perspective)
   */
  readonly defaultAngle?: number;
  /**
   * Callback when camera angle changes
   */
  readonly onChange?: (angle: number) => void;
  /**
   * Class name for the slider container
   */
  readonly className?: string;
};

// Props for internal handler component that lives inside Canvas
type CameraHandlerProps = {
  /**
   * Current angle between orthographic (0) and perspective (90)
   */
  readonly angle: number;
};

/**
 * Resets the camera to a standard position and orientation based on shape dimensions
 * Adjusts for FOV to maintain consistent framing regardless of perspective setting
 */
export function resetCamera({
  camera,
  shapeRadius,
  rotation,
  perspective,
  setCurrentZoom,
  setSceneRadius,
  invalidate,
}: {
  camera: THREE.Camera;
  shapeRadius: number;
  rotation: { side: number; vertical: number };
  perspective: {
    offsetRatio: number;
    zoomLevel: number;
    nearPlane: number;
    minimumFarPlane: number;
    farPlaneRadiusMultiplier: number;
  };
  setCurrentZoom: (zoom: number) => void;
  setSceneRadius: (radius: number) => void;
  invalidate: () => void;
}): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    console.error('resetCamera requires PerspectiveCamera');
    return;
  }

  // Reset zoom tracking state using the appropriate configured zoom level
  setCurrentZoom(perspective.zoomLevel);

  // Get the FOV of the perspective camera
  const { fov } = camera;

  // Calculate a FOV-adjusted distance factor to maintain consistent framing
  // Standard FOV for 3D views is often around 50-60 degrees
  const standardFov = 60;
  const fovAdjustmentFactor =
    Math.tan(THREE.MathUtils.degToRad(standardFov / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));

  // Adjust the offsetRatio based on the FOV to maintain consistent visual size
  const adjustedOffsetRatio = perspective.offsetRatio * fovAdjustmentFactor;

  // Compute camera position using spherical coordinates
  const [x, y] = getPositionOnCircle(shapeRadius * adjustedOffsetRatio, rotation.side);
  const [, z] = getPositionOnCircle(shapeRadius * adjustedOffsetRatio, rotation.vertical);

  camera.position.set(x, y, z);
  camera.zoom = perspective.zoomLevel;
  camera.near = perspective.nearPlane;
  camera.far = Math.max(perspective.minimumFarPlane, shapeRadius * perspective.farPlaneRadiusMultiplier);

  // Aim the camera at the center of the scene
  camera.lookAt(0, 0, 0);

  // Update the scene radius
  setSceneRadius(shapeRadius);

  camera.updateProjectionMatrix();
  invalidate();
}

/**
 * Get the position on the circumference of a circle given the radius and angle in radians.
 * @param radius - The radius of the circle.
 * @param angleInRadians - The angle in radians.
 * @returns The position on the circle.
 */
function getPositionOnCircle(radius: number, angleInRadians: number): [number, number] {
  return [radius * Math.cos(angleInRadians), radius * Math.sin(angleInRadians)];
}

/**
 * Internal component that handles the camera matrix manipulation.
 * This MUST be used inside a Canvas/R3F component tree.
 */
export function CameraHandler({ angle }: CameraHandlerProps): JSX.Element {
  const camera = useThree((state) => state.camera);
  const { invalidate } = useThree();

  // Store original camera settings to maintain consistent view
  const cameraState = useRef({
    initialized: false,
    originalFov: 60, // Default FOV if not set
    originalPosition: new THREE.Vector3(),
    originalZoom: 1,
    targetDistance: 10_000,
    target: new THREE.Vector3(0, 0, 0),
  });

  // Separate function for camera updates to avoid code duplication
  const updateCameraProjection = useCallback(
    (camera: THREE.PerspectiveCamera, newAngle: number) => {
      if (!cameraState.current.initialized) return;

      // Apply a FOV change based on angle
      const minFov = 1; // Very narrow FOV at 0 degrees (nearly orthographic)
      const maxFov = 120; // Very wide FOV at 90 degrees (extreme perspective)

      // Store old FOV before changing
      const oldFov = camera.fov;

      // Calculate new FOV with dramatic change
      const newFov = minFov + (maxFov - minFov) * (newAngle / 90);

      // Apply the FOV change to the camera
      camera.fov = newFov;

      // Adjust camera distance to maintain perceived size
      // The formula is: d2 = d1 * (tan(fov1/2) / tan(fov2/2))
      // This keeps objects the same apparent size when FOV changes
      const oldHalfFovRad = THREE.MathUtils.degToRad(oldFov / 2);
      const newHalfFovRad = THREE.MathUtils.degToRad(newFov / 2);

      if (oldHalfFovRad !== 0 && newHalfFovRad !== 0) {
        // Direction from camera to target
        const direction = camera.position.clone().normalize();

        // Calculate the adjustment ratio - inverse of what we had before
        // When FOV decreases, we need to move camera farther away
        const distanceRatio = Math.tan(oldHalfFovRad) / Math.tan(newHalfFovRad);

        // Apply distance adjustment preserving direction
        const currentDistance = camera.position.length();
        const newDistance = currentDistance * distanceRatio;

        camera.position.copy(direction.multiplyScalar(newDistance));
      }

      camera.updateProjectionMatrix();
      invalidate();
    },
    [invalidate],
  );
  // Initialize camera state on first render
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      console.error('CameraHandler requires PerspectiveCamera - found:', camera.type);
      return;
    }

    // Initialize once
    if (!cameraState.current.initialized) {
      cameraState.current.originalFov = camera.fov;
      cameraState.current.originalPosition.copy(camera.position);
      cameraState.current.originalZoom = camera.zoom;
      cameraState.current.targetDistance = camera.position.length();
      cameraState.current.initialized = true;

      // Force immediate update with initial angle
      updateCameraProjection(camera, angle);
    }
  }, [camera, angle, updateCameraProjection]);

  // Update camera projection when angle changes
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      console.error('Camera is not PerspectiveCamera:', camera.type);
      return;
    }

    if (!cameraState.current.initialized) {
      console.warn('CameraHandler not yet initialized');
      return;
    }

    updateCameraProjection(camera, angle);
  }, [camera, angle, updateCameraProjection]);

  // Use an empty group as R3F requires returning a valid Three.js object
  return <group name="camera-handler" />;
}

/**
 * External UI component that provides a slider to transition between
 * orthographic (0°) and perspective (90°) camera views.
 *
 * Note: This component DOES NOT directly use Three.js hooks.
 * You must use CameraHandler inside the Canvas separately.
 */
export function CameraControl({ defaultAngle = 90, onChange, className }: CameraControlProps): JSX.Element {
  const [angle, setAngle] = useState(defaultAngle);

  // Notify parent component when angle changes
  useEffect(() => {
    if (onChange) {
      onChange(angle);
    }
  }, [angle, onChange]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            buttonVariants({
              variant: 'overlay',
              size: 'sm',
            }),
            className,
            'group relative w-50 gap-0 overflow-hidden p-0 hover:overflow-visible max-md:overflow-visible',
            'flex items-center',
            'hover:cursor-pointer',
          )}
        >
          {/* Text labels that will move up on hover */}
          <div className="flex w-full justify-between px-1 text-xs leading-none transition-transform duration-300 group-hover:-translate-y-1.75 max-md:-translate-y-1.75">
            <span>Orthographic</span>
            <div className="font-bold text-primary">{angle}°</div>
            <span>Perspective</span>
          </div>

          {/* Slider container that slides up from bottom */}
          <Slider
            min={0}
            max={90}
            step={1}
            value={[angle]}
            // Inset-0 is used to make the entire button slideable for better UX
            className="absolute inset-0 h-full px-1 pt-8 opacity-0 duration-300 group-hover:pt-4 group-hover:opacity-100 max-md:pt-4 max-md:opacity-100 [&_[data-slot='slider-track']]:bg-neutral/20"
            onValueChange={(value) => {
              setAngle(value[0]);
            }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <span>Adjust camera angle</span>
        <br />
        <span className="text-neutral-foreground/60 dark:text-foreground/50">Tip: Set to 0° for orthographic view</span>
      </TooltipContent>
    </Tooltip>
  );
}
