import type { JSX } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Slider } from '@/components/ui/slider.js';

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
 * Internal component that handles the camera matrix manipulation.
 * This MUST be used inside a Canvas/R3F component tree.
 */
export function CameraHandler({ angle }: CameraHandlerProps): JSX.Element {
  const camera = useThree((state) => state.camera);
  const { invalidate } = useThree();

  // Store original camera settings to maintain consistent view
  const cameraState = useRef({
    initialized: false,
    originalFov: 50, // Default FOV if not set
    originalPosition: new THREE.Vector3(),
    originalZoom: 1,
    targetDistance: 10,
    lastAngle: -1,
    target: new THREE.Vector3(0, 0, 0),
  });

  // Separate function for camera updates to avoid code duplication
  const updateCameraProjection = useCallback(
    (camera: THREE.PerspectiveCamera, newAngle: number) => {
      if (!cameraState.current.initialized) return;

      // SIMPLIFY: Just apply a very obvious FOV change based on angle
      // This should be visible regardless of other settings
      const minFov = 5; // Very narrow FOV at 0 degrees (nearly orthographic)
      const maxFov = 120; // Very wide FOV at 90 degrees (extreme perspective)

      // Calculate new FOV with dramatic change
      const newFov = minFov + (maxFov - minFov) * (newAngle / 90);

      // Apply the change directly to the camera
      camera.fov = newFov;
      camera.updateProjectionMatrix();

      // Force a re-render
      invalidate();

      // Update last processed angle
      cameraState.current.lastAngle = newAngle;
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
    <div className={className}>
      <div className="flex flex-col space-y-2">
        <div className="flex justify-between text-xs">
          <span>Orthographic</span>
          <span>Perspective</span>
        </div>
        <Slider
          min={0}
          max={90}
          step={1}
          value={[angle]}
          onValueChange={(value) => {
            setAngle(value[0]);
          }}
        />
        <div className="text-center text-xs">{angle.toFixed(1)}°</div>
      </div>
    </div>
  );
}
