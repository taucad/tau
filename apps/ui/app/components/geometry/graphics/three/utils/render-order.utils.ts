/**
 * Finite render tiers for viewport helper geometry.
 *
 * The section-view pipeline relies on precise ordering between opaque section
 * caps, generated cap outlines, self-occluding selector bodies, selector labels,
 * and transform/gizmo overlays. Keep these values finite safe integers; avoid
 * `Infinity`, maximum-safe-integer sentinels, and "topmost + 1" arithmetic because
 * WebGPU/common render-list sorting and JavaScript numeric precision both make
 * those patterns brittle.
 */
export const viewportRenderTiers = {
  model: 0,
  sectionCapFill: 10_000,
  sectionContourOutline: 10_010,
  /**
   * Edges of an emphasised component, including its cap outline. Above every ordinary edge so a
   * coincident neighbour can never win the `LEQUAL` tie they share at geometric depth; the opaque
   * sort is front-to-back by centroid, which flips as the camera moves.
   */
  modelEmphasisEdge: 10_020,
  sectionControlBody: 20_000,
  sectionControlLabel: 20_010,
  sectionTransformControl: 20_020,
  viewportGizmo: 30_000,
} as const;
