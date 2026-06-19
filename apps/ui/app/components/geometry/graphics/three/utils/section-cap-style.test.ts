// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applySectionCapStyleToPackedBuffers,
  sectionCapNormalRegionKind,
  sectionCapOverlapRegionKind,
} from '#components/geometry/graphics/three/utils/section-cap-style.js';
import type { PackedSectionCapGeometryBuffers } from '#components/geometry/graphics/three/utils/section-cap-packed-geometry.js';

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
    const firstNormalBaseColor = [...buffers.baseColors.slice(0, 3)];
    const firstOverlapBaseColor = [...buffers.baseColors.slice(3, 6)];
    const firstOverlapStripeColor = [...buffers.stripeColors.slice(3, 6)];

    applySectionCapStyleToPackedBuffers(buffers, {
      tintHex: 0x99_66_33,
      stripeFrequency: 2,
      stripeWidth: 0.2,
    });

    expect([...buffers.baseColors.slice(0, 3)]).not.toEqual(firstNormalBaseColor);
    expect([...buffers.baseColors.slice(3, 6)]).toEqual(firstOverlapBaseColor);
    expect([...buffers.stripeColors.slice(3, 6)]).toEqual(firstOverlapStripeColor);
    expect(new Set(buffers.patternStrengths)).toEqual(new Set([1]));
  });
});
