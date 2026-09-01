/**
 * Subset of three.js's `RenderItem` (`node_modules/@types/three/src/renderers/common/RenderList.d.ts`)
 * that the painter sort comparators read. Fields are nullable because three.js resets
 * them via `getNextRenderItem`'s teardown branch; the active sort path always has them
 * populated as numbers.
 */
/* oxlint-disable @typescript-eslint/no-restricted-types -- mirrors three.js's `RenderItem` type which uses null for unpopulated fields */
export type TransparentSortItem = Readonly<{
  groupOrder: number | null;
  renderOrder: number | null;
  z: number | null;
  id: number | null;
}>;
/* oxlint-enable @typescript-eslint/no-restricted-types -- end RenderItem mirror */

/**
 * Custom transparent-render-list sort for `WebGPURenderer` instances configured with
 * `reversedDepthBuffer: true`.
 *
 * **Why this exists.** Three.js's default transparent sort `reversePainterSortStable`
 * (`node_modules/three/src/renderers/common/RenderList.js`) returns `b.z - a.z`, which
 * assumes "larger clip-space Z = farther from camera." `reversedDepthBuffer: true`
 * (per `node_modules/three/src/math/Matrix4.js` `makePerspective(reversedDepth=true)`)
 * inverts that mapping so closer = larger clip-z. The default sort therefore renders
 * closer transparent geometry FIRST and farther LAST — front-to-back — the opposite
 * of the back-to-front order required for correct alpha blending and `depthTest: false`
 * overdraw.
 *
 * This replacement inverts the z comparison while preserving group / renderOrder / id
 * tie-breaks identical to upstream, so registering it on a reversed-Z renderer via
 * `renderer.setTransparentSort(...)` is a drop-in fix.
 *
 * **Symptom that motivated this.** `SectionViewControls` renders forward / inverse
 * label pairs at the same screen position with `transparent: true, depthTest: false`.
 * On the reversed-Z viewport, the inverse (180-degree-Y-rotated) selector overdrew the
 * forward one, producing the "Bottom" label in the "Top" slot with mirrored glyphs
 * (and the symmetric Front/Back, Right/Left swaps).
 *
 * `null` coercion via `?? 0` matches upstream JavaScript semantics: `null - null`
 * implicitly evaluates to 0, `null - 5` to -5, etc. Upstream omits the explicit
 * coercion because plain JS performs it; we restore the same numeric arithmetic
 * under TypeScript's `number | null` types.
 *
 * @see `apps/ui/app/components/geometry/graphics/three/renderer.ts` — registration site
 * @see `docs/research/webgpu-reversed-z-transparent-sort-inversion.md`
 */
export function reversedDepthTransparentSort(a: TransparentSortItem, b: TransparentSortItem): number {
  if (a.groupOrder !== b.groupOrder) {
    return (a.groupOrder ?? 0) - (b.groupOrder ?? 0);
  }
  if (a.renderOrder !== b.renderOrder) {
    return (a.renderOrder ?? 0) - (b.renderOrder ?? 0);
  }
  if (a.z !== b.z) {
    return (a.z ?? 0) - (b.z ?? 0);
  }
  return (a.id ?? 0) - (b.id ?? 0);
}
