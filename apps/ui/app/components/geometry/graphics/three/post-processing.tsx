import { useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import type { ReactNode } from 'react';
import { useGraphicsSelector } from '#hooks/use-graphics.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { PostProcessingWebGPU } from '#components/geometry/graphics/three/post-processing-webgpu.js';

/**
 * When ambient occlusion / GTAO post-processing is off, R3F still needs a terminal
 * positive-priority `useFrame` that calls `gl.render(scene, camera)` once any other
 * `priority > 0` subscriber exists (gizmo at priority **3**, `SceneOverlay` at **2**, …).
 * This component owns that priority-**1** main-scene colour pass whenever PP is disabled.
 */
function MainSceneFallback(): undefined {
  useFrame((state) => {
    state.gl.render(state.scene, state.camera);
  }, 1);
  return undefined;
}

/**
 * Conditionally mounts the post-processing subtree for the active graphics backend.
 *
 * **Disabling** `enablePostProcessing` **unmounts** the AO stack on **both** backends but
 * **mounts** `MainSceneFallback` priority-**1** so the main scene is still shaded
 * every frame when other positive-priority owners exist (`SceneOverlay`, gizmo).
 *
 * WebGL `N8AO` path (when mounted) is configured with `screenSpaceRadius={true}`, which means `aoRadius`
 * is measured in **pixels** (not world units). This makes the ambient occlusion
 * effect scale-independent -- models of any size receive visually consistent AO
 * without needing access to `sceneRadius`. If `screenSpaceRadius` were `false`,
 * `aoRadius` would need to be proportional to the scene bounding sphere radius
 * (typically 1-2 orders of magnitude smaller than the scene scale).
 *
 * `distanceFalloff` is set to `0` to disable distance-based AO attenuation.
 * N8AO reconstructs screen-space normals from the depth buffer, but its gradient
 * selection logic (`dl < dr` comparison in `computeNormal`) operates in raw depth
 * space without compensating for the logarithmic depth buffer encoding. This causes
 * the left/right normal gradient to flip at certain depth contours on smooth curved
 * surfaces, producing visible contour-line artifacts. The `distanceFalloff` parameter
 * amplifies these errors because its distance weighting relies on the same imprecise
 * depth reconstruction. Setting it to `0` bypasses that code path entirely. For
 * single-body CAD geometry this has negligible visual impact -- AO still darkens
 * corners and crevices correctly via angular occlusion alone.
 */
export function PostProcessing(): ReactNode {
  const enablePostProcessing = useGraphicsSelector((state) => state.context.enablePostProcessing);
  const backend = useThreeGraphicsBackend();

  if (!enablePostProcessing) {
    return <MainSceneFallback />;
  }

  if (backend === 'webgpu') {
    return <PostProcessingWebGPU />;
  }

  return (
    <EffectComposer stencilBuffer multisampling={4}>
      <N8AO screenSpaceRadius aoRadius={24} intensity={1} distanceFalloff={0} />
    </EffectComposer>
  );
}
