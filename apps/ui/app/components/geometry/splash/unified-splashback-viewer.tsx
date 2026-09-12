import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { Group } from 'three';
import type { Geometry } from '@taucad/types';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { MorphingPoints } from '#components/geometry/splash/morphing-points.js';
import { SplitMorphingPoints } from '#components/geometry/splash/split-morphing-points.js';
import { PreviewLights } from '#components/geometry/splash/preview-lights.js';
import { updateCrossfade, startCrossfade } from '#components/geometry/splash/crossfade-animation.js';
import { usePreloadedMeshes } from '#components/geometry/splash/use-preloaded-meshes.js';
import type { LoadedMesh } from '#components/geometry/splash/use-preloaded-meshes.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';
import {
  assemblySplitRatio as assemblySplitRatioConstant,
  gearRatio,
  gear12AssemblyOffsetX,
  gear8AssemblyOffsetX,
  gear8PhaseOffset,
} from '#components/geometry/splash/auth-splashback.constants.js';
import { cn } from '@taucad/ui/utils/cn';
import {
  probeWebGpuSupport,
  mergeGraphicsBackendWithQueryOverride,
  resolveGraphicsBackendPreference,
} from '#components/geometry/graphics/graphics-backend.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Phase of the splashback animation.
 *
 * The full cycle: `loading` (cached prep) -> `loadingMorphing` (atoms converge to gear12) ->
 * `loadingCrossfading` (point cloud -> gear12 mesh) -> `gear12` -> existing gear12->gear8->assembly flow ->
 * `unloadingCrossfading` (assembly meshes -> per-gear point clouds) -> `unloadingMorphing` (matter -> abyss).
 */
export type SplashbackPhase =
  | 'loading'
  | 'loadingMorphing'
  | 'loadingCrossfading'
  | 'gear12'
  | 'preparingMorph'
  | 'morphing'
  | 'crossfading'
  | 'gear8'
  | 'preparingMorph2'
  | 'morphingToAssembly'
  | 'crossfadingToAssembly'
  | 'assembly'
  | 'unloadingCrossfading'
  | 'unloadingMorphing';

type UnifiedSplashbackViewerProperties = {
  /** Current phase of the animation */
  readonly phase: SplashbackPhase;
  /** Gear12 geometry (GLTF format) */
  readonly gear12Geometry?: Geometry;
  /** Gear8 geometry (GLTF format) */
  readonly gear8Geometry?: Geometry;
  /** Sampled points from gear12 for morphing (also reused as unloading source) */
  readonly gear12Points?: SampledPoints;
  /** Sampled points from gear8 for morphing (also reused as unloading source) */
  readonly gear8Points?: SampledPoints;
  /** Sampled points for gear12 at assembly position (for split morph) */
  readonly assemblyGear12Points?: SampledPoints;
  /** Sampled points for gear8 at assembly position (for split morph) */
  readonly assemblyGear8Points?: SampledPoints;
  /** Split ratio for assembly morph (0.6 = 60% to gear12, 40% to gear8) */
  readonly assemblySplitRatio?: number;
  /** Duration of crossfade animation in ms */
  readonly crossfadeDuration?: number;
  /** Duration of morph animation in ms */
  readonly morphDuration?: number;
  /** Scatter cloud the loading morph converges from and the unloading morph disperses back into */
  readonly loadingScatterPoints?: SampledPoints;
  /** Additional CSS classes */
  readonly className?: string;
  /** Called when user interacts with the viewer */
  readonly onInteraction?: () => void;
  /** Called when the loading scatter -> gear12 morph completes */
  readonly onLoadingMorphComplete?: () => void;
  /** Called when the loading particle -> gear12 mesh crossfade completes */
  readonly onLoadingCrossfadeComplete?: () => void;
  /** Called when morph animation completes (gear12 -> gear8) */
  readonly onMorphComplete?: () => void;
  /** Called when crossfade completes (gear12->gear8), with final rotation */
  readonly onCrossfadeComplete?: (finalRotationY: number) => void;
  /** Called when morph2 animation completes (gear8 -> assembly) */
  readonly onMorph2Complete?: () => void;
  /** Called when phase transition animation completes */
  readonly onPhaseTransitionComplete?: () => void;
  /** Called when the assembly mesh -> point cloud crossfade finishes */
  readonly onUnloadingMeshFadedOut?: () => void;
  /** Called when the unload outward morph reaches the abyss */
  readonly onUnloadingMorphComplete?: () => void;
};

