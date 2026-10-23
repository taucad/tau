// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applySectionCapStyleToPackedBuffers,
  colorToComponents,
  resolveSectionCapStyle,
  sectionCapNormalRegionKind,
  sectionCapOverlapRegionKind,
} from '#graphics/three/utils/section-cap-style.js';
import type { PackedSectionCapGeometryBuffers } from '#graphics/three/utils/section-cap-packed-geometry.js';

const createBuffers = (): PackedSectionCapGeometryBuffers => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0]),
  planeUv: new Float32Array([0, 0, 1, 0]),
  baseColors: new Float32Array(6),
  stripeColors: new Float32Array(6),
  patternStrengths: new Float32Array(2),
  stripeAxes: new Float32Array(4),
  regionKinds: new Uint8Array([sectionCapNormalRegionKind, sectionCapOverlapRegionKind]),
  indices: new Uint32Array([0, 1]),
});

describe('applySectionCapStyleToPackedBuffers', () => {
  it('should repaint normal vertices from tint while preserving fixed overlap diagnostics', () => {
    const buffers = createBuffers();

    applySectionCapStyleToPackedBuffers(buffers, {
      tintHex: 0x33_66_99,
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });
    const firstNormalBaseColor = buffers.baseColors.slice(0, 3);
    const firstOverlapBaseColor = buffers.baseColors.slice(3, 6);
    const firstOverlapStripeColor = buffers.stripeColors.slice(3, 6);

    applySectionCapStyleToPackedBuffers(buffers, {
      tintHex: 0x99_66_33,
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });

    expect(buffers.baseColors.slice(0, 3)).not.toEqual(firstNormalBaseColor);
    expect(buffers.baseColors.slice(3, 6)).toEqual(firstOverlapBaseColor);
    expect(buffers.stripeColors.slice(3, 6)).toEqual(firstOverlapStripeColor);
    expect(new Set(buffers.patternStrengths)).toEqual(new Set([1]));
  });
});

describe('resolveSectionCapStyle', () => {
  const style = (tintHex: number, stripeAngle?: number): ReturnType<typeof resolveSectionCapStyle> =>
    resolveSectionCapStyle({
      tintHex,
      stripeFrequency: 2,
      stripeWidth: 0.1,
      stripeAngle,
    });
  const lightness = ([red, green, blue]: readonly [number, number, number]): number =>
    0.2126 * red + 0.7152 * green + 0.0722 * blue;

  it('should fill a cap with its tint, in linear light', () => {
    const tint = new THREE.Color(0x6b_7f_c0);
    expect(style(0x6b_7f_c0).normalBaseColor).toEqual([tint.r, tint.g, tint.b]);
    expect(colorToComponents(0xff_ff_ff)).toEqual([1, 1, 1]);
  });

  it('should draw darker stripes on light and mid-tone tints, and lighter stripes on dark ones', () => {
    for (const tintHex of [0xdd_dd_dd, 0x6b_7f_c0, 0xf9_73_16]) {
      const { normalBaseColor, normalStripeColor } = style(tintHex);
      expect(lightness(normalStripeColor)).toBeLessThan(lightness(normalBaseColor) * 0.5);
    }
    for (const tintHex of [0x00_00_00, 0x22_22_22, 0x1e_3a_8a]) {
      const { normalBaseColor, normalStripeColor } = style(tintHex);
      expect(lightness(normalStripeColor)).toBeGreaterThan(lightness(normalBaseColor) + 0.5);
    }
  });

  it('should hatch a part at its own angle, 45 degrees by default', () => {
    expect(style(0, Math.PI / 6).normalStripeAxis).toEqual([Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)]);
    expect(style(0).normalStripeAxis).toEqual([Math.SQRT1_2, Math.SQRT1_2].map((value) => expect.closeTo(value)));
  });
});
