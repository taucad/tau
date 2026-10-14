import { describe, expect, it } from 'vitest';
import { formatNumberAbbreviation, formatUnitDisplay, roundToSignificantFigures } from '#utils/number.utils.js';

describe('roundToSignificantFigures', () => {
  it('should handle zero', () => {
    expect(roundToSignificantFigures(0, 3)).toBe(0);
  });

  it('should handle infinity and NaN', () => {
    expect(roundToSignificantFigures(Number.POSITIVE_INFINITY, 3)).toBe(Number.POSITIVE_INFINITY);
    expect(roundToSignificantFigures(Number.NEGATIVE_INFINITY, 3)).toBe(Number.NEGATIVE_INFINITY);
    expect(roundToSignificantFigures(Number.NaN, 3)).toBe(Number.NaN);
  });

  it('should round to specified significant figures', () => {
    expect(roundToSignificantFigures(1.2345, 3)).toBeCloseTo(1.23, 10);
    expect(roundToSignificantFigures(12.345, 3)).toBeCloseTo(12.3, 10);
    expect(roundToSignificantFigures(123.45, 3)).toBeCloseTo(123, 10);
    expect(roundToSignificantFigures(0.012345, 3)).toBeCloseTo(0.0123, 10);
  });

  it('should handle negative values', () => {
    expect(roundToSignificantFigures(-1.2345, 3)).toBeCloseTo(-1.23, 10);
    expect(roundToSignificantFigures(-0.012345, 3)).toBeCloseTo(-0.0123, 10);
  });

  it('should handle 4 significant figures', () => {
    expect(roundToSignificantFigures(1.23456, 4)).toBeCloseTo(1.235, 10);
    expect(roundToSignificantFigures(0.123456, 4)).toBeCloseTo(0.1235, 10);
    expect(roundToSignificantFigures(12.3456, 4)).toBeCloseTo(12.35, 10);
  });
});

describe('formatUnitDisplay', () => {
  describe('with default options', () => {
    it('should format zero', () => {
      expect(formatUnitDisplay(0)).toBe('0');
    });

    it('should format simple values', () => {
      expect(formatUnitDisplay(1.5)).toBe('1.5');
      expect(formatUnitDisplay(12.5)).toBe('12.5');
      expect(formatUnitDisplay(125)).toBe('125');
    });

    it('should format with 4 significant figures', () => {
      expect(formatUnitDisplay(1.234567)).toBe('1.235');
      expect(formatUnitDisplay(12.34567)).toBe('12.35');
      expect(formatUnitDisplay(123.4567)).toBe('123.5');
    });

    it('should remove trailing zeros by default', () => {
      expect(formatUnitDisplay(1.5)).toBe('1.5');
      expect(formatUnitDisplay(12)).toBe('12');
      expect(formatUnitDisplay(0.125)).toBe('0.125');
    });

    it('should handle small values', () => {
      expect(formatUnitDisplay(0.001234)).toBe('0.001234');
      expect(formatUnitDisplay(0.00012345)).toBe('0.0001235'); // Stays fixed format above 1e-4
    });

    it('should handle large values', () => {
      expect(formatUnitDisplay(999_999)).toBe('1e+6'); // Rounds to 1e6, uses scientific notation
      expect(formatUnitDisplay(1_234_567)).toBe('1.235e+6'); // Scientific notation at 1e6 and above
    });
  });

  describe('with preserveTrailingZeros', () => {
    it('should preserve trailing zeros', () => {
      expect(formatUnitDisplay(1.5, { preserveTrailingZeros: true })).toBe('1.500');
      expect(formatUnitDisplay(12, { preserveTrailingZeros: true })).toBe('12.00');
      expect(formatUnitDisplay(0.125, { preserveTrailingZeros: true })).toBe('0.1250');
    });
  });

  describe('with custom significant figures', () => {
    it('should format with 2 significant figures', () => {
      expect(formatUnitDisplay(1.2345, { significantFigures: 2 })).toBe('1.2');
      expect(formatUnitDisplay(12.345, { significantFigures: 2 })).toBe('12');
    });

    it('should format with 6 significant figures', () => {
      expect(formatUnitDisplay(1.23456789, { significantFigures: 6 })).toBe('1.23457');
    });
  });
});