// ============================================================================
// Constants
// ============================================================================

/** Auto-rotation speed in radians per second */
const autoRotateSpeed = 0.5;

/** Gear colors - using constants */
/* oxlint-disable tau-lint/no-hardcoded-color -- Three.js gear colors */
const gear12Color = '#14b8a6'; // Teal
const gear8Color = '#5B8FD9'; // Blue
/* oxlint-enable tau-lint/no-hardcoded-color */

/** Forward tilt the assembly eases into during the split morph (its parent supplies the Y tumble). */
const assemblyTilt = Math.PI / 12;

/** Grain size in world millimetres — about four device pixels at the camera distance. */
const grainSize = 0.4;

/**
 * Camera distance along +z. With a 45° vertical fov this frames a half-height of
 * ~18.6 units at z=0 — the meshed assembly's widest reach is 17.5, so the pair
 * clears the viewport edges at every point of its auto-rotation.
 */
const cameraDistance = 45;

const setMeshOpacity = (mesh: LoadedMesh, opacity: number): void => {
  mesh.material.opacity = opacity;
};

// ============================================================================
// Internal Scene Components
// ============================================================================

type PointCloudContentProperties = {
  readonly sourcePoints: SampledPoints;
  readonly targetPoints: SampledPoints;
  readonly sourceColor: string;
  readonly targetColor: string;
  readonly isVisible: boolean;
  readonly targetProgress?: number;
  readonly opacity?: number;
  readonly duration: number;
  readonly onMorphComplete?: (finalRotationY: number) => void;
};

/**
 * Renders the morphing point cloud.
 */
function PointCloudContent({
  sourcePoints,
  targetPoints,
  sourceColor,
  targetColor,
  isVisible,
  targetProgress = 1,
  opacity = 1,
  duration,
  onMorphComplete,
}: PointCloudContentProperties): React.JSX.Element | undefined {
  if (!isVisible) {
    return undefined;
  }

  return (
    <MorphingPoints
      sourcePoints={sourcePoints}
      targetPoints={targetPoints}
      targetProgress={targetProgress}
      duration={duration}
      sourceColor={sourceColor}
      targetColor={targetColor}
      pointSize={grainSize}
      explosionStrength={3}
      opacity={opacity}
      onMorphComplete={onMorphComplete}
    />
  );
}

// ============================================================================
// Main Scene Content
// ============================================================================

type SceneContentProperties = {
  readonly phase: SplashbackPhase;
  readonly gear12Points?: SampledPoints;
  readonly gear8Points?: SampledPoints;
  readonly assemblyGear12Points?: SampledPoints;
  readonly assemblyGear8Points?: SampledPoints;
  readonly assemblySplitRatio?: number;
  readonly crossfadeDuration: number;
  readonly morphDuration: number;
  readonly loadingScatterPoints?: SampledPoints;
  // Preloaded meshes (loaded eagerly, not phase-dependent)
  readonly gear12Mesh?: LoadedMesh;
  readonly gear8Mesh?: LoadedMesh;
  readonly assemblyGear12Mesh?: LoadedMesh;
  readonly assemblyGear8Mesh?: LoadedMesh;
  readonly onLoadingMorphComplete?: () => void;
  readonly onLoadingCrossfadeComplete?: () => void;
  readonly onMorphComplete?: () => void;
  readonly onCrossfadeComplete?: (finalRotationY: number) => void;
  readonly onMorph2Complete?: () => void;
  readonly onPhaseTransitionComplete?: () => void;
  readonly onUnloadingMeshFadedOut?: () => void;
  readonly onUnloadingMorphComplete?: () => void;
};

