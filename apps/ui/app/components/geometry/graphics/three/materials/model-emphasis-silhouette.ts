import { gltfEdgeHoverColor } from '#components/geometry/graphics/three/overlay-colors.constants.js';

/**
 * Shared contract of the emphasis silhouette composite (both backends).
 *
 * The mask render target stores two layers of the emphasised meshes, one channel each:
 * coverage in R (hovered) and G (selected), visibility in B (hovered) and A (selected).
 * Coverage is the union footprint; visibility is the part of it that survived a depth test
 * against the finished frame, so it marks where the part is the frontmost thing on screen.
 *
 * The composite draws {@link silhouetteColor} wherever coverage spans a range across a pixel and its
 * axis neighbours at {@link silhouetteTapDistance} device pixels, so the line straddles the
 * boundary and is twice that wide: `silhouetteWidthCssPixels` on screen regardless of the device
 * pixel ratio. Where that boundary is hidden it keeps the same colour at
 * {@link silhouetteHiddenAlphaScale} of its strength, so an occluded part still reads as one
 * shape without competing with the parts in front of it. The colour is the edge hover yellow,
 * exposed under the silhouette's name.
 */
export const silhouetteColor: number = gltfEdgeHoverColor;
export const silhouetteWidthCssPixels = 2;
export const silhouetteHoverAlpha = 0.55;
export const silhouetteSelectedAlpha = 1;
export const silhouetteHiddenAlphaScale = 0.45;

/** Mask value above which a channel counts as set; the layers only ever write 0 or 1. */
export const silhouetteMaskThreshold = 0.5;

/** Mask target dimensions in device pixels plus the ratio they were drawn at. */
export type SilhouetteMaskSize = Readonly<{ width: number; height: number; pixelRatio: number }>;

/** Whole device pixels between a pixel and its neighbour taps for the given pixel ratio. */
export function silhouetteTapDistance(pixelRatio: number): number {
  return Math.max(1, Math.round((silhouetteWidthCssPixels * pixelRatio) / 2));
}

/** Axis-aligned neighbour offsets, in taps, sampled by both shader implementations. */
export const silhouetteTapOffsets: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * CPU oracle of the fragment: how far coverage spans across the pixel and its neighbours, per
 * channel.
 *
 * The spread rather than the distance from the centre, because the mask is multisampled: the
 * pixel the boundary crosses resolves to part coverage, sits between an inside and an outside tap,
 * and would read only that fraction against its own centre — a hollow line. The spread keeps it
 * at full strength while the outer rows, which only reach a fractional pixel, still fade.
 *
 * @param center - Coverage at the pixel, `[hover, selected]` in 0..1.
 * @param neighbours - Coverage at each of {@link silhouetteTapOffsets}.
 */
export function silhouetteEdgeStrength(
  center: readonly [number, number],
  neighbours: ReadonlyArray<readonly [number, number]>,
): [number, number] {
  let [highHover, highSelected] = center;
  let [lowHover, lowSelected] = center;
  for (const [h, s] of neighbours) {
    highHover = Math.max(highHover, h);
    lowHover = Math.min(lowHover, h);
    highSelected = Math.max(highSelected, s);
    lowSelected = Math.min(lowSelected, s);
  }
  return [highHover - lowHover, highSelected - lowSelected];
}

/**
 * CPU oracle of the visibility reduction: the boundary takes the strongest visibility it touches.
 *
 * An edge pixel straddles the boundary, so one side of its neighbourhood is outside the part and
 * carries no visibility at all. Reducing with `max` lets the covered side decide, which is why a
 * part that is visible anywhere along a boundary draws that whole boundary at full strength.
 *
 * @param center - Visibility at the pixel, `[hover, selected]` in 0..1.
 * @param neighbours - Visibility at each of {@link silhouetteTapOffsets}.
 */
export function silhouetteVisibility(
  center: readonly [number, number],
  neighbours: ReadonlyArray<readonly [number, number]>,
): [number, number] {
  let hover = center[0];
  let selected = center[1];
  for (const [h, s] of neighbours) {
    hover = Math.max(hover, h);
    selected = Math.max(selected, s);
  }
  return [hover, selected];
}

/** Final alpha of the composite for an edge strength pair and its reduced visibility. */
export function silhouetteAlpha(edge: readonly [number, number], visible: readonly [number, number]): number {
  const scale = (value: number): number => (value >= silhouetteMaskThreshold ? 1 : silhouetteHiddenAlphaScale);
  return Math.max(
    edge[0] * silhouetteHoverAlpha * scale(visible[0]),
    edge[1] * silhouetteSelectedAlpha * scale(visible[1]),
  );
}
