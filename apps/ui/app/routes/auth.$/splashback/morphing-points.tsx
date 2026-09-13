import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Points, Group } from 'three';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { createMorphingPointsNodeMaterial } from '#routes/auth.$/splashback/morphing-points-material.node.js';
import {
  createMorphingPointsMaterial,
  updateMorphProgress,
  updateMorphTime,
  updateMorphOpacity,
} from '#routes/auth.$/splashback/morphing-points-material.js';
import { updateMorphAnimation, resetMorphAnimationOnTargetChange } from '#routes/auth.$/splashback/morph-animation.js';
import type { SampledPoints } from '#routes/auth.$/splashback/point-sampler.js';

export type MorphingPointsProperties = {
  /**
   * Sampled points from the source geometry.
   */
  readonly sourcePoints: SampledPoints;
  /**
   * Sampled points from the target geometry.
   */
  readonly targetPoints: SampledPoints;
  /**
   * Target morph progress (0 = source, 1 = target).
   * The component will animate smoothly towards this value.
   */
  readonly targetProgress: number;
  /**
   * Animation speed for progress interpolation.
   * @default 2
   */
  readonly animationSpeed?: number;
  /**
   * Source color for particles.
   * @default '#14b8a6'
   */
  readonly sourceColor?: string;
  /**
   * Target color for particles (optional).
   * If provided, particles will transition from sourceColor to targetColor.
   */
  readonly targetColor?: string;
  /**
   * Point size in pixels.
   * @default 3
   */
  readonly pointSize?: number;
  /**
   * Explosion strength - how far particles expand at midpoint.
   * @default 2
   */
  readonly explosionStrength?: number;
  /**
   * Static rotation to apply to the points group (for coordinate system correction).
   */
  readonly rotation?: [number, number, number];
  /**
   * Initial Y rotation in radians (for syncing with source mesh).
   * @default 0
   */
  readonly initialRotationY?: number;
  /**
   * Enable automatic rotation around Y axis during morph.
   * @default false
   */
  readonly enableAutoRotate?: boolean;
  /**
   * Auto-rotation speed in radians per second.
   * @default 0.5
   */
  readonly autoRotateSpeed?: number;
  /**
   * Opacity of the point cloud (0 to 1).
   * Used for crossfade transitions.
   * @default 1
   */
  readonly opacity?: number;
  /**
   * Called when morph animation reaches the target progress.
   * Provides the final Y rotation value for syncing with target mesh.
   */
  readonly onMorphComplete?: (finalRotationY: number) => void;
};

/**
 * A Three.js Points component that morphs between two sets of sampled positions.
 *
 * This component:
 * - Renders particles using a custom GPU shader
 * - Smoothly animates progress towards the target
 * - Provides explosion and swirl effects during transition
 * - Supports color interpolation between source and target
 *
 * @example
 * ```tsx
 * <MorphingPoints
 *   sourcePoints={gear12Points}
 *   targetPoints={gear8Points}
 *   targetProgress={1}
 *   sourceColor="#14b8a6"
 *   targetColor="#5B8FD9"
 *   onMorphComplete={() => console.log('Morph complete!')}
 * />
 * ```
 */
