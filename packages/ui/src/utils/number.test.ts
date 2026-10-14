import { describe, expect, it } from 'vitest';
import { clamp } from '@taucad/ui/utils/number';

describe('clamp', () => {
  describe('values within range', () => {
    it('should return value when within min and max range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should preserve floating-point values within range', () => {
      expect(clamp(5.7, 0, 10)).toBe(5.7);
    });

    it('should handle negative values within range', () => {
      expect(clamp(-5, -10, 0)).toBe(-5);
    });

    it('should handle negative floating-point values within range', () => {
      expect(clamp(-3.2, -10, 0)).toBe(-3.2);
    });
  });

  describe('values outside range', () => {
    it('should clamp to max when value exceeds max', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should clamp to max with floating-point value', () => {
      expect(clamp(15.5, 0, 10)).toBe(10);
    });

    it('should clamp to min when value is below min', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp to min with floating-point value', () => {
      expect(clamp(-5.3, 0, 10)).toBe(0);
    });
  });

  describe('boundary values', () => {
    it('should return min when value equals min', () => {
      expect(clamp(0, 0, 10)).toBe(0);
    });

    it('should return max when value equals max', () => {
      expect(clamp(10, 0, 10)).toBe(10);
    });

    it('should handle floating-point min boundary', () => {
      expect(clamp(0.5, 0.5, 10.5)).toBe(0.5);
    });

    it('should handle floating-point max boundary', () => {
      expect(clamp(10.5, 0.5, 10.5)).toBe(10.5);
    });
  });

  describe('floating-point precision', () => {
    it('should preserve decimal precision for small decimals', () => {
      expect(clamp(3.14159, 0, 10)).toBe(3.14159);
    });

    it('should preserve decimal precision for large decimals', () => {
      expect(clamp(7.89012, 0, 10)).toBe(7.89012);
    });

    it('should not truncate floating-point values', () => {
      expect(clamp(5.999, 0, 10)).toBe(5.999);
      expect(clamp(5.999, 0, 10)).not.toBe(5);
    });

    it('should handle very small decimal values', () => {
      expect(clamp(0.001, 0, 1)).toBe(0.001);
    });
  });

  describe('negative ranges', () => {
    it('should work with negative min and max', () => {
      expect(clamp(-5, -10, -1)).toBe(-5);
    });

    it('should clamp to negative max', () => {
      expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('should clamp to negative min', () => {
      expect(clamp(-15, -10, -1)).toBe(-10);
    });
  });

  describe('edge cases', () => {
    it('should handle zero as value', () => {
      expect(clamp(0, -10, 10)).toBe(0);
    });

    it('should handle zero as min', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should handle zero as max', () => {
      expect(clamp(-5, -10, 0)).toBe(-5);
    });

    it('should handle same min and max', () => {
      expect(clamp(5, 10, 10)).toBe(10);
    });
  });
});
