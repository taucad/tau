import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Center, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { Group } from 'three';
import type { Geometry } from '@taucad/types';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { MorphingPoints } from '#routes/auth.$/splashback/morphing-points.js';
import { SplitMorphingPoints } from '#routes/auth.$/splashback/split-morphing-points.js';
import { PreviewLights } from '#routes/auth.$/splashback/preview-lights.js';
import { updateCrossfade, startCrossfade } from '#routes/auth.$/splashback/crossfade-animation.js';
import { usePreloadedMeshes } from '#routes/auth.$/splashback/use-preloaded-meshes.js';
import type { LoadedMesh } from '#routes/auth.$/splashback/use-preloaded-meshes.js';
import type { SampledPoints } from '#routes/auth.$/splashback/point-sampler.js';
import {
  gear12Teeth as gear12TeethConstant,
  gear8Teeth as gear8TeethConstant,
  assemblySplitRatio as assemblySplitRatioConstant,
} from '#routes/auth.$/splashback/auth-splashback.constants.js';
import { cn } from '#utils/ui.utils.js';
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
  /** Duration of morph animation in ms (used to fade unloading particle opacity to 0) */
  readonly morphDuration?: number;
  /** Scatter cloud (full size) used as the loading source — atoms converging into gear12 */
  readonly loadingScatterPoints?: SampledPoints;
  /** Scatter cloud slice consumed by the gear12 unload cloud as its outward target */
  readonly unloadingScatterPointsA?: SampledPoints;
  /** Scatter cloud slice consumed by the gear8 unload cloud as its outward target */
  readonly unloadingScatterPointsB?: SampledPoints;
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

/**
 * Gear assembly constants calculated from circularPitch = 5
 */
