import { describe, expect, it } from 'vitest';
import { clamp, formatNumberEngineeringNotation } from '#utils/number.utils.js';

describe('formatNumberEngineeringNotation', () => {
  describe('edge cases', () => {
    it('should return "0" for zero value', () => {
      expect(formatNumberEngineeringNotation(0, 3)).toBe('0');
    });

    it('should return "0" for infinity', () => {
      expect(formatNumberEngineeringNotation(Number.POSITIVE_INFINITY, 3)).toBe('0');
    });

    it('should return "0" for negative infinity', () => {
      expect(formatNumberEngineeringNotation(Number.NEGATIVE_INFINITY, 3)).toBe('0');
    });

    it('should return "0" for NaN', () => {
      expect(formatNumberEngineeringNotation(Number.NaN, 3)).toBe('0');
    });
  });

  describe('values less than 1000', () => {
    describe('with 3 digits', () => {
      it('should format single digit decimal', () => {
        expect(formatNumberEngineeringNotation(1.5, 3)).toBe('1.5');
      });

      it('should format two digit decimal', () => {
        expect(formatNumberEngineeringNotation(12.5, 3)).toBe('12.5');
      });

      it('should format three digit integer', () => {
        expect(formatNumberEngineeringNotation(125, 3)).toBe('125');
      });

      it('should format three digit decimal', () => {
        expect(formatNumberEngineeringNotation(999, 3)).toBe('999');
      });

      it('should format with proper decimal places', () => {
        expect(formatNumberEngineeringNotation(1.234_567, 3)).toBe('1.23');
      });

      it('should remove trailing zeros', () => {
        expect(formatNumberEngineeringNotation(1.5, 3)).toBe('1.5');
      });

      it('should format integer with no decimals when at max digits', () => {
        expect(formatNumberEngineeringNotation(999.999, 3)).toBe('1000');
      });
    });

    describe('with 1 digit', () => {
      it('should round to nearest integer for single digit', () => {
        expect(formatNumberEngineeringNotation(1.5, 1)).toBe('2');
      });

      it('should round two digit numbers', () => {
        expect(formatNumberEngineeringNotation(12.5, 1)).toBe('13');
      });

      it('should keep three digit numbers as is', () => {
        expect(formatNumberEngineeringNotation(125, 1)).toBe('125');
      });
    });

    describe('with 5 digits', () => {
      it('should format with maximum precision', () => {
        expect(formatNumberEngineeringNotation(1.2345, 5)).toBe('1.2345');
      });

      it('should format two digit number with precision', () => {
        expect(formatNumberEngineeringNotation(12.345, 5)).toBe('12.345');
      });

      it('should format three digit number with precision', () => {
        expect(formatNumberEngineeringNotation(123.45, 5)).toBe('123.45');
      });
    });
  });

  describe('engineering notation (values >= 1000)', () => {
    describe('with 3 digits', () => {
      it('should format 1000 as 1e3', () => {
        expect(formatNumberEngineeringNotation(1000, 3)).toBe('1e3');
      });

      it('should format 1500 as 1.5e3', () => {
        expect(formatNumberEngineeringNotation(1500, 3)).toBe('1.5e3');
      });

      it('should format 5000 as 5e3', () => {
        expect(formatNumberEngineeringNotation(5000, 3)).toBe('5e3');
      });

      it('should format 10000 as 10e3', () => {
        expect(formatNumberEngineeringNotation(10_000, 3)).toBe('10e3');
      });

      it('should format 50000 as 50e3', () => {
        expect(formatNumberEngineeringNotation(50_000, 3)).toBe('50e3');
      });

      it('should format 100000 as 100e3', () => {
        expect(formatNumberEngineeringNotation(100_000, 3)).toBe('100e3');
      });

      it('should format 500000 as 500e3', () => {
        expect(formatNumberEngineeringNotation(500_000, 3)).toBe('500e3');
      });

      it('should format 1000000 as 1e6', () => {
        expect(formatNumberEngineeringNotation(1_000_000, 3)).toBe('1e6');
      });

      it('should format 5000000 as 5e6', () => {
        expect(formatNumberEngineeringNotation(5_000_000, 3)).toBe('5e6');
      });

      it('should format 10000000 as 10e6', () => {
        expect(formatNumberEngineeringNotation(10_000_000, 3)).toBe('10e6');
      });

      it('should format 100000000 as 100e6', () => {
        expect(formatNumberEngineeringNotation(100_000_000, 3)).toBe('100e6');
      });

      it('should format 1000000000 as 1e9', () => {
        expect(formatNumberEngineeringNotation(1_000_000_000, 3)).toBe('1e9');
      });

      it('should format values with decimals in engineering notation', () => {
        expect(formatNumberEngineeringNotation(1234, 3)).toBe('1.23e3');
      });

      it('should format values and remove trailing zeros', () => {
        expect(formatNumberEngineeringNotation(1200, 3)).toBe('1.2e3');
      });
    });

    describe('with 1 digit', () => {
      it('should format 1000 as 1e3', () => {
        expect(formatNumberEngineeringNotation(1000, 1)).toBe('1e3');
      });

      it('should round mantissa for 1 digit', () => {
        expect(formatNumberEngineeringNotation(1500, 1)).toBe('2e3');
      });

      it('should format 10000 as 10e3', () => {
        expect(formatNumberEngineeringNotation(10_000, 1)).toBe('10e3');
      });

      it('should format 100000 as 100e3', () => {
        expect(formatNumberEngineeringNotation(100_000, 1)).toBe('100e3');
      });
    });

    describe('with 5 digits', () => {
      it('should format with high precision mantissa', () => {
        expect(formatNumberEngineeringNotation(1234.5, 5)).toBe('1.2345e3');
      });

      it('should format larger values with precision', () => {
        expect(formatNumberEngineeringNotation(12_345, 5)).toBe('12.345e3');
      });

      it('should format very large values', () => {
        expect(formatNumberEngineeringNotation(123_450, 5)).toBe('123.45e3');
      });
    });

    describe('exponent multiples of 3', () => {
      it('should use e3 for thousands', () => {
        expect(formatNumberEngineeringNotation(5432, 3)).toBe('5.43e3');
      });

      it('should use e6 for millions', () => {
        expect(formatNumberEngineeringNotation(5_432_000, 3)).toBe('5.43e6');
      });

      it('should use e9 for billions', () => {
        expect(formatNumberEngineeringNotation(5_432_000_000, 3)).toBe('5.43e9');
      });

      it('should not use e4 or e5 (should jump from e3 to e6)', () => {
        const result = formatNumberEngineeringNotation(54_320, 3);
        expect(result).toBe('54.3e3');
        expect(result).not.toContain('e4');
        expect(result).not.toContain('e5');
      });
    });
  });

  describe('precision and rounding', () => {
    it('should round properly when exceeding max digits', () => {
      expect(formatNumberEngineeringNotation(99.95, 3)).toBe('100');
    });

    it('should format mantissa with proper precision in engineering notation', () => {
      expect(formatNumberEngineeringNotation(9995, 3)).toBe('9.99e3');
    });

    it('should handle large mantissa values', () => {
      expect(formatNumberEngineeringNotation(999_500, 3)).toBe('1000e3');
    });

    it('should preserve precision for exact values', () => {
      expect(formatNumberEngineeringNotation(2.5, 3)).toBe('2.5');
    });

    it('should remove trailing decimal zeros', () => {
      expect(formatNumberEngineeringNotation(2, 3)).toBe('2');
    });

    it('should remove trailing zeros in engineering notation', () => {
      expect(formatNumberEngineeringNotation(2000, 3)).toBe('2e3');
    });
  });

  describe('different digit configurations', () => {
    it('should respect 1 digit limit', () => {
      expect(formatNumberEngineeringNotation(7, 1)).toBe('7');
    });

    it('should respect 2 digit limit', () => {
      expect(formatNumberEngineeringNotation(42, 2)).toBe('42');
    });

    it('should respect 3 digit limit', () => {
      expect(formatNumberEngineeringNotation(123, 3)).toBe('123');
    });

    it('should respect 4 digit limit', () => {
      expect(formatNumberEngineeringNotation(1.234, 4)).toBe('1.234');
    });

    it('should respect 5 digit limit', () => {
      expect(formatNumberEngineeringNotation(1.2345, 5)).toBe('1.2345');
    });
  });
});

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
      expect(clamp(3.141_59, 0, 10)).toBe(3.141_59);
    });

    it('should preserve decimal precision for large decimals', () => {
      expect(clamp(7.890_12, 0, 10)).toBe(7.890_12);
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