describe('formatNumberAbbreviation', () => {
  describe('edge cases', () => {
    it('should return "0" for zero value', () => {
      expect(formatNumberAbbreviation(0)).toBe('0');
    });

    it('should return "0" for infinity', () => {
      expect(formatNumberAbbreviation(Number.POSITIVE_INFINITY)).toBe('0');
    });

    it('should return "0" for negative infinity', () => {
      expect(formatNumberAbbreviation(Number.NEGATIVE_INFINITY)).toBe('0');
    });

    it('should return "0" for NaN', () => {
      expect(formatNumberAbbreviation(Number.NaN)).toBe('0');
    });
  });

  describe('values below threshold', () => {
    it('should format small numbers with locale string', () => {
      expect(formatNumberAbbreviation(999)).toBe('999');
      expect(formatNumberAbbreviation(100)).toBe('100');
      expect(formatNumberAbbreviation(1)).toBe('1');
    });

    it('should format negative small numbers', () => {
      expect(formatNumberAbbreviation(-999)).toBe('-999');
      expect(formatNumberAbbreviation(-100)).toBe('-100');
    });
  });

  describe('thousands (K)', () => {
    it('should format 1000 as 1K', () => {
      expect(formatNumberAbbreviation(1000)).toBe('1K');
    });

    it('should format 1500 as 1.5K', () => {
      expect(formatNumberAbbreviation(1500)).toBe('1.5K');
    });

    it('should format 11000 as 11K', () => {
      expect(formatNumberAbbreviation(11_000)).toBe('11K');
    });

    it('should format 15500 as 16K with default 2 significant figures', () => {
      expect(formatNumberAbbreviation(15_500)).toBe('16K');
    });

    it('should format 100000 as 100K', () => {
      expect(formatNumberAbbreviation(100_000)).toBe('100K');
    });

    it('should format 374218 as 370K', () => {
      expect(formatNumberAbbreviation(374_218)).toBe('370K');
    });

    it('should format 607490 as 610K', () => {
      expect(formatNumberAbbreviation(607_490)).toBe('610K');
    });

    it('should format 991792 as 990K', () => {
      expect(formatNumberAbbreviation(991_792)).toBe('990K');
    });
  });

  describe('millions (M)', () => {
    it('should format 1000000 as 1M', () => {
      expect(formatNumberAbbreviation(1_000_000)).toBe('1M');
    });

    it('should format 2423525 as 2.4M', () => {
      expect(formatNumberAbbreviation(2_423_525)).toBe('2.4M');
    });

    it('should format 10000000 as 10M', () => {
      expect(formatNumberAbbreviation(10_000_000)).toBe('10M');
    });

    it('should format 100000000 as 100M', () => {
      expect(formatNumberAbbreviation(100_000_000)).toBe('100M');
    });
  });

  describe('billions (B)', () => {
    it('should format 1000000000 as 1B', () => {
      expect(formatNumberAbbreviation(1_000_000_000)).toBe('1B');
    });

    it('should format 2500000000 as 2.5B', () => {
      expect(formatNumberAbbreviation(2_500_000_000)).toBe('2.5B');
    });
  });

  describe('trillions (T)', () => {
    it('should format 1000000000000 as 1T', () => {
      expect(formatNumberAbbreviation(1_000_000_000_000)).toBe('1T');
    });

    it('should format 2500000000000 as 2.5T', () => {
      expect(formatNumberAbbreviation(2_500_000_000_000)).toBe('2.5T');
    });
  });

  describe('negative values', () => {
    it('should format negative thousands', () => {
      expect(formatNumberAbbreviation(-1000)).toBe('-1K');
      expect(formatNumberAbbreviation(-11_000)).toBe('-11K');
    });

    it('should format negative millions', () => {
      expect(formatNumberAbbreviation(-2_423_525)).toBe('-2.4M');
    });
  });

  describe('custom significant figures', () => {
    it('should format with 3 significant figures', () => {
      expect(formatNumberAbbreviation(2_423_525, { significantFigures: 3 })).toBe('2.42M');
      expect(formatNumberAbbreviation(374_218, { significantFigures: 3 })).toBe('374K');
    });

    it('should format with 1 significant figure', () => {
      expect(formatNumberAbbreviation(2_423_525, { significantFigures: 1 })).toBe('2M');
      expect(formatNumberAbbreviation(7_500_000, { significantFigures: 1 })).toBe('8M');
    });
  });

  describe('custom compact threshold', () => {
    it('should use custom threshold for compact notation', () => {
      expect(formatNumberAbbreviation(500, { compactThreshold: 100 })).toBe('500');
      expect(formatNumberAbbreviation(500, { compactThreshold: 1000 })).toBe('500');
    });
  });
});