export function MorphingPoints({
  sourcePoints,
  targetPoints,
  targetProgress,
  animationSpeed = 2,
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js point color
  sourceColor = '#14b8a6',
  targetColor,
  pointSize = 3,
  explosionStrength = 2,
  rotation,
  initialRotationY = 0,
  enableAutoRotate = false,
  autoRotateSpeed = 0.5,
  opacity = 1,
  onMorphComplete,
}: MorphingPointsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  const nodeHandlesRef = useRef<ReturnType<typeof createMorphingPointsNodeMaterial>['handles'] | undefined>(undefined);

  const pointsRef = useRef<Points>(null);
  const rotationGroupRef = useRef<Group>(null);
  const currentRotationYaxisRef = useRef(initialRotationY);
  const hasSetInitialRotationRef = useRef(false);

  // Morph animation state
  const morphProgressRef = useRef(0);
  const morphHasReachedTargetRef = useRef(false);
  const morphPreviousTargetRef = useRef(targetProgress);

  // Create the geometry with morph attributes
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Set source positions as the base position attribute
    geo.setAttribute('position', new THREE.BufferAttribute(sourcePoints.positions, 3));

    // Set target positions as a custom attribute
    geo.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPoints.positions, 3));

    // Set random offsets for organic movement
    geo.setAttribute('aRandomOffset', new THREE.BufferAttribute(sourcePoints.randomOffsets, 1));

    return geo;
  }, [sourcePoints, targetPoints]);

  // Create the morphing points material — GLSL ShaderMaterial or TSL PointsNodeMaterial.
  const material = useMemo(() => {
    if (backend === 'webgpu') {
      const built = createMorphingPointsNodeMaterial({
        color: sourceColor,
        targetColor,
        pointSize,
        explosionStrength,
      });
      nodeHandlesRef.current = built.handles;
      return built.material;
    }

    nodeHandlesRef.current = undefined;
    return createMorphingPointsMaterial({
      color: sourceColor,
      targetColor,
      pointSize,
      explosionStrength,
    });
  }, [backend, explosionStrength, pointSize, sourceColor, targetColor]);

  // Reset hasReachedTarget when target changes
  useEffect(() => {
    resetMorphAnimationOnTargetChange(
      {
        progressRef: morphProgressRef,
        hasReachedTargetRef: morphHasReachedTargetRef,
        previousTargetRef: morphPreviousTargetRef,
      },
      targetProgress,
    );
  }, [targetProgress]);

  // Set initial rotation
  useEffect(() => {
    if (rotationGroupRef.current && !hasSetInitialRotationRef.current) {
      rotationGroupRef.current.rotation.y = initialRotationY;
      currentRotationYaxisRef.current = initialRotationY;
      hasSetInitialRotationRef.current = true;
    }
  }, [initialRotationY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state, delta) => {
    if (!pointsRef.current || !rotationGroupRef.current) {
      return;
    }

    // Auto-rotate around Y axis
    if (enableAutoRotate) {
      currentRotationYaxisRef.current += autoRotateSpeed * delta;
      rotationGroupRef.current.rotation.y = currentRotationYaxisRef.current;
    }

    // Animate progress towards target
    const currentProgress = updateMorphAnimation({
      state: {
        progressRef: morphProgressRef,
        hasReachedTargetRef: morphHasReachedTargetRef,
        previousTargetRef: morphPreviousTargetRef,
      },
      targetProgress,
      delta,
      animationSpeed,
      onComplete() {
        onMorphComplete?.(currentRotationYaxisRef.current);
      },
    });

    if (nodeHandlesRef.current) {
      nodeHandlesRef.current.uProgress.value = currentProgress;
      nodeHandlesRef.current.uTime.value = state.clock.elapsedTime;
      nodeHandlesRef.current.uOpacity.value = opacity;
    } else {
      updateMorphProgress(material as THREE.ShaderMaterial, currentProgress);
      updateMorphTime(material as THREE.ShaderMaterial, state.clock.elapsedTime);
      updateMorphOpacity(material as THREE.ShaderMaterial, opacity);
    }
  });

  return (
    <group ref={rotationGroupRef}>
      <group rotation={rotation}>
        <points ref={pointsRef} geometry={geometry} material={material} />
      </group>
    </group>
  );
}

export type MorphDirection = 'forward' | 'reverse';

export type AnimatedMorphingPointsProperties = Omit<MorphingPointsProperties, 'targetProgress'> & {
  /**
   * Whether the morph animation is active.
   */
  readonly isActive: boolean;
  /**
   * Direction of the morph.
   * 'forward' goes from source to target (0 -> 1)
   * 'reverse' goes from target to source (1 -> 0)
   * @default 'forward'
   */
  readonly direction?: MorphDirection;
};

/**
 * A convenience wrapper around MorphingPoints that automatically
 * handles the animation based on isActive and direction props.
 */
export function AnimatedMorphingPoints({
  isActive,
  direction = 'forward',
  ...rest
}: AnimatedMorphingPointsProperties): React.JSX.Element {
  const targetProgress = isActive ? (direction === 'forward' ? 1 : 0) : direction === 'forward' ? 0 : 1;

  return <MorphingPoints {...rest} targetProgress={targetProgress} />;
}
