import { EffectComposer, N8AO } from '@react-three/postprocessing';
import { useViewerStore } from '#react/stores/store-context.js';

/**
 * Conditionally renders the EffectComposer with N8AO ambient occlusion.
 * When disabled, the EffectComposer unmounts and SceneOverlay auto-adapts
 * to render the full scene itself via `state.internal.priority` detection.
 *
 * N8AO is configured with `screenSpaceRadius={true}`, which means `aoRadius`
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
export function PostProcessing(): React.JSX.Element | undefined {
  const enablePostProcessing = useViewerStore((state) => state.enablePostProcessing);

  if (!enablePostProcessing) {
    return undefined;
  }

  return (
    <EffectComposer stencilBuffer multisampling={4}>
      <N8AO screenSpaceRadius aoRadius={24} intensity={1} distanceFalloff={0} />
    </EffectComposer>
  );
}
