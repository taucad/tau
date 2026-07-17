import { useRef, useMemo, useEffect } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Points, Group } from 'three';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { createMorphingPointsNodeMaterial } from '#components/geometry/splash/morphing-points-material.node.js';
import {
  createMorphingPointsMaterial,
  updateMorphProgress,
  updateMorphTime,
  updateMorphOpacity,
  updateMorphPointer,
} from '#components/geometry/splash/morphing-points-material.js';
import {
  updateMorphAnimation,
  resetMorphAnimationOnTargetChange,
} from '#components/geometry/splash/morph-animation.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

/**
 * Per-frame pointer repulsion state, in **world space** — the component
 * converts into the point cloud's local space each frame, so the effect stays
 * under the cursor while the cloud auto-rotates. Passed by reference so the
 * driver (e.g. the hero canvas) can mutate it each frame without triggering
 * React re-renders. `strength: 0` disables the effect.
 */
export type MorphingPointerState = {
  position: THREE.Vector3;
  strength: number;
  radius: number;
};

/** Scratch vector for the per-frame world→local pointer conversion. */
const localPointerScratch = new THREE.Vector3();

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
   * Enable automatic rotation during morph.
   * @default false
   */
  readonly enableAutoRotate?: boolean;
  /**
   * Auto-rotation speed in radians per second.
   * @default 0.5
   */
  readonly autoRotateSpeed?: number;
  /**
   * Axis for the auto-rotation. `y` tumbles the cloud (auth splash); `z` spins
   * a camera-facing disc in-plane about its own axis (hero gear) so a flat
   * model never presents edge-on.
   * @default 'y'
   */
  readonly autoRotateAxis?: 'y' | 'z';
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
  /**
   * Optional pointer repulsion state, read every frame. Omit (or keep
   * `strength: 0`) to disable — the auth splashback does not pass this, so its
   * behaviour is unchanged.
   */
  readonly pointerRef?: RefObject<MorphingPointerState | undefined>;
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
  autoRotateAxis = 'y',
  opacity = 1,
  onMorphComplete,
  pointerRef,
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

    // Auto-rotate around the configured axis
    if (enableAutoRotate) {
      currentRotationYaxisRef.current += autoRotateSpeed * delta;
      rotationGroupRef.current.rotation[autoRotateAxis] = currentRotationYaxisRef.current;
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

    const pointer = pointerRef?.current;

    // The shader displaces in object space, but the pointer arrives in world
    // space — convert through the (auto-rotating) group chain so the effect
    // tracks the cursor instead of smearing around the rotation.
    if (pointer) {
      pointsRef.current.updateWorldMatrix(true, false);
      pointsRef.current.worldToLocal(localPointerScratch.copy(pointer.position));
    }

    if (nodeHandlesRef.current) {
      nodeHandlesRef.current.uProgress.value = currentProgress;
      nodeHandlesRef.current.uTime.value = state.clock.elapsedTime;
      nodeHandlesRef.current.uOpacity.value = opacity;
      if (pointer) {
        (nodeHandlesRef.current.uPointer.value as THREE.Vector3).copy(localPointerScratch);
        nodeHandlesRef.current.uPointerStrength.value = pointer.strength;
        nodeHandlesRef.current.uPointerRadius.value = pointer.radius;
      }
    } else {
      const shaderMaterial = material as THREE.ShaderMaterial;
      updateMorphProgress(shaderMaterial, currentProgress);
      updateMorphTime(shaderMaterial, state.clock.elapsedTime);
      updateMorphOpacity(shaderMaterial, opacity);
      if (pointer) {
        updateMorphPointer(shaderMaterial, localPointerScratch, pointer.strength);
        if (shaderMaterial.uniforms['uPointerRadius']) {
          shaderMaterial.uniforms['uPointerRadius'].value = pointer.radius;
        }
      }
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
