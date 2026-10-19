import type { SectionLoopCapDiagnostics } from '#graphics/three/utils/section-loop-caps.js';
import type { SectionStencilCapStats } from '#graphics/three/utils/section-stencil-caps.js';

/**
 * Where the section view publishes its latest stencil cap counts, on its helper group, while Tau debugging is on.
 * @public
 */
export const sectionCapStencilDebugUserDataKey = 'sectionCapStencil';

/**
 * The counts of the latest cap frame and how many frames drew caps. Every stencil count depends on the cut pieces and
 * the sources' meshes, never on their triangles. `loops` holds, per source capped from its per-loop slices, the closed
 * loops and open chains its latest slices found and what they cost.
 * @public
 */
export type SectionCapStencilDiagnostics = {
  sequence: number;
  latest: SectionStencilCapStats | undefined;
  loops: readonly SectionLoopCapDiagnostics[];
};
