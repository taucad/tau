import type { SectionStencilCapStats } from '#graphics/three/utils/section-stencil-caps.js';

/**
 * Where the section view publishes its latest stencil cap counts, on its helper group, while Tau debugging is on.
 * @public
 */
export const sectionCapStencilDebugUserDataKey = 'sectionCapStencil';

/**
 * The counts of the latest cap frame and how many frames drew caps. Every count depends on the cut pieces and the
 * sources' meshes, never on their triangles.
 * @public
 */
export type SectionCapStencilDiagnostics = {
  sequence: number;
  latest: SectionStencilCapStats | undefined;
};
