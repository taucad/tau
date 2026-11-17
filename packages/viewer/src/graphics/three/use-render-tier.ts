import { useThree } from '@react-three/fiber';
import { useViewerEnvironment } from '#environment/viewer-environment.jsx';
import { resolveRenderTier } from '#graphics/three/render-tier.js';
import type { RenderTier } from '#graphics/three/render-tier.js';

/**
 * The render tier of the canvas this component draws in: resolved once for its renderer, with the embedder's override.
 *
 * @returns The tier.
 * @internal
 */
export const useRenderTier = (): RenderTier => {
  const gl = useThree((state) => state.gl);
  const { renderTierOverride } = useViewerEnvironment();
  return resolveRenderTier(gl, renderTierOverride);
};
