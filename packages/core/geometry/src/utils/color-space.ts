/**
 * Color space conversion helpers.
 *
 * Single source of truth for sRGB↔linear EOTF/OETF conversions across kernels.
 *
 * **Why this exists:** glTF 2.0 defines `pbrMetallicRoughness.baseColorFactor` as
 * **linear** RGB. CSS hex strings, OpenSCAD OFF integer colors, and `[0..1]`
 * tuples accepted by CAD libraries (replicad, jscad) are **sRGB-encoded** by
 * convention. Kernels that write `baseColorFactor` MUST convert sRGB inputs to
 * linear at the writer boundary, otherwise Three.js (`outputColorSpace =
 * SRGBColorSpace`) double-encodes the gamma and produces washed-out colors.
 */

/**
 * Apply the sRGB EOTF: decode an sRGB-encoded channel value (`[0..1]`) to
 * linear light.
 *
 * Standard piecewise definition: linear segment below `0.04045`, gamma-2.4
 * power above (with the canonical `1.055/0.055` offset/scale).
 *
 * @param channel - sRGB-encoded channel value in `[0..1]`
 * @returns linear-light channel value in `[0..1]`
 * @public
 */
export function srgbToLinear(channel: number): number {
  return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Convert an sRGB RGBA tuple (`[0..1]`) to linear RGB, preserving alpha.
 *
 * Alpha is **not** gamma-corrected (per the glTF and Web color spec — alpha is
 * always linear).
 *
 * @param rgba - sRGB-encoded RGBA tuple
 * @returns linear-light RGBA tuple (alpha unchanged)
 * @public
 */
export function srgbTupleToLinear(rgba: readonly [number, number, number, number]): [number, number, number, number] {
  return [srgbToLinear(rgba[0]), srgbToLinear(rgba[1]), srgbToLinear(rgba[2]), rgba[3]];
}

/**
 * Parse a CSS hex color string (`#RRGGBB` or `RRGGBB`) and return a linear RGBA
 * tuple suitable for direct insertion into glTF `baseColorFactor`.
 *
 * @param hex - CSS hex color string with or without leading `#`
 * @param alpha - alpha value in `[0..1]` (defaults to 1, fully opaque)
 * @returns linear-light RGBA tuple
 * @public
 */
export function srgbHexToLinearTuple(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    srgbToLinear(Number.parseInt(clean.slice(0, 2), 16) / 255),
    srgbToLinear(Number.parseInt(clean.slice(2, 4), 16) / 255),
    srgbToLinear(Number.parseInt(clean.slice(4, 6), 16) / 255),
    alpha,
  ];
}
