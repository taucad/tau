import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import * as THREE from 'three';

/** Threshold for considering scale animation complete */
const scaleCompleteThreshold = 0.01;

/** Threshold below which scale is clamped to 0 */
const scaleZeroThreshold = 0.001;

export type AnimatedGroupProperties = {
  readonly children: React.ReactNode;
  /** Target scale value to animate towards */
  readonly targetScale: number;
  /** Animation interpolation speed (higher = faster) @default 5 */
  readonly animationSpeed?: number;
  /** Enable automatic rotation around Y axis @default false */
  readonly enableAutoRotate?: boolean;
  /** Auto-rotation speed in radians per second @default 0.5 */
  readonly autoRotateSpeed?: number;
  /** Initial Y rotation in radians @default 0 */
  readonly initialRotationY?: number;
  /**
   * Initial scale value. Set to 1 to skip the scale-up animation.
   * @default 0
   */
  readonly initialScale?: number;
  /** Called when scale animation reaches the target */
  readonly onScaleComplete?: () => void;
  /** Called with current Y rotation value (for syncing with other components) */
  readonly onRotationChange?: (rotationY: number) => void;
};

/**
 * A Three.js group that smoothly animates its scale and optionally auto-rotates.
 * Uses useFrame for smooth per-frame animation.
 *
 * @example
 * ```tsx
 * <AnimatedGroup targetScale={1} enableAutoRotate>
 *   <mesh>...</mesh>
 * </AnimatedGroup>
 * ```
 */
export function AnimatedGroup({
  children,
  targetScale,
  animationSpeed = 5,
  enableAutoRotate = false,
  autoRotateSpeed = 0.5,
  initialRotationY = 0,
  initialScale = 0,
  onScaleComplete,
  onRotationChange,
}: AnimatedGroupProperties): React.JSX.Element {
  const groupRef = useRef<Group>(null);
  // Start at initialScale (default 0 for animation, or 1 to skip animation)
  const currentScaleRef = useRef(initialScale);
  const hasReachedTargetRef = useRef(initialScale === targetScale);
  const previousTargetRef = useRef(targetScale);
  const hasSetInitialRotationRef = useRef(false);

  // Stable callback ref for rotation changes
  const onRotationChangeRef = useRef(onRotationChange);
  onRotationChangeRef.current = onRotationChange;

  // Reset hasReachedTarget when target changes
  useEffect(() => {
    if (previousTargetRef.current !== targetScale) {
      hasReachedTargetRef.current = false;
      previousTargetRef.current = targetScale;
    }
  }, [targetScale]);

  // Set initial rotation when provided
  useEffect(() => {
    if (groupRef.current && initialRotationY !== 0 && !hasSetInitialRotationRef.current) {
      groupRef.current.rotation.y = initialRotationY;
      hasSetInitialRotationRef.current = true;
    }
  }, [initialRotationY]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    // Auto-rotate around Y axis
    if (enableAutoRotate) {
      groupRef.current.rotation.y += autoRotateSpeed * delta;
      // Notify parent of rotation change
      onRotationChangeRef.current?.(groupRef.current.rotation.y);
    }

    // Lerp towards target scale
    currentScaleRef.current = THREE.MathUtils.lerp(currentScaleRef.current, targetScale, animationSpeed * delta);

    // Clamp very small values to 0
    const finalScale = currentScaleRef.current < scaleZeroThreshold ? 0 : currentScaleRef.current;
    groupRef.current.scale.setScalar(finalScale);

    // Check if we've reached the target (within threshold)
    const distanceToTarget = Math.abs(currentScaleRef.current - targetScale);
    if (!hasReachedTargetRef.current && distanceToTarget < scaleCompleteThreshold) {
      hasReachedTargetRef.current = true;
      onScaleComplete?.();
    }
  });

  return <group ref={groupRef}>{children}</group>;
}
