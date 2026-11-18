import type { RenderTier, RenderTierOverride } from '@taucad/viewer/graphics/three/render-tier';
import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import { ENV } from '#environment.config.js';
import { resolveTauDebugDefault } from '#flags/flag.constants.js';

const renderTierQueryValues: ReadonlyArray<RenderTier['rasterizer']> = ['hardware', 'software'];

/**
 * Parse the test-only `renderTier` override from a URL search string: `?renderTier=hardware` makes every canvas run
 * the hardware features on a software GPU (CI's SwiftShader), `software` the reduced ones on any GPU. It applies only
 * in an undeployed debug build (local development and the e2e suite); a deployed site, production included, ignores
 * it whatever the URL or the stored flags say.
 *
 * @param search - A `location.search` string, with or without the leading `?`.
 * @param isUndeployedDebugBuild - Whether this build is an undeployed debug build.
 * @returns The override, or `undefined`.
 */
export function parseRenderTierQueryOverride(
  search: string,
  isUndeployedDebugBuild: boolean,
): RenderTierOverride | undefined {
  if (!isUndeployedDebugBuild) {
    return undefined;
  }
  const raw = new URLSearchParams(search).get(searchParameterName.renderTier);
  const features = renderTierQueryValues.find((value) => value === raw);
  return features ? { features } : undefined;
}

/** Whether this build may apply the test-only render tier override: `TAU_DEBUG` on, and not a deployed site. */
export const renderTierOverrideAllowed = resolveTauDebugDefault({
  isDebugEnvironment: ENV.TAU_DEBUG,
  deployContext: ENV.TAU_DEPLOY_CONTEXT,
});
