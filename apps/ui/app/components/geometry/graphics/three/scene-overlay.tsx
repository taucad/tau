import type { ReactNode } from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { createPortal, useFrame } from '@react-three/fiber';

type SceneOverlayFrameLoopProps = Readonly<{
  overlayScene: THREE.Scene;
}>;

type RenderableObject3D = THREE.Object3D & {
  material: THREE.Material | THREE.Material[];
};

const isRenderableMaterialHost = (object: THREE.Object3D): object is RenderableObject3D => {
  const candidate = object as Partial<RenderableObject3D> & {
    isMesh?: boolean;
    isLine?: boolean;
    isLineSegments?: boolean;
    isPoints?: boolean;
    isSprite?: boolean;
  };
  if (candidate.material === undefined) {
    return false;
  }
  return (
    candidate.isMesh === true ||
    candidate.isLine === true ||
    candidate.isLineSegments === true ||
    candidate.isPoints === true ||
    candidate.isSprite === true
  );
};

/**
 * Cache of `colorWrite=false` clones keyed by the source material so the WebGPU
 * pipeline-cache (`stageVertex.id`, `stageFragment.id`, geometry signature) stays hot across
 * frames. We additionally hook the source material's `dispose` event so clones are released when
 * the source is, preventing GPU-resource leaks on hot-reload / route transitions.
 */
function makeDepthOnlyCloneCache(): (source: THREE.Material) => THREE.Material {
  const cloneBySource = new WeakMap<THREE.Material, THREE.Material>();

  return (source: THREE.Material): THREE.Material => {
    const cached = cloneBySource.get(source);
    if (cached !== undefined) {
      return cached;
    }
    const clone = source.clone();
    clone.colorWrite = false;
    clone.transparent = false;
    clone.depthWrite = true;
    clone.depthTest = true;
    const onSourceDispose = (): void => {
      clone.dispose();
      cloneBySource.delete(source);
      source.removeEventListener('dispose', onSourceDispose);
    };
    source.addEventListener('dispose', onSourceDispose);
    cloneBySource.set(source, clone);
    return clone;
  };
}

/**
 * Overlay composite at R3F priority `2`.
 *
 * Two `gl.render` calls per frame:
 * 1. **Depth pre-pass against the main scene** — swap each renderable mesh's material with a cached
 *    `colorWrite=false` clone (see {@link makeDepthOnlyCloneCache}), render the main scene with
 *    `autoClear=false`, then restore originals. This populates the WebGPU canvas depth attachment
 *    so the overlay can depth-test against real geometry. Required because three.js r184's
 *    `RenderPipeline._quadMesh.material.depthNode` does **not** route depth to the swap-chain depth
 *    attachment subsequent `gl.render` calls read (see
 *    `docs/research/webgpu-composite-quad-depth-write-non-functional.md`).
 * 2. **Overlay render** — the priority-1 owner has already painted the canvas colour
 *    (`PostProcessingWebGPU` composite quad, `MainSceneFallback`, or `EffectComposer`); we only
 *    need to composite the overlay scene on top with `autoClear=false`.
 *
 * Uses `scene.traverse` + per-source-material cached clones rather than `scene.overrideMaterial`
 * (banned by `tau-lint/no-scene-override-material` — see
 * `docs/research/webgpu-override-material-vertex-binding-failure.md` R1).
 *
 * Mounted only when the overlay subtree has geometry to draw so we do not hold a positive-priority
 * subscriber when overlay children are absent (fixes blank CAD when both grid and axes are disabled).
 */
function SceneOverlayFrameLoop({ overlayScene }: SceneOverlayFrameLoopProps): ReactNode {
  const getDepthOnlyClone = useMemo(makeDepthOnlyCloneCache, []);
  const swapBuffer = useMemo<
    Array<{ readonly object: RenderableObject3D; readonly material: THREE.Material | THREE.Material[] }>
  >(() => [], []);

  useFrame((state) => {
    const { gl, scene, camera } = state;
    const previousAutoClear = gl.autoClear;
    gl.autoClear = false;

    scene.traverse((object) => {
      if (!isRenderableMaterialHost(object)) {
        return;
      }
      swapBuffer.push({ object, material: object.material });
      object.material = Array.isArray(object.material)
        ? object.material.map(getDepthOnlyClone)
        : getDepthOnlyClone(object.material);
    });

    gl.render(scene, camera);

    for (const { object, material } of swapBuffer) {
      object.material = material;
    }
    swapBuffer.length = 0;

    gl.render(overlayScene, camera);

    gl.autoClear = previousAutoClear;
  }, 2);

  return null;
}

type SceneOverlayProperties = Readonly<{
  children: ReactNode;
  /**
   * When `false`, omit the priority-2 overlay subscriber entirely. Grid/axes overlays are
   * skipped while the canvas still renders the main scene via priority-**1**
   * (`MainSceneFallback` vs post-processing when enabled).
   */
  overlayActive: boolean;
}>;

/**
 * Renders children in a separate THREE.Scene composited above the viewport output.
 *
 * Keeps overlays (Grid, AxesHelper) outside N8AO / GTAO stacks so ambient occlusion does
 * not darken them.
 *
 * When {@link SceneOverlayProperties.overlayActive} is `true`, registers at R3F
 * **`renderPriority = 2`**, after priority-**1** main-scene shading
 * (`MainSceneFallback` vs **EffectComposer** / **`PostProcessingWebGPU`** — always exactly one
 * subscriber from the **`PostProcessing`** component). Viewport gizmos overlay at
 * priority **3**.
 *
 * `frameloop` / demand-render conventions for the parent `<Canvas>` are policy-bound in
 * **`docs/policy/graphics-backend-policy.md`** §7.
 */
export function SceneOverlay({ children, overlayActive }: SceneOverlayProperties): React.JSX.Element {
  const overlayScene = useMemo(() => new THREE.Scene(), []);

  return (
    <>
      {createPortal(children, overlayScene)}
      {overlayActive ? <SceneOverlayFrameLoop overlayScene={overlayScene} /> : null}
    </>
  );
}
