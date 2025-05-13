import type { JSX } from 'react';
import * as THREE from 'three';
import { useEffect } from 'react';
import { Slider } from '@/components/ui/slider.js';
import { buttonVariants } from '@/components/ui/button.js';
import { cn } from '@/utils/ui.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useGraphics } from '@/components/geometry/graphics/graphics-context.js';
import { useCookie } from '@/hooks/use-cookie.js';

// Cookie name constant - same as in the ThreeContext
const cameraAngleCookieName = 'camera-angle';

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
 * External UI component that provides a slider to transition between
 * orthographic (0°) and perspective (90°) camera views.
 *
 * Note: This component DOES NOT directly use Three.js hooks.
 * You must use CameraHandler inside the Canvas separately.
 */
export function CameraControl({ defaultAngle = 90, className }: Omit<CameraControlProps, 'onChange'>): JSX.Element {
  const { setCameraAngle } = useGraphics();
  const [angle, setAngle] = useCookie<number>(cameraAngleCookieName, defaultAngle);

  // Update camera angle directly in the Graphics context when angle changes
  useEffect(() => {
    setCameraAngle(angle);
  }, [angle, setCameraAngle]);

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
            'group relative w-30 gap-0 overflow-hidden p-0 hover:overflow-visible max-md:overflow-visible md:w-50',
            'flex items-center',
            'hover:cursor-pointer',
          )}
        >
          {/* Text labels that will move up on hover */}
          <div className="flex w-full justify-between px-1 text-xs leading-none transition-transform duration-300 group-hover:-translate-y-1.75 max-md:-translate-y-1.75">
            <span className="hidden md:block">Orthographic</span>
            <span className="md:hidden">Orth.</span>
            <div className="font-bold text-primary">{angle}°</div>
            <span className="hidden md:block">Perspective</span>
            <span className="md:hidden">Persp.</span>
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
