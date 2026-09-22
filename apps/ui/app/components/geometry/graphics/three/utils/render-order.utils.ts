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
  sectionControlBody: 20_000,
  sectionControlLabel: 20_010,
  sectionTransformControl: 20_020,
  viewportGizmo: 30_000,
} as const;
