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
import {
  assemblySplitRatio as defaultAssemblySplitRatio,
  gearRatio as defaultGearRatio,
} from '#routes/auth.$/splashback/auth-splashback.constants.js';

export type SplitMorphingPointsProperties = {
  /**
   * Sampled points from the source geometry (gear8 centered).
   */
  readonly sourcePoints: SampledPoints;
  /**
   * Sampled points for target A (gear12 at assembly position).
   */
  readonly targetPointsA: SampledPoints;
  /**
   * Sampled points for target B (gear8 at assembly position).
   */
  readonly targetPointsB: SampledPoints;
  /**
   * The ratio of points that go to target A (0-1).
   * For example, 0.6 means 60% of points morph to target A, 40% to target B.
   * @default 0.6
   */
  readonly splitRatio?: number;
  /**
   * Target morph progress (0 = source, 1 = targets).
   * The component will animate smoothly towards this value.
   */
  readonly targetProgress: number;
  /**
   * Animation speed for progress interpolation.
   * @default 2
   */
  readonly animationSpeed?: number;
  /**
   * Source color for all particles (gear8 blue).
   * @default '#5B8FD9'
   */
  readonly sourceColor?: string;
  /**
   * Target color for particles going to A (gear12 teal).
   * @default '#14b8a6'
   */
  readonly targetColorA?: string;
  /**
   * Target color for particles going to B (gear8 blue).
   * @default '#5B8FD9'
   */
  readonly targetColorB?: string;
  /**
   * Point size in pixels.
   * @default 2
   */
  readonly pointSize?: number;
  /**
   * Explosion strength - how far particles expand at midpoint.
   * @default 2
   */
  readonly explosionStrength?: number;
  /**
   * Opacity of the point cloud (0 to 1).
   * Used for crossfade transitions.
   * @default 1
   */
  readonly opacity?: number;
  /**
   * Ref to shared rotation value from parent (shared with assembly meshes).
   * When provided, this ref is read each frame for rotation instead of
   * internal rotation accumulation. This ensures seamless crossfade.
   */
  readonly sharedRotationRef?: React.RefObject<number>;
  /**
   * Gear ratio for counter-rotation (gear12Teeth / gear8Teeth).
   * @default 1.5
   */
  readonly gearRatio?: number;
  /**
   * X offset for gear12 position in assembly.
   * @default 0
   */
  readonly gear12OffsetX?: number;
  /**
   * X offset for gear8 position in assembly.
   * @default 0
   */
  readonly gear8OffsetX?: number;
  /**
   * Initial phase offset for gear8 (for mesh alignment).
   * @default 0
   */
  readonly gear8PhaseOffset?: number;
  /**
   * Called when morph animation reaches the target progress.
   * Provides the final Y rotation value for syncing with target mesh.
   */
  readonly onMorphComplete?: (finalRotationY: number) => void;
  /**
   * Called every frame with the current morph progress (0 to 1).
   * Used by parent to animate the assembly tilt in sync with morph progress.
   */
  readonly onProgressChange?: (progress: number) => void;
};

/**
 * A Three.js Points component that morphs from a single source to two different targets.
 *
 * This component:
 * - Renders TWO separate point groups (one for each target gear)
 * - Each group can counter-rotate independently like the assembly meshes
 * - Smoothly animates progress towards the target
 * - Provides explosion and swirl effects during transition
 * - Supports independent color interpolation for each target group
 *
 * @example
 * ```tsx
 * <SplitMorphingPoints
 *   sourcePoints={gear8Points}
 *   targetPointsA={assemblyGear12Points}
 *   targetPointsB={assemblyGear8Points}
 *   targetProgress={1}
 *   sourceColor="#5B8FD9"
 *   targetColorA="#14b8a6"
 *   targetColorB="#5B8FD9"
 *   isCounterRotating={true}
 *   gear12OffsetX={-5}
 *   gear8OffsetX={5}
 *   onMorphComplete={() => console.log('Split morph complete!')}
 * />
 * ```
 */