const circularPitch = 5;
const gear12Teeth = gear12TeethConstant;
const gear8Teeth = gear8TeethConstant;
const pitchRadius12 = (gear12Teeth * circularPitch) / (2 * Math.PI);
const pitchRadius8 = (gear8Teeth * circularPitch) / (2 * Math.PI);
const centerOffset = (pitchRadius12 - pitchRadius8) / 2;
const gearRatio = gear12Teeth / gear8Teeth;
const phaseOffset8 = (1.9 * Math.PI) / gear8Teeth;
const initialXaxisRotation = Math.PI / 12;
const initialYaxisRotation = (Math.PI / 4) * 2.5;

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
      animationSpeed={1.5}
      sourceColor={sourceColor}
      targetColor={targetColor}
      pointSize={1.5}
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
  readonly unloadingScatterPointsA?: SampledPoints;
  readonly unloadingScatterPointsB?: SampledPoints;
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
  unloadingScatterPointsA,
  unloadingScatterPointsB,
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

  // Unload outward-morph progress (drives uOpacity 1 -> 0 across morphDuration)
  const unloadingMorphProgressRef = useRef(0);
  const [unloadingMorphOpacity, setUnloadingMorphOpacity] = useState(1);

  // Derive visibility from phase
  const showGear12 = phase === 'gear12' || phase === 'preparingMorph' || phase === 'loadingCrossfading';
  const showLoadingPointCloud =
    phase === 'loadingMorphing' || phase === 'loadingCrossfading' || loadingCrossfadeIsActiveRef.current;
  const showPointCloud = phase === 'morphing' || phase === 'crossfading' || crossfadeIsActiveRef.current;
  const showGear8Mesh =
    phase === 'crossfading' || phase === 'gear8' || phase === 'preparingMorph2' || crossfadeIsActiveRef.current;
  const showSplitPointCloud =
    phase === 'morphingToAssembly' || phase === 'crossfadingToAssembly' || splitCrossfadeIsActiveRef.current;
  // Assembly meshes shown during crossfade AND assembly phases AND while unloading meshes are still fading out
  const showAssemblyMeshes =
    phase === 'crossfadingToAssembly' ||
    phase === 'assembly' ||
    phase === 'unloadingCrossfading' ||
    splitCrossfadeIsActiveRef.current ||
    unloadingCrossfadeIsActiveRef.current;
  // Per-gear unloading point clouds visible during the unload crossfade and outward morph
  const showUnloadingPointClouds =
    phase === 'unloadingCrossfading' || phase === 'unloadingMorphing' || unloadingCrossfadeIsActiveRef.current;
  // Track if we're in the counter-rotating assembly phase (auto-rotate continues through unload)
  const isAssemblyRotating = phase === 'assembly' || phase === 'unloadingCrossfading' || phase === 'unloadingMorphing';

  // Start loading crossfade when phase transitions to loadingCrossfading.
  // Snap mesh opacity to 0 first so it doesn't flash at full opacity for one frame.
  useEffect(() => {
    if (gear12Mesh && phase === 'loadingCrossfading' && !loadingCrossfadeIsActiveRef.current) {
      gear12Mesh.material.opacity = 0;
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

  // Reset unloading-morph progress when entering unloadingMorphing so each cycle starts fresh
  useEffect(() => {
    if (phase === 'unloadingMorphing') {
      unloadingMorphProgressRef.current = 0;
      setUnloadingMorphOpacity(1);
    }
  }, [phase]);

  // Handle morph complete
  const handleMorphComplete = useCallback(
    (finalRotationY: number) => {
      currentRotationYaxisRef.current = finalRotationY;
      onMorphComplete?.();
    },
    [onMorphComplete],
  );

  // Handle morph2 complete (gear8 -> assembly)
  const handleMorph2Complete = useCallback(
    (finalRotationY: number) => {
      currentRotationYaxisRef.current = finalRotationY;
      onMorph2Complete?.();
    },
    [onMorph2Complete],
  );

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
        gear12Mesh.material.opacity = gear12Opacity.target;
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
        gear8Mesh.material.opacity = gear8Opacity.target;
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
        assemblyGear12Mesh.material.opacity = assemblyOpacity.target;
      }

      if (assemblyGear8Mesh) {
        assemblyGear8Mesh.material.opacity = assemblyOpacity.target;
      }
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
        assemblyGear12Mesh.material.opacity = unloadingOpacity.source;
      }

      if (assemblyGear8Mesh) {
        assemblyGear8Mesh.material.opacity = unloadingOpacity.source;
      }
    }

    // Unloading outward morph: ramp particle opacity 1 -> 0 across morphDuration so atoms
    // dissolve mid-flight into the abyss instead of snapping off at scatter positions.
    if (phase === 'unloadingMorphing' && unloadingMorphProgressRef.current < 1) {
      unloadingMorphProgressRef.current = Math.min(
        1,
        unloadingMorphProgressRef.current + (delta * 1000) / morphDuration,
      );
      const eased = unloadingMorphProgressRef.current;
      setUnloadingMorphOpacity(1 - eased * eased);
    }

    // Accumulate rotation for assembly (point cloud, meshes, AND unload clouds use this)
    // Start accumulating once the split point cloud appears; keep going through unload.
    const isAssemblyAnimating = showSplitPointCloud || isAssemblyRotating;

    if (isAssemblyAnimating) {
      const rotationSpeed = 0.3;
      assemblyRotationRef.current += rotationSpeed * delta;
    }

    // Apply shared rotation to assembly meshes (and the unloading point clouds nested inside them)
    if (assemblyGear12RotationRef.current && assemblyGear8RotationRef.current) {
      assemblyGear12RotationRef.current.rotation.z = assemblyRotationRef.current;
      assemblyGear8RotationRef.current.rotation.z = -assemblyRotationRef.current * gearRatio + phaseOffset8;
    }

    // Animate assembly tilt based on split morph progress
    // Only animate X (forward tilt) - Y is kept static to avoid rapid spin
    // Y rotation is just a viewing angle preference; auto-rotate handles Y orientation
    if (splitTiltRef.current) {
      const tiltProgress = splitMorphProgressRef.current;
      splitTiltRef.current.rotation.x = initialXaxisRotation * tiltProgress;
      splitTiltRef.current.rotation.y = initialYaxisRotation; // Static, not animated
    }
  });

  const loadingPointCloudOpacity = loadingCrossfadeIsActiveRef.current ? loadingCrossfadeOpacity.pointCloud : 1;
  const unloadingPointCloudOpacity = unloadingCrossfadeIsActiveRef.current
    ? unloadingCrossfadeOpacity.pointCloud
    : phase === 'unloadingMorphing'
      ? unloadingMorphOpacity
      : 1;
  const unloadingTargetProgress = phase === 'unloadingMorphing' ? 1 : 0;

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
            opacity={loadingPointCloudOpacity}
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
            opacity={crossfadeIsActiveRef.current ? crossfadeOpacity.pointCloud : 1}
            onMorphComplete={handleMorphComplete}
          />
        ) : undefined}

        {/* Gear8 mesh for crossfade and display - preloaded */}
        {showGear8Mesh && gear8Mesh ? <primitive object={gear8Mesh.scene} /> : undefined}
      </group>

      {/* Split point cloud for morphing (gear8 -> assembly) - tilt animated via splitTiltRef */}
      {showSplitPointCloud && gear8Points && assemblyGear12Points && assemblyGear8Points ? (
        <group ref={splitTiltRef}>
          <group rotation={[Math.PI, 0, 0]}>
            <SplitMorphingPoints
              sourcePoints={gear8Points}
              targetPointsA={assemblyGear12Points}
              targetPointsB={assemblyGear8Points}
              splitRatio={assemblySplitRatio}
              targetProgress={1}
              animationSpeed={1.5}
              sourceColor={gear8Color}
              targetColorA={gear12Color}
              targetColorB={gear8Color}
              pointSize={1.5}
              explosionStrength={3}
              opacity={splitCrossfadeIsActiveRef.current ? splitCrossfadeOpacity.pointCloud : 1}
              sharedRotationRef={assemblyRotationRef}
              gearRatio={gearRatio}
              gear12OffsetX={-pitchRadius12 + centerOffset}
              gear8OffsetX={pitchRadius8 + centerOffset}
              gear8PhaseOffset={phaseOffset8}
              onMorphComplete={handleMorph2Complete}
              onProgressChange={handleSplitMorphProgress}
            />
          </group>
        </group>
      ) : undefined}

      {/* Assembly meshes + per-gear unloading point clouds - both inherit the counter-rotation
          from assemblyGear*RotationRef so the mesh -> point handoff has zero rotation snap. */}
      {(showAssemblyMeshes || showUnloadingPointClouds) && assemblyGear12Mesh && assemblyGear8Mesh ? (
        <group rotation={[initialXaxisRotation, initialYaxisRotation, 0]}>
          <group rotation={[Math.PI, 0, 0]}>
            {/* Gear 12 - positioned to the left, counter-rotates during assembly phase */}
            <group ref={assemblyGear12RotationRef} position={[-pitchRadius12 + centerOffset, 0, 0]}>
              {showAssemblyMeshes ? <primitive object={assemblyGear12Mesh.scene} /> : undefined}
              {showUnloadingPointClouds && gear12Points && unloadingScatterPointsA ? (
                <MorphingPoints
                  sourcePoints={gear12Points}
                  targetPoints={unloadingScatterPointsA}
                  targetProgress={unloadingTargetProgress}
                  animationSpeed={1.5}
                  sourceColor={gear12Color}
                  targetColor={gear12Color}
                  pointSize={1.5}
                  explosionStrength={3}
                  opacity={unloadingPointCloudOpacity}
                  onMorphComplete={onUnloadingMorphComplete}
                />
              ) : undefined}
            </group>

            {/* Gear 8 - positioned to the right with phase offset, counter-rotates during assembly phase */}
            <group
              ref={assemblyGear8RotationRef}
              position={[pitchRadius8 + centerOffset, 0, 0]}
              rotation={[0, 0, phaseOffset8]}
            >
              {showAssemblyMeshes ? <primitive object={assemblyGear8Mesh.scene} /> : undefined}
              {showUnloadingPointClouds && gear8Points && unloadingScatterPointsB ? (
                <MorphingPoints
                  sourcePoints={gear8Points}
                  targetPoints={unloadingScatterPointsB}
                  targetProgress={unloadingTargetProgress}
                  animationSpeed={1.5}
                  sourceColor={gear8Color}
                  targetColor={gear8Color}
                  pointSize={1.5}
                  explosionStrength={3}
                  opacity={unloadingPointCloudOpacity}
                />
              ) : undefined}
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
  unloadingScatterPointsA,
  unloadingScatterPointsB,
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
        <PerspectiveCamera makeDefault position={[0, 0, 40]} fov={45} />

        <PreviewLights />

        <Center>
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
            unloadingScatterPointsA={unloadingScatterPointsA}
            unloadingScatterPointsB={unloadingScatterPointsB}
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
        </Center>

        <OrbitControls enableZoom={false} enablePan={false} onChange={onInteraction} />
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}
