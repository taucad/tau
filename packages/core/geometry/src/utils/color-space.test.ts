import { describe, expect, it } from 'vitest';

import { srgbHexToLinearTuple, srgbToLinear, srgbTupleToLinear } from '#utils/color-space.js';

describe('color-space utilities', () => {
  describe('srgbToLinear', () => {
    it('returns 0 for 0', () => {
      expect(srgbToLinear(0)).toBe(0);
    });

    it('returns 1 for 1', () => {
      expect(srgbToLinear(1)).toBeCloseTo(1, 6);
    });

    it('decodes mid-gray (0.5 sRGB ≈ 0.2140 linear)', () => {
      expect(srgbToLinear(0.5)).toBeCloseTo(0.214_041, 4);
    });

    it('uses the linear segment below the 0.04045 threshold', () => {
      expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 6);
    });

    it('uses the gamma-2.4 segment above the 0.04045 threshold', () => {
      expect(srgbToLinear(0.5)).toBeCloseTo(((0.5 + 0.055) / 1.055) ** 2.4, 6);
    });
  });

  describe('srgbTupleToLinear', () => {
    it('converts RGB channels and preserves alpha', () => {
      const result = srgbTupleToLinear([0.5, 0.5, 0.5, 0.75]);
      expect(result[0]).toBeCloseTo(0.214_041, 4);
      expect(result[1]).toBeCloseTo(0.214_041, 4);
      expect(result[2]).toBeCloseTo(0.214_041, 4);
      expect(result[3]).toBe(0.75);
    });

    it('does not gamma-correct alpha', () => {
      const result = srgbTupleToLinear([0, 0, 0, 0.5]);
      expect(result[3]).toBe(0.5);
    });
  });

  describe('srgbHexToLinearTuple', () => {
    it('parses pure red #FF0000 to [1, 0, 0, 1]', () => {
      const result = srgbHexToLinearTuple('#FF0000');
      expect(result[0]).toBeCloseTo(1, 6);
      expect(result[1]).toBe(0);
      expect(result[2]).toBe(0);
      expect(result[3]).toBe(1);
    });

    it('parses mid-gray #808080 to ~[0.2159, 0.2159, 0.2159, 1]', () => {
      // 128/255 = 0.50196 → linear ≈ 0.21586
      const result = srgbHexToLinearTuple('#808080');
      expect(result[0]).toBeCloseTo(0.215_861, 4);
      expect(result[1]).toBeCloseTo(0.215_861, 4);
      expect(result[2]).toBeCloseTo(0.215_861, 4);
      expect(result[3]).toBe(1);
    });

    it('accepts hex without leading #', () => {
      const result = srgbHexToLinearTuple('FF0000');
      expect(result[0]).toBeCloseTo(1, 6);
    });

    it('applies the supplied alpha verbatim', () => {
      const result = srgbHexToLinearTuple('#000000', 0.5);
      expect(result[3]).toBe(0.5);
    });

    it('parses reported washed-out colors deterministically', () => {
      const red = srgbHexToLinearTuple('#D94F4F');
      // 0xD9/255 ≈ 0.851 → linear ≈ 0.694; 0x4F/255 ≈ 0.310 → linear ≈ 0.077
      expect(red[0]).toBeCloseTo(0.694, 2);
      expect(red[1]).toBeCloseTo(0.077, 2);
      expect(red[2]).toBeCloseTo(0.077, 2);

      const blue = srgbHexToLinearTuple('#4F7FD9');
      // 0x7F/255 ≈ 0.498 → linear ≈ 0.212
      expect(blue[0]).toBeCloseTo(0.077, 2);
      expect(blue[1]).toBeCloseTo(0.212, 2);
      expect(blue[2]).toBeCloseTo(0.694, 2);
    });
  });
});
