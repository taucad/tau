import type { SectionLoopCapDiagnostics } from '#graphics/three/utils/section-loop-caps.js';
import type { SectionStencilCapStats } from '#graphics/three/utils/section-stencil-caps.js';

/**
 * Where the section view publishes its latest stencil cap counts, on its helper group, while Tau debugging is on.
 * @public
 */
export const sectionCapStencilDebugUserDataKey = 'sectionCapStencil';

/**
 * Where a test bridge asks the section view, on the same helper group and only while Tau debugging is on, to draw its
 * caps without their outlines, as {@link SectionCapOutlineDebugControl}. Comparing the two frames isolates the pixels
 * the outlines own in the composed frame.
 * @public
 */
export const sectionCapOutlineDebugUserDataKey = 'sectionCapOutline';

/**
 * The debug control read on every cap frame: `hidden` draws the caps with no outline.
 * @public
 */
export type SectionCapOutlineDebugControl = { hidden: boolean };

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
