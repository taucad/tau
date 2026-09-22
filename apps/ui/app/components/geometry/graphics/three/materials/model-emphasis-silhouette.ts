import { gltfEdgeHoverColor } from '#components/geometry/graphics/three/overlay-colors.constants.js';

/**
 * Shared contract of the emphasis silhouette composite (both backends).
 *
 * The mask render target stores union coverage of the emphasised meshes: R = hovered,
 * G = selected. The composite draws `silhouetteColor` wherever coverage changes between a pixel
 * and its axis neighbours at {@link silhouetteTapDistance} device pixels, so the line straddles
 * the boundary and is twice that wide: `silhouetteWidthCssPixels` on screen regardless of the
 * device pixel ratio. The colour is the edge hover yellow, exposed under the silhouette's name.
 */
export const silhouetteColor: number = gltfEdgeHoverColor;
export const silhouetteWidthCssPixels = 2;
export const silhouetteHoverAlpha = 0.55;
export const silhouetteSelectedAlpha = 1;

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
 * CPU oracle of the fragment: the strongest coverage change toward any neighbour, per channel.
 *
 * @param center - Coverage at the pixel, `[hover, selected]` in 0..1.
 * @param neighbours - Coverage at each of {@link silhouetteTapOffsets}.
 */
export function silhouetteEdgeStrength(
  center: readonly [number, number],
  neighbours: ReadonlyArray<readonly [number, number]>,
): [number, number] {
  let hover = 0;
  let selected = 0;
  for (const [h, s] of neighbours) {
    hover = Math.max(hover, Math.abs(center[0] - h));
    selected = Math.max(selected, Math.abs(center[1] - s));
  }
  return [hover, selected];
}

/** Final alpha of the composite for an edge strength pair. */
export function silhouetteAlpha(edge: readonly [number, number]): number {
  return Math.max(edge[0] * silhouetteHoverAlpha, edge[1] * silhouetteSelectedAlpha);
}
