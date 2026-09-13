import type { StripedMaterialProperties } from '#components/geometry/graphics/three/materials/striped-material.types.js';
import { adjustHexColorBrightness } from '#utils/color.utils.js';

export function resolveStripedAppearance(properties?: StripedMaterialProperties): {
  stripeFrequency: number;
  stripeWidth: number;
  stripeAngle: number;
  baseColor: number;
  stripeColor: number;
} {
  const source = properties ?? {};
  const stripeFrequency = source.stripeFrequency ?? 2;
  const stripeWidth = source.stripeWidth ?? 0.25;
  const stripeAngle = source.stripeAngle ?? Math.PI / 4;

  if (source.tintColor !== undefined) {
    const tintCss = `#${source.tintColor.toString(16).padStart(6, '0')}`;
    const baseCss = adjustHexColorBrightness(tintCss, -0.08);
    const stripeCss = adjustHexColorBrightness(tintCss, 0.14);
    return {
      stripeFrequency,
      stripeWidth,
      stripeAngle,
      baseColor: Number.parseInt(baseCss.slice(1), 16),
      stripeColor: Number.parseInt(stripeCss.slice(1), 16),
    };
  }

  return {
    stripeFrequency,
    stripeWidth,
    stripeAngle,
    baseColor: source.baseColor ?? 0xdd_dd_dd,
    stripeColor: source.stripeColor ?? 0xbb_bb_bb,
  };
}
