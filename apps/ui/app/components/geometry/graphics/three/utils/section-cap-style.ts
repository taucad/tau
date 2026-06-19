import { resolveStripedAppearance } from '#components/geometry/graphics/three/materials/striped-material-resolve-appearance.js';
import type { PackedSectionCapGeometryBuffers } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';

export const sectionCapOverlapBaseHex = 0xb9_1c_1c;
export const sectionCapOverlapStripeHex = 0xfd_e0_47;

export const sectionCapNormalRegionKind = 0;
export const sectionCapOverlapRegionKind = 1;

const colorByteRange = 256;
const redChannelDivisor = 65_536;
const maxColorByte = 255;

export const colorToComponents = (hex: number): readonly [number, number, number] => [
  (Math.floor(hex / redChannelDivisor) % colorByteRange) / maxColorByte,
  (Math.floor(hex / colorByteRange) % colorByteRange) / maxColorByte,
  (hex % colorByteRange) / maxColorByte,
];

export const stripeAxisForAngle = (stripeAngle: number): readonly [number, number] => [
  Math.sin(stripeAngle),
  Math.cos(stripeAngle),
];

export const colorsForSectionCapTint = (
  tintHex: number,
  stripeFrequency: number,
  stripeWidth: number,
): Readonly<{
  baseColor: number;
  stripeColor: number;
}> => {
  const appearance = resolveStripedAppearance({
    tintColor: tintHex,
    stripeFrequency,
    stripeWidth,
  });

  return {
    baseColor: appearance.baseColor,
    stripeColor: appearance.stripeColor,
  };
};

export const resolveSectionCapStyle = (options: {
  tintHex: number;
  stripeFrequency: number;
  stripeWidth: number;
  stripeAngle?: number;
}): Readonly<{
  normalBaseColor: readonly [number, number, number];
  normalStripeColor: readonly [number, number, number];
  overlapBaseColor: readonly [number, number, number];
  overlapStripeColor: readonly [number, number, number];
  normalStripeAxis: readonly [number, number];
  overlapStripeAxis: readonly [number, number];
}> => {
  const stripeAppearance = resolveStripedAppearance({
    stripeFrequency: options.stripeFrequency,
    stripeWidth: options.stripeWidth,
    stripeAngle: options.stripeAngle,
  });
  const normalColors = colorsForSectionCapTint(options.tintHex, options.stripeFrequency, options.stripeWidth);

  return {
    normalBaseColor: colorToComponents(normalColors.baseColor),
    normalStripeColor: colorToComponents(normalColors.stripeColor),
    overlapBaseColor: colorToComponents(sectionCapOverlapBaseHex),
    overlapStripeColor: colorToComponents(sectionCapOverlapStripeHex),
    normalStripeAxis: stripeAxisForAngle(stripeAppearance.stripeAngle),
    overlapStripeAxis: stripeAxisForAngle(stripeAppearance.stripeAngle + Math.PI / 2),
  };
};

export const applySectionCapStyleToPackedBuffers = (
  buffers: PackedSectionCapGeometryBuffers,
  options: {
    tintHex: number;
    stripeFrequency: number;
    stripeWidth: number;
    stripeAngle?: number;
  },
): PackedSectionCapGeometryBuffers => {
  const style = resolveSectionCapStyle(options);
  const vertexCount = buffers.positions.length / 3;

  for (let index = 0; index < vertexCount; index++) {
    const regionKind = buffers.regionKinds[index] ?? sectionCapNormalRegionKind;
    const isOverlap = regionKind === sectionCapOverlapRegionKind;
    const baseColor = isOverlap ? style.overlapBaseColor : style.normalBaseColor;
    const stripeColor = isOverlap ? style.overlapStripeColor : style.normalStripeColor;
    const stripeAxis = isOverlap ? style.overlapStripeAxis : style.normalStripeAxis;
    const colorOffset = index * 3;
    const axisOffset = index * 2;

    buffers.baseColors[colorOffset] = baseColor[0];
    buffers.baseColors[colorOffset + 1] = baseColor[1];
    buffers.baseColors[colorOffset + 2] = baseColor[2];
    buffers.stripeColors[colorOffset] = stripeColor[0];
    buffers.stripeColors[colorOffset + 1] = stripeColor[1];
    buffers.stripeColors[colorOffset + 2] = stripeColor[2];
    buffers.patternStrengths[index] = 1;
    buffers.stripeAxes[axisOffset] = stripeAxis[0];
    buffers.stripeAxes[axisOffset + 1] = stripeAxis[1];
  }

  return buffers;
};
