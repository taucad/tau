import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import { MorphingPoints } from '#components/geometry/splash/morphing-points.js';
import type { MorphingPointerState } from '#components/geometry/splash/morphing-points.js';
import { sampleMeshSurface } from '#components/geometry/splash/point-sampler.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { normalizeSampledPoints } from '#routes/_index/hero-points.js';
import gear12Url from '#routes/_index/assets/gear-12.glb?url';
import gear8Url from '#routes/_index/assets/gear-8.glb?url';

// Interaction tuning against `heroTargetRadius` (10): the gaussian falloff in
// the material bounds displacement at `strength` (no shell pile-up, and safe
// from fold-over while 1.487·strength/radius < 1); radius ~5 covers a
// tooth-sized neighbourhood, strength ~2.4 reads as a firm, visible stir.
const pointerRepulsionRadius = 5;
const pointerRepulsionStrength = 2.4;

async function loadSampledPoints(url: string, pointCount: number): Promise<SampledPoints> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);

  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((object) => {
    if (!mesh && object instanceof THREE.Mesh) {
      mesh = object;
    }
  });

  if (!mesh) {
    throw new Error(`No mesh found in ${url}`);
  }

  return sampleMeshSurface(mesh, pointCount);
}

type HeroPoints = { source: SampledPoints; target: SampledPoints };

/** Loading = `undefined`; failed = `'error'`; ready = the sampled clouds. */
type HeroPointsState = HeroPoints | 'error' | undefined;

/**
 * Load and sample both baked gears into normalized point clouds. Returns
 * `undefined` while loading and `'error'` if loading fails (so the caller can
 * fall back to the static poster).
 */
function useHeroPoints(pointCount: number): HeroPointsState {
  const [points, setPoints] = useState<HeroPointsState>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [source, target] = await Promise.all([
          loadSampledPoints(gear12Url, pointCount),
          loadSampledPoints(gear8Url, pointCount),
        ]);
        if (!cancelled) {
          setPoints(normalizeSampledPoints(source, target));
        }
      } catch (error) {
        console.error('[HeroCanvas] Failed to load gear points:', error);
        if (!cancelled) {
          setPoints('error');
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pointCount]);

  return points;
}

/**
 * Pointer-reactive scene: the point cloud morphs between the two gears on a
 * loop while the cursor stirs nearby points off the surface. An invisible
 * plane at z=0 turns pointer moves into world positions; MorphingPoints
 * converts those into the (auto-rotating) cloud's local space each frame.
 */
function HeroScene({
  points,
  isInteractive,
}: {
  readonly points: HeroPoints;
  readonly isInteractive: boolean;
}): React.JSX.Element {
  const [targetProgress, setTargetProgress] = useState(0);
  const dwellRef = useRef(false);

  const pointerRef = useRef<MorphingPointerState>({
    position: new THREE.Vector3(0, 0, 0),
    strength: 0,
    radius: pointerRepulsionRadius,
  });
  const pointerTargetStrengthRef = useRef(0);
  const { viewport } = useThree();

  // Ease pointer strength toward its target so repulsion fades in/out smoothly.
  useFrame((_state, delta) => {
    const state = pointerRef.current;
    state.strength = THREE.MathUtils.damp(state.strength, pointerTargetStrengthRef.current, 6, delta);
  });

  const handleMorphComplete = (): void => {
    if (dwellRef.current) {
      return;
    }
    dwellRef.current = true;
    // Brief dwell on the converged gear before morphing to the other.
    setTimeout(() => {
      dwellRef.current = false;
      setTargetProgress((previous) => (previous === 0 ? 1 : 0));
    }, 1400);
  };

  return (
    <>
      <MorphingPoints
        sourcePoints={points.source}
        targetPoints={points.target}
        targetProgress={targetProgress}
        animationSpeed={1.2}
        pointSize={2.5}
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- decorative hero particles
        sourceColor='#14b8a6'
        // oxlint-disable-next-line tau-lint/no-hardcoded-color -- decorative hero particles
        targetColor='#5B8FD9'
        enableAutoRotate
        // In-plane spin about the gear's own axis (a flat disc tumbling around
        // Y presents edge-on as a saturated slab), like a real gear turning.
        autoRotateAxis='z'
        autoRotateSpeed={0.25}
        // Additive blending saturates to white where points stack; sub-1
        // opacity keeps the rim luminous instead of clipped.
        opacity={0.8}
        pointerRef={isInteractive ? pointerRef : undefined}
        onMorphComplete={handleMorphComplete}
      />

      {isInteractive ? (
        <mesh
          position={[0, 0, 0]}
          onPointerMove={(event) => {
            pointerRef.current.position.copy(event.point);
            pointerTargetStrengthRef.current = pointerRepulsionStrength;
          }}
          onPointerLeave={() => {
            pointerTargetStrengthRef.current = 0;
          }}
        >
          <planeGeometry args={[viewport.width * 2, viewport.height * 2]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
    </>
  );
}

/**
 * Live, pointer-reactive hero point cloud (R5). Scatter is generation,
 * convergence is verification — the cursor pushes points off the verified
 * surface, and they spring back when it leaves.
 *
 * Perf budget (R10): WebGL path, DPR capped at 1.5, adaptive point count, RAF
 * paused when off-viewport or tab-hidden, and static (no pointer, no morph
 * loop) under `prefers-reduced-motion`. Falls back to the poster on load error.
 */
export function HeroCanvas({
  isReducedMotion,
  onError,
}: {
  readonly isReducedMotion: boolean;
  readonly onError: () => void;
}): React.ReactNode {
  // Adaptive point count: lighter on mobile, richer on desktop. Kept sparse on
  // purpose — the auth splash's delicate look comes from ~3k points; with
  // additive blending a dense cloud saturates into a solid white mass. HeroCanvas
  // only mounts client-side (lazy, behind the visibility gate in hero-visual),
  // so `window` is always defined here.
  const pointCount = useMemo(() => (globalThis.window.innerWidth < 768 ? 6000 : 12_000), []);

  const points = useHeroPoints(pointCount);

  useEffect(() => {
    if (points === 'error') {
      onError();
    }
  }, [points, onError]);

  if (points === undefined || points === 'error') {
    return null;
  }

  // Ponytail: hero renders on the WebGL path for simplicity; the WebGPU/TSL
  // material variant still exists and is snapshot-tested, but the decorative
  // hero does not need the async WebGPU probe + canvas remount.
  const gl = createTauR3fGlProp('webgl');

  return (
    <Canvas gl={gl} dpr={[1, 1.5]} frameloop={isReducedMotion ? 'demand' : 'always'} className='size-full'>
      <ThreeGraphicsBackendProvider value='webgl'>
        {/* Slightly elevated camera: a 3/4 view gives the gear depth and keeps
            the extruded side walls from stacking into one hot additive ring
            (the face-on view reads as a solid glowing band). */}
        <PerspectiveCamera
          makeDefault
          position={[0, 9, 28]}
          fov={45}
          onUpdate={(camera) => {
            camera.lookAt(0, 0, 0);
          }}
        />
        <HeroScene points={points} isInteractive={!isReducedMotion} />
      </ThreeGraphicsBackendProvider>
    </Canvas>
  );
}