export function SplitMorphingPoints({
  sourcePoints,
  targetPointsA,
  targetPointsB,
  splitRatio = defaultAssemblySplitRatio,
  targetProgress,
  animationSpeed = 2,
  /* oxlint-disable tau-lint/no-hardcoded-color -- Three.js point colors */
  sourceColor = '#5B8FD9',
  targetColorA = '#14b8a6',
  targetColorB = '#5B8FD9',
  /* oxlint-enable tau-lint/no-hardcoded-color */
  pointSize = 2,
  explosionStrength = 2,
  opacity = 1,
  sharedRotationRef,
  gearRatio = defaultGearRatio,
  gear12OffsetX = 0,
  gear8OffsetX = 0,
  gear8PhaseOffset = 0,
  onMorphComplete,
  onProgressChange,
}: SplitMorphingPointsProperties): React.JSX.Element {
  const backend = useThreeGraphicsBackend();
  const gear12NodeHandlesRef = useRef<ReturnType<typeof createMorphingPointsNodeMaterial>['handles'] | undefined>(
    undefined,
  );
  const gear8NodeHandlesRef = useRef<ReturnType<typeof createMorphingPointsNodeMaterial>['handles'] | undefined>(
    undefined,
  );

  const gear12PointsRef = useRef<Points>(null);
  const gear8PointsRef = useRef<Points>(null);
  const gear12RotationRef = useRef<Group>(null);
  const gear8RotationRef = useRef<Group>(null);
  const containerRef = useRef<Group>(null);

  // Morph animation state
  const morphProgressRef = useRef(0);
  const morphHasReachedTargetRef = useRef(false);
  const morphPreviousTargetRef = useRef(targetProgress);

  // Calculate the split point
  const pointCount = sourcePoints.positions.length / 3;
  const pointCountA = Math.floor(pointCount * splitRatio);

  // Create geometry for gear12 points (first pointCountA points)
  const gear12Geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    // Extract positions for gear12 subset
    const positions = new Float32Array(pointCountA * 3);
    const targetPositions = new Float32Array(pointCountA * 3);
    const randomOffsets = new Float32Array(pointCountA);

    for (let i = 0; i < pointCountA; i++) {
      positions[i * 3] = sourcePoints.positions[i * 3] ?? 0;
      positions[i * 3 + 1] = sourcePoints.positions[i * 3 + 1] ?? 0;
      positions[i * 3 + 2] = sourcePoints.positions[i * 3 + 2] ?? 0;

      // Target positions need to be relative to the gear12 group position
      // So subtract the gear12 offset since the group will add it back
      targetPositions[i * 3] = (targetPointsA.positions[i * 3] ?? 0) - gear12OffsetX;
      targetPositions[i * 3 + 1] = targetPointsA.positions[i * 3 + 1] ?? 0;
      targetPositions[i * 3 + 2] = targetPointsA.positions[i * 3 + 2] ?? 0;

      randomOffsets[i] = sourcePoints.randomOffsets[i] ?? Math.random();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3));
    geo.setAttribute('aRandomOffset', new THREE.BufferAttribute(randomOffsets, 1));

    return geo;
  }, [sourcePoints, targetPointsA, pointCountA, gear12OffsetX]);

  // Create geometry for gear8 points (remaining points)
  const gear8Geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pointCountB = pointCount - pointCountA;

    // Extract positions for gear8 subset
    const positions = new Float32Array(pointCountB * 3);
    const targetPositions = new Float32Array(pointCountB * 3);
    const randomOffsets = new Float32Array(pointCountB);

    for (let i = 0; i < pointCountB; i++) {
      const sourceIndex = pointCountA + i;
      positions[i * 3] = sourcePoints.positions[sourceIndex * 3] ?? 0;
      positions[i * 3 + 1] = sourcePoints.positions[sourceIndex * 3 + 1] ?? 0;
      positions[i * 3 + 2] = sourcePoints.positions[sourceIndex * 3 + 2] ?? 0;

      // Target positions need to be relative to the gear8 group position
      // So subtract the gear8 offset since the group will add it back
      targetPositions[i * 3] = (targetPointsB.positions[sourceIndex * 3] ?? 0) - gear8OffsetX;
      targetPositions[i * 3 + 1] = targetPointsB.positions[sourceIndex * 3 + 1] ?? 0;
      targetPositions[i * 3 + 2] = targetPointsB.positions[sourceIndex * 3 + 2] ?? 0;

      randomOffsets[i] = sourcePoints.randomOffsets[sourceIndex] ?? Math.random();
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aTargetPosition', new THREE.BufferAttribute(targetPositions, 3));
    geo.setAttribute('aRandomOffset', new THREE.BufferAttribute(randomOffsets, 1));

    return geo;
  }, [sourcePoints, targetPointsB, pointCount, pointCountA, gear8OffsetX]);

  // Create materials for each group
  const gear12Material = useMemo(() => {
    if (backend === 'webgpu') {
      const built = createMorphingPointsNodeMaterial({
        color: sourceColor,
        targetColor: targetColorA,
        pointSize,
        explosionStrength,
      });
      gear12NodeHandlesRef.current = built.handles;
      return built.material;
    }

    gear12NodeHandlesRef.current = undefined;
    return createMorphingPointsMaterial({
      color: sourceColor,
      targetColor: targetColorA,
      pointSize,
      explosionStrength,
    });
  }, [backend, explosionStrength, pointSize, sourceColor, targetColorA]);

  const gear8Material = useMemo(() => {
    if (backend === 'webgpu') {
      const built = createMorphingPointsNodeMaterial({
        color: sourceColor,
        targetColor: targetColorB,
        pointSize,
        explosionStrength,
      });
      gear8NodeHandlesRef.current = built.handles;
      return built.material;
    }

    gear8NodeHandlesRef.current = undefined;
    return createMorphingPointsMaterial({
      color: sourceColor,
      targetColor: targetColorB,
      pointSize,
      explosionStrength,
    });
  }, [backend, explosionStrength, pointSize, sourceColor, targetColorB]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      gear12Geometry.dispose();
      gear8Geometry.dispose();
      gear12Material.dispose();
      gear8Material.dispose();
    };
  }, [gear12Geometry, gear8Geometry, gear12Material, gear8Material]);

  useFrame((state, delta) => {
    // Animate progress towards target
    const progress = updateMorphAnimation({
      state: {
        progressRef: morphProgressRef,
        hasReachedTargetRef: morphHasReachedTargetRef,
        previousTargetRef: morphPreviousTargetRef,
      },
      targetProgress,
      delta,
      animationSpeed,
      onComplete() {
        onMorphComplete?.(sharedRotationRef?.current ?? 0);
      },
    });

    // Notify parent of progress change (for animating assembly tilt)
    onProgressChange?.(progress);

    if (gear12NodeHandlesRef.current && gear8NodeHandlesRef.current) {
      for (const handles of [gear12NodeHandlesRef.current, gear8NodeHandlesRef.current]) {
        handles.uProgress.value = progress;
        handles.uTime.value = state.clock.elapsedTime;
        handles.uOpacity.value = opacity;
      }
    } else {
      updateMorphProgress(gear12Material as THREE.ShaderMaterial, progress);
      updateMorphTime(gear12Material as THREE.ShaderMaterial, state.clock.elapsedTime);
      updateMorphOpacity(gear12Material as THREE.ShaderMaterial, opacity);

      updateMorphProgress(gear8Material as THREE.ShaderMaterial, progress);
      updateMorphTime(gear8Material as THREE.ShaderMaterial, state.clock.elapsedTime);
      updateMorphOpacity(gear8Material as THREE.ShaderMaterial, opacity);
    }

    // Animate group positions and rotations based on progress
    // At progress=0, both groups are at origin (source gear8 position)
    // At progress=1, they're at their target assembly positions
    if (gear12RotationRef.current && gear8RotationRef.current) {
      // Position animation
      gear12RotationRef.current.position.x = gear12OffsetX * progress;
      gear8RotationRef.current.position.x = gear8OffsetX * progress;

      // Rotation uses shared ref value from parent (same as assembly meshes)
      // This ensures seamless transition during crossfade
      const rotation = sharedRotationRef?.current ?? 0;
      gear12RotationRef.current.rotation.z = rotation;
      gear8RotationRef.current.rotation.z = -rotation * gearRatio + gear8PhaseOffset;
    }
  });

  return (
    <group ref={containerRef}>
      {/* Gear12 points - positioned and rotating */}
      <group ref={gear12RotationRef}>
        <points ref={gear12PointsRef} geometry={gear12Geometry} material={gear12Material} />
      </group>

      {/* Gear8 points - positioned and counter-rotating */}
      <group ref={gear8RotationRef}>
        <points ref={gear8PointsRef} geometry={gear8Geometry} material={gear8Material} />
      </group>
    </group>
  );
}