// oxlint-disable-next-line complexity -- complex logic
function SceneContent({
  phase,
  gear12Points,
  gear8Points,
  assemblyGear12Points,
  assemblyGear8Points,
  assemblySplitRatio = assemblySplitRatioConstant,
  crossfadeDuration,
  morphDuration,
  loadingScatterPoints,
  // Preloaded meshes (already loaded, no async loading needed)
  gear12Mesh,
  gear8Mesh,
  assemblyGear12Mesh,
  assemblyGear8Mesh,
  onLoadingMorphComplete,
  onLoadingCrossfadeComplete,
  onMorphComplete,
  onCrossfadeComplete,
  onMorph2Complete,
  onPhaseTransitionComplete,
  onUnloadingMeshFadedOut,
  onUnloadingMorphComplete,
}: SceneContentProperties): React.JSX.Element {
  const rotatingGroupRef = useRef<Group>(null);
  const currentRotationYaxisRef = useRef(0);

  // Crossfade state refs (loading particles -> gear12 mesh)
  const loadingCrossfadeProgressRef = useRef(0);
  const loadingCrossfadeIsActiveRef = useRef(false);
  const loadingCrossfadeHasSentCompleteRef = useRef(false);
  const [loadingCrossfadeOpacity, setLoadingCrossfadeOpacity] = useState({
    pointCloud: 1,
    mesh: 0,
  });

  // Crossfade state refs (gear12 -> gear8)
  const crossfadeProgressRef = useRef(0);
  const crossfadeIsActiveRef = useRef(false);
  const crossfadeHasSentCompleteRef = useRef(false);
  const [crossfadeOpacity, setCrossfadeOpacity] = useState({
    pointCloud: 1,
    mesh: 0,
  });

  // Split morph crossfade state refs (gear8 -> assembly)
  const splitCrossfadeProgressRef = useRef(0);
  const splitCrossfadeIsActiveRef = useRef(false);
  const splitCrossfadeHasSentCompleteRef = useRef(false);
  const [splitCrossfadeOpacity, setSplitCrossfadeOpacity] = useState({
    pointCloud: 1,
    mesh: 0,
  });

  // Unloading crossfade state refs (assembly meshes -> per-gear point clouds)
  const unloadingCrossfadeProgressRef = useRef(0);
  const unloadingCrossfadeIsActiveRef = useRef(false);
  const unloadingCrossfadeHasSentCompleteRef = useRef(false);
  const [unloadingCrossfadeOpacity, setUnloadingCrossfadeOpacity] = useState({
    mesh: 1,
    pointCloud: 0,
  });

  // Refs for counter-rotation of assembly meshes
  const assemblyGear12RotationRef = useRef<Group>(null);
  const assemblyGear8RotationRef = useRef<Group>(null);

  // Shared rotation accumulator for seamless point cloud -> mesh transition
  // Both the split point cloud and assembly meshes use this same value
  const assemblyRotationRef = useRef(0);

  // Split morph progress for animating assembly tilt
  const splitMorphProgressRef = useRef(0);
  const splitTiltRef = useRef<Group>(null);

  // Derive visibility from phase
  // Meshes stay mounted into the morph that dissolves them so they can fade out under the grains
  const showGear12 =
    phase === 'gear12' || phase === 'preparingMorph' || phase === 'loadingCrossfading' || phase === 'morphing';
  // The atom cloud is the loop seam: the reversed split morph lands the dispersed assembly
  // exactly on it, it idles through the reset and prompt1 (phase 'loading'), then converges into gear12.
  const showLoadingPointCloud = phase === 'loading' || phase === 'loadingMorphing' || phase === 'loadingCrossfading';
  const loadingTargetProgress = phase === 'loadingMorphing' || phase === 'loadingCrossfading' ? 1 : 0;
  const showPointCloud = phase === 'morphing' || phase === 'crossfading';
  const showGear8Mesh =
    phase === 'crossfading' || phase === 'gear8' || phase === 'preparingMorph2' || phase === 'morphingToAssembly';
  const showSplitPointCloud = phase === 'morphingToAssembly' || phase === 'crossfadingToAssembly';
  // Assembly meshes shown during crossfade AND assembly phases AND while unloading meshes are still fading out
  const showAssemblyMeshes =
    phase === 'crossfadingToAssembly' || phase === 'assembly' || phase === 'unloadingCrossfading';
  // The split cloud run in reverse: assembly surfaces -> the loading scatter cloud
  const showUnloadingPointCloud = phase === 'unloadingCrossfading' || phase === 'unloadingMorphing';
  // Track if we're in the counter-rotating assembly phase (auto-rotate continues through unload)
  const isAssemblyRotating = phase === 'assembly' || phase === 'unloadingCrossfading' || phase === 'unloadingMorphing';

  // Start loading crossfade when phase transitions to loadingCrossfading.
  // Snap mesh opacity to 0 first so it doesn't flash at full opacity for one frame.
  useEffect(() => {
    if (gear12Mesh && phase === 'loadingCrossfading' && !loadingCrossfadeIsActiveRef.current) {
      setMeshOpacity(gear12Mesh, 0);
      startCrossfade({
        progressRef: loadingCrossfadeProgressRef,
        isActiveRef: loadingCrossfadeIsActiveRef,
        hasSentCompleteRef: loadingCrossfadeHasSentCompleteRef,
      });
    }
  }, [gear12Mesh, phase]);

  // Start crossfade when phase transitions to crossfading (mesh is already preloaded)
  useEffect(() => {
    if (gear8Mesh && phase === 'crossfading' && !crossfadeIsActiveRef.current) {
      startCrossfade({
        progressRef: crossfadeProgressRef,
        isActiveRef: crossfadeIsActiveRef,
        hasSentCompleteRef: crossfadeHasSentCompleteRef,
      });
    }
  }, [gear8Mesh, phase]);

  // Start split crossfade when phase transitions to crossfadingToAssembly (meshes are already preloaded)
  useEffect(() => {
    if (
      assemblyGear12Mesh &&
      assemblyGear8Mesh &&
      phase === 'crossfadingToAssembly' &&
      !splitCrossfadeIsActiveRef.current
    ) {
      startCrossfade({
        progressRef: splitCrossfadeProgressRef,
        isActiveRef: splitCrossfadeIsActiveRef,
        hasSentCompleteRef: splitCrossfadeHasSentCompleteRef,
      });
    }
  }, [assemblyGear12Mesh, assemblyGear8Mesh, phase]);

  // Start unloading crossfade when phase enters unloadingCrossfading
  useEffect(() => {
    if (
      assemblyGear12Mesh &&
      assemblyGear8Mesh &&
      phase === 'unloadingCrossfading' &&
      !unloadingCrossfadeIsActiveRef.current
    ) {
      startCrossfade({
        progressRef: unloadingCrossfadeProgressRef,
        isActiveRef: unloadingCrossfadeIsActiveRef,
        hasSentCompleteRef: unloadingCrossfadeHasSentCompleteRef,
      });
    }
  }, [assemblyGear12Mesh, assemblyGear8Mesh, phase]);

  // The clouds report their own rotation on completion; the scene's Y tumble is owned
  // here and must not be overwritten — doing so snapped every solid away from its grains
  // on the first crossfade frame.
  const handleMorphComplete = useCallback(() => {
    onMorphComplete?.();
  }, [onMorphComplete]);

  const handleMorph2Complete = useCallback(() => {
    onMorph2Complete?.();
  }, [onMorph2Complete]);

  // Handle split morph progress change (for animating assembly tilt)
  const handleSplitMorphProgress = useCallback((progress: number) => {
    splitMorphProgressRef.current = progress;
  }, []);

  // Reset split morph progress when entering morphingToAssembly phase
  // This ensures the tilt starts from 0 on each animation loop
  useEffect(() => {
    if (phase === 'morphingToAssembly') {
      splitMorphProgressRef.current = 0;
    }
  }, [phase]);

  // Animation loop
  // oxlint-disable-next-line complexity -- shared frame loop
  useFrame((_, delta) => {
    if (!rotatingGroupRef.current) {
      return;
    }

    // Auto-rotate the entire scene (including assembly)
    currentRotationYaxisRef.current += autoRotateSpeed * delta;
    rotatingGroupRef.current.rotation.y = currentRotationYaxisRef.current;

    // Loading crossfade animation (atoms point cloud -> gear12 mesh)
    const gear12Opacity = updateCrossfade({
      state: {
        progressRef: loadingCrossfadeProgressRef,
        isActiveRef: loadingCrossfadeIsActiveRef,
        hasSentCompleteRef: loadingCrossfadeHasSentCompleteRef,
      },
      delta,
      duration: crossfadeDuration,
      onComplete() {
        onLoadingCrossfadeComplete?.();
      },
    });

    if (gear12Opacity) {
      setLoadingCrossfadeOpacity({
        pointCloud: gear12Opacity.source,
        mesh: gear12Opacity.target,
      });
      if (gear12Mesh) {
        setMeshOpacity(gear12Mesh, gear12Opacity.target);
      }
    }

    // Crossfade animation (gear12 -> gear8)
    const gear8Opacity = updateCrossfade({
      state: {
        progressRef: crossfadeProgressRef,
        isActiveRef: crossfadeIsActiveRef,
        hasSentCompleteRef: crossfadeHasSentCompleteRef,
      },
      delta,
      duration: crossfadeDuration,
      onComplete() {
        onCrossfadeComplete?.(currentRotationYaxisRef.current);
      },
    });

    if (gear8Opacity) {
      setCrossfadeOpacity({
        pointCloud: gear8Opacity.source,
        mesh: gear8Opacity.target,
      });
      if (gear8Mesh) {
        setMeshOpacity(gear8Mesh, gear8Opacity.target);
      }
    }

    // Split crossfade animation (gear8 -> assembly)
    const assemblyOpacity = updateCrossfade({
      state: {
        progressRef: splitCrossfadeProgressRef,
        isActiveRef: splitCrossfadeIsActiveRef,
        hasSentCompleteRef: splitCrossfadeHasSentCompleteRef,
      },
      delta,
      duration: crossfadeDuration,
      onComplete() {
        onPhaseTransitionComplete?.();
      },
    });

    if (assemblyOpacity) {
      setSplitCrossfadeOpacity({
        pointCloud: assemblyOpacity.source,
        mesh: assemblyOpacity.target,
      });
      if (assemblyGear12Mesh) {
        setMeshOpacity(assemblyGear12Mesh, assemblyOpacity.target);
      }

      if (assemblyGear8Mesh) {
        setMeshOpacity(assemblyGear8Mesh, assemblyOpacity.target);
      }
    }

    // Solid -> grains: the mesh dissolves under the cloud over the first crossfadeDuration of
    // its morph, while the eased timeline still holds the grains on the surface.
    const fadeStep = (delta * 1000) / crossfadeDuration;
    if (phase === 'morphing' && gear12Mesh) {
      setMeshOpacity(gear12Mesh, Math.max(0, gear12Mesh.material.opacity - fadeStep));
    }

    if (phase === 'morphingToAssembly' && gear8Mesh) {
      setMeshOpacity(gear8Mesh, Math.max(0, gear8Mesh.material.opacity - fadeStep));
    }

    // Unloading crossfade animation (assembly meshes -> per-gear point clouds)
    const unloadingOpacity = updateCrossfade({
      state: {
        progressRef: unloadingCrossfadeProgressRef,
        isActiveRef: unloadingCrossfadeIsActiveRef,
        hasSentCompleteRef: unloadingCrossfadeHasSentCompleteRef,
      },
      delta,
      duration: crossfadeDuration,
      onComplete() {
        onUnloadingMeshFadedOut?.();
      },
    });

    if (unloadingOpacity) {
      setUnloadingCrossfadeOpacity({
        mesh: unloadingOpacity.source,
        pointCloud: unloadingOpacity.target,
      });
      if (assemblyGear12Mesh) {
        setMeshOpacity(assemblyGear12Mesh, unloadingOpacity.source);
      }

      if (assemblyGear8Mesh) {
        setMeshOpacity(assemblyGear8Mesh, unloadingOpacity.source);
      }
    }

    // Accumulate rotation for assembly (point cloud, meshes, AND unload clouds use this)
    // Start accumulating once the split point cloud appears; keep going through unload.
    const isAssemblyAnimating = showSplitPointCloud || isAssemblyRotating;

    if (isAssemblyAnimating) {
      const rotationSpeed = 0.3;
      assemblyRotationRef.current += rotationSpeed * delta;
    }

    // Apply shared rotation to assembly meshes (the unloading cloud reads the same ref)
    if (assemblyGear12RotationRef.current && assemblyGear8RotationRef.current) {
      assemblyGear12RotationRef.current.rotation.z = assemblyRotationRef.current;
      assemblyGear8RotationRef.current.rotation.z = -assemblyRotationRef.current * gearRatio + gear8PhaseOffset;
    }

    // Ease the assembly's forward tilt in with the split morph so it reaches the
    // meshes' resting tilt exactly as the crossfade begins, and back out with the unload
    if (splitTiltRef.current) {
      splitTiltRef.current.rotation.x = assemblyTilt * splitMorphProgressRef.current;
    }
  });

  const loadingPointCloudOpacity = phase === 'loadingCrossfading' ? loadingCrossfadeOpacity.pointCloud : 1;

  return (
    <group ref={rotatingGroupRef}>
      {/* Coordinate system correction (gear12/gear8 share this frame) */}
      <group rotation={[Math.PI, 0, 0]}>
        {/* Loading atoms-to-matter point cloud (scatter -> gear12) — nested here so it spins
            with the gear12 mesh during the loading crossfade and the cross-handover is rotation-aligned.
            onMorphComplete fires once when targetProgress hits 1 (i.e. atoms reach the gear12 surface);
            MorphingPoints internally gates the callback via hasReachedTargetRef so it doesn't refire
            during the trailing loadingCrossfading phase. */}
        {showLoadingPointCloud && loadingScatterPoints && gear12Points ? (
          <PointCloudContent
            sourcePoints={loadingScatterPoints}
            targetPoints={gear12Points}
            sourceColor={gear12Color}
            targetColor={gear12Color}
            isVisible={showLoadingPointCloud}
            targetProgress={loadingTargetProgress}
            opacity={loadingPointCloudOpacity}
            duration={morphDuration}
            onMorphComplete={
              onLoadingMorphComplete
                ? () => {
                    onLoadingMorphComplete();
                  }
                : undefined
            }
          />
        ) : undefined}

        {/* Gear12 mesh - preloaded, visibility controlled by phase */}
        {showGear12 && gear12Mesh ? <primitive object={gear12Mesh.scene} /> : undefined}

        {/* Point cloud for morphing (gear12 -> gear8) */}
        {showPointCloud && gear12Points && gear8Points ? (
          <PointCloudContent
            sourcePoints={gear12Points}
            targetPoints={gear8Points}
            sourceColor={gear12Color}
            targetColor={gear8Color}
            isVisible={showPointCloud}
            opacity={phase === 'crossfading' ? crossfadeOpacity.pointCloud : 1}
            duration={morphDuration}
            onMorphComplete={handleMorphComplete}
          />
        ) : undefined}

        {/* Gear8 mesh for crossfade and display - preloaded */}
        {showGear8Mesh && gear8Mesh ? <primitive object={gear8Mesh.scene} /> : undefined}
      </group>

      {/* Split point cloud for morphing (gear8 -> assembly) - tilt animated via splitTiltRef.
          The unloading cloud is the same component mounted at progress 1 and driven back to 0:
          assembly surfaces -> the loading scatter cloud, offsets/spin/tilt easing out with it,
          so its final frame is pixel-identical to the idle atom cloud the next cycle starts from. */}
      {(showSplitPointCloud || showUnloadingPointCloud) && assemblyGear12Points && assemblyGear8Points ? (
        <group ref={splitTiltRef}>
          <group rotation={[Math.PI, 0, 0]}>
            {showUnloadingPointCloud && loadingScatterPoints ? (
              <SplitMorphingPoints
                sourcePoints={loadingScatterPoints}
                targetPointsA={assemblyGear12Points}
                targetPointsB={assemblyGear8Points}
                splitRatio={assemblySplitRatio}
                initialProgress={1}
                targetProgress={phase === 'unloadingMorphing' ? 0 : 1}
                duration={morphDuration}
                sourceColor={gear12Color}
                targetColorA={gear12Color}
                targetColorB={gear8Color}
                pointSize={grainSize}
                explosionStrength={3}
                opacity={phase === 'unloadingCrossfading' ? unloadingCrossfadeOpacity.pointCloud : 1}
                sharedRotationRef={assemblyRotationRef}
                gearRatio={gearRatio}
                gear12OffsetX={gear12AssemblyOffsetX}
                gear8OffsetX={gear8AssemblyOffsetX}
                gear8PhaseOffset={gear8PhaseOffset}
                onMorphComplete={phase === 'unloadingMorphing' ? onUnloadingMorphComplete : undefined}
                onProgressChange={handleSplitMorphProgress}
              />
            ) : undefined}
            {showSplitPointCloud && gear8Points ? (
              <SplitMorphingPoints
                sourcePoints={gear8Points}
                targetPointsA={assemblyGear12Points}
                targetPointsB={assemblyGear8Points}
                splitRatio={assemblySplitRatio}
                targetProgress={1}
                duration={morphDuration}
                sourceColor={gear8Color}
                targetColorA={gear12Color}
                targetColorB={gear8Color}
                pointSize={grainSize}
                explosionStrength={3}
                opacity={phase === 'crossfadingToAssembly' ? splitCrossfadeOpacity.pointCloud : 1}
                sharedRotationRef={assemblyRotationRef}
                gearRatio={gearRatio}
                gear12OffsetX={gear12AssemblyOffsetX}
                gear8OffsetX={gear8AssemblyOffsetX}
                gear8PhaseOffset={gear8PhaseOffset}
                onMorphComplete={handleMorph2Complete}
                onProgressChange={handleSplitMorphProgress}
              />
            ) : undefined}
          </group>
        </group>
      ) : undefined}

      {/* Assembly meshes - counter-rotate at the shared value the split/unloading cloud reads,
          so both mesh <-> point handoffs have zero rotation snap. */}
      {showAssemblyMeshes && assemblyGear12Mesh && assemblyGear8Mesh ? (
        <group rotation={[assemblyTilt, 0, 0]}>
          <group rotation={[Math.PI, 0, 0]}>
            {/* Gear 12 - positioned to the left, counter-rotates during assembly phase */}
            <group ref={assemblyGear12RotationRef} position={[gear12AssemblyOffsetX, 0, 0]}>
              <primitive object={assemblyGear12Mesh.scene} />
            </group>

            {/* Gear 8 - positioned to the right with phase offset, counter-rotates during assembly phase */}
            <group
              ref={assemblyGear8RotationRef}
              position={[gear8AssemblyOffsetX, 0, 0]}
              rotation={[0, 0, gear8PhaseOffset]}
            >
              <primitive object={assemblyGear8Mesh.scene} />
            </group>
          </group>
        </group>
      ) : undefined}
    </group>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Unified splashback viewer with a single persistent Canvas.
 *
 * Features:
 * - Single WebGL context for all phases
 * - Atoms-to-matter loading: scatter -> gear12 morph -> mesh crossfade
 * - Seamless transitions between gear12 -> point cloud -> gear8 -> assembly
 * - Split point cloud morph from gear8 to assembly
 * - Matter-to-abyss unloading: assembly meshes -> per-gear point clouds -> outward dispersal
 * - Shared rotation group for synchronized animation
 * - Phase-based visibility control
 */
// oxlint-disable-next-line complexity -- thin pass-through over SceneContent
export function UnifiedSplashbackViewer({
  phase,
  gear12Geometry,
  gear8Geometry,
  gear12Points,
  gear8Points,
  assemblyGear12Points,
  assemblyGear8Points,
  assemblySplitRatio,
  crossfadeDuration = 50,
  morphDuration = 1400,
  loadingScatterPoints,
  className,
  onInteraction,
  onLoadingMorphComplete,
  onLoadingCrossfadeComplete,
  onMorphComplete,
  onCrossfadeComplete,
  onMorph2Complete,
  onPhaseTransitionComplete,
  onUnloadingMeshFadedOut,
  onUnloadingMorphComplete,
}: UnifiedSplashbackViewerProperties): React.JSX.Element {
  const dpr = Math.min(globalThis.devicePixelRatio, 2);

  const [splashGpuAvailable, setSplashGpuAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // async-iife: bootstrap — WebGPU probe completes after first paint; splash path cannot block effect return
    void (async (): Promise<void> => {
      const available = await probeWebGpuSupport();
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- effect cleanup can flip concurrently after probe resolves
      if (!cancelled) {
        setSplashGpuAvailable(available);
      }
    })();

    return (): void => {
      cancelled = true;
    };
  }, []);

  const splashMachineResolved = useMemo((): ResolvedGraphicsBackend => {
    return resolveGraphicsBackendPreference('webgpu', splashGpuAvailable);
  }, [splashGpuAvailable]);

  const splashGraphicsBackend = useMemo((): ResolvedGraphicsBackend => {
    return mergeGraphicsBackendWithQueryOverride(splashMachineResolved, 'webgpu', splashGpuAvailable);
  }, [splashGpuAvailable, splashMachineResolved]);

  const splashGl = useMemo(() => createTauR3fGlProp(splashGraphicsBackend), [splashGraphicsBackend]);

  // Preload all meshes eagerly when geometries become available
  // These persist across animation loops and are ready before morph completes
  const { gear12Mesh, gear8Mesh, assemblyGear12Mesh, assemblyGear8Mesh } = usePreloadedMeshes({
    gear12Geometry,
    gear8Geometry,
  });

  return (
    <Canvas key={splashGraphicsBackend} gl={splashGl} dpr={dpr} className={cn('bg-transparent', className)}>
      <ThreeGraphicsBackendProvider value={splashGraphicsBackend}>
        <PerspectiveCamera makeDefault position={[0, 0, cameraDistance]} fov={45} />

        <PreviewLights />

        <SceneContent
          phase={phase}
          gear12Points={gear12Points}
          gear8Points={gear8Points}
          assemblyGear12Points={assemblyGear12Points}
          assemblyGear8Points={assemblyGear8Points}
          assemblySplitRatio={assemblySplitRatio}
          crossfadeDuration={crossfadeDuration}
          morphDuration={morphDuration}
          loadingScatterPoints={loadingScatterPoints}
          gear12Mesh={gear12Mesh}
          gear8Mesh={gear8Mesh}
          assemblyGear12Mesh={assemblyGear12Mesh}
          assemblyGear8Mesh={assemblyGear8Mesh}
          onLoadingMorphComplete={onLoadingMorphComplete}
          onLoadingCrossfadeComplete={onLoadingCrossfadeComplete}
          onMorphComplete={onMorphComplete}
          onCrossfadeComplete={onCrossfadeComplete}
          onMorph2Complete={onMorph2Complete}
          onPhaseTransitionComplete={onPhaseTransitionComplete}
          onUnloadingMeshFadedOut={onUnloadingMeshFadedOut}
          onUnloadingMorphComplete={onUnloadingMorphComplete}
        />

        <OrbitControls enableZoom={false} enablePan={false} onChange={onInteraction} />
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}
