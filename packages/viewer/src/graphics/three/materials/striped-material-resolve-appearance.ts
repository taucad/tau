import * as THREE from 'three';
import type { StripedMaterialProperties } from '#graphics/three/materials/striped-material.types.js';

/**
 * Relative luminance above which a cap's stripes are drawn darker than its tint, and below which lighter: about L* 38,
 * so mid tones such as a mid blue get dark lines and near-black parts get light ones.
 */
export const sectionCapStripeLuminanceThreshold = 0.1;
/** How far a light tint's stripe is scaled toward black, in linear light. */
const darkStripeScale = 0.3;
/** How far a dark tint's stripe is mixed toward white, in linear light. */
const lightStripeMix = 0.65;

const scratchTint = new THREE.Color();
const white = new THREE.Color(0xff_ff_ff);

/**
 * The stripe colour for a tint: darker on a light or mid-tone tint and lighter on a dark one, so the hatch contrasts
 * with every part colour.
 * @param tintHex - The part's tint, as an sRGB hex colour.
 * @returns The stripe colour, as an sRGB hex colour.
 */
export function resolveContrastStripeColor(tintHex: number): number {
  scratchTint.setHex(tintHex);
  const luminance = 0.2126 * scratchTint.r + 0.7152 * scratchTint.g + 0.0722 * scratchTint.b;
  return luminance > sectionCapStripeLuminanceThreshold
    ? scratchTint.multiplyScalar(darkStripeScale).getHex()
    : scratchTint.lerp(white, lightStripeMix).getHex();
}

export function resolveStripedAppearance(properties?: StripedMaterialProperties): {
  stripeFrequency: number;
  stripeWidth: number;
  stripeAngle: number;
  baseColor: number;
  stripeColor: number;
} {
  const source = properties ?? {};
  const stripeFrequency = source.stripeFrequency ?? 2;
  const stripeWidth = source.stripeWidth ?? 0.12;
  const stripeAngle = source.stripeAngle ?? Math.PI / 4;

  if (source.tintColor !== undefined) {
    return {
      stripeFrequency,
      stripeWidth,
      stripeAngle,
      baseColor: source.tintColor,
      stripeColor: resolveContrastStripeColor(source.tintColor),
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
