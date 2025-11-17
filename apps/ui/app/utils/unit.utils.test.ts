import { describe, it, expect } from 'vitest';
import {
  convertLength,
  convertLengthWithAliases,
  normalizeUnit,
  formatLengthDisplay,
  parseLengthInput,
  roundToSignificantFigures,
  isApproximatelyEqual,
  lengthUnitToMm,
} from '#utils/unit.utils.js';

describe('normalizeUnit', () => {
  it('should normalize direct unit symbols', () => {
    expect(normalizeUnit('mm')).toBe('mm');
    expect(normalizeUnit('cm')).toBe('cm');
    expect(normalizeUnit('m')).toBe('m');
    expect(normalizeUnit('in')).toBe('in');
    expect(normalizeUnit('ft')).toBe('ft');
    expect(normalizeUnit('yd')).toBe('yd');
  });

  it('should normalize unit aliases', () => {
    expect(normalizeUnit('millimeter')).toBe('mm');
    expect(normalizeUnit('millimeters')).toBe('mm');
    expect(normalizeUnit('centimeter')).toBe('cm');
    expect(normalizeUnit('meter')).toBe('m');
    expect(normalizeUnit('inch')).toBe('in');
    expect(normalizeUnit('inches')).toBe('in');
    expect(normalizeUnit('"')).toBe('in');
    expect(normalizeUnit('foot')).toBe('ft');
    expect(normalizeUnit('feet')).toBe('ft');
    expect(normalizeUnit("'")).toBe('ft');
    expect(normalizeUnit('yard')).toBe('yd');
  });

  it('should handle case insensitivity', () => {
    expect(normalizeUnit('MM')).toBe('mm');
    expect(normalizeUnit('Inches')).toBe('in');
    expect(normalizeUnit('FEET')).toBe('ft');
  });

  it('should return undefined for invalid units', () => {
    expect(normalizeUnit('invalid')).toBeUndefined();
    expect(normalizeUnit('km')).toBeUndefined();
    expect(normalizeUnit('')).toBeUndefined();
  });
});

describe('convertLength', () => {
  it('should return same value when converting to same unit', () => {
    expect(convertLength(10, 'mm', 'mm')).toBe(10);
    expect(convertLength(5.5, 'in', 'in')).toBe(5.5);
  });

  it('should convert between metric units', () => {
    expect(convertLength(10, 'mm', 'cm')).toBe(1);
    expect(convertLength(1, 'cm', 'mm')).toBe(10);
    expect(convertLength(1000, 'mm', 'm')).toBe(1);
    expect(convertLength(1, 'm', 'mm')).toBe(1000);
  });

  it('should convert between imperial units', () => {
    expect(convertLength(12, 'in', 'ft')).toBeCloseTo(1, 10);
    expect(convertLength(1, 'ft', 'in')).toBeCloseTo(12, 10);
    expect(convertLength(36, 'in', 'yd')).toBeCloseTo(1, 10);
    expect(convertLength(3, 'ft', 'yd')).toBeCloseTo(1, 10);
  });

  it('should convert between metric and imperial', () => {
    expect(convertLength(25.4, 'mm', 'in')).toBeCloseTo(1, 10);
    expect(convertLength(1, 'in', 'mm')).toBeCloseTo(25.4, 10);
    expect(convertLength(304.8, 'mm', 'ft')).toBeCloseTo(1, 10);
    expect(convertLength(1, 'ft', 'mm')).toBeCloseTo(304.8, 10);
  });

  it('should handle decimal values', () => {
    expect(convertLength(2.54, 'cm', 'in')).toBeCloseTo(1, 10);
    expect(convertLength(0.5, 'in', 'mm')).toBeCloseTo(12.7, 10);
  });

  it('should handle negative values', () => {
    expect(convertLength(-10, 'mm', 'cm')).toBe(-1);
    expect(convertLength(-1, 'in', 'mm')).toBeCloseTo(-25.4, 10);
  });
});

describe('convertLengthWithAliases', () => {
  it('should convert using aliases', () => {
    expect(convertLengthWithAliases(1, 'inch', 'mm')).toBeCloseTo(25.4, 10);
    expect(convertLengthWithAliases(1, 'foot', 'inches')).toBeCloseTo(12, 10);
    expect(convertLengthWithAliases(10, 'millimeters', 'centimeter')).toBe(1);
  });

  it('should return undefined for invalid units', () => {
    expect(convertLengthWithAliases(1, 'invalid', 'mm')).toBeUndefined();
    expect(convertLengthWithAliases(1, 'mm', 'invalid')).toBeUndefined();
  });
});

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
    expect(roundToSignificantFigures(0.012_345, 3)).toBeCloseTo(0.0123, 10);
  });

  it('should handle negative values', () => {
    expect(roundToSignificantFigures(-1.2345, 3)).toBeCloseTo(-1.23, 10);
    expect(roundToSignificantFigures(-0.012_345, 3)).toBeCloseTo(-0.0123, 10);
  });

  it('should handle 4 significant figures', () => {
    expect(roundToSignificantFigures(1.234_56, 4)).toBeCloseTo(1.235, 10);
    expect(roundToSignificantFigures(0.123_456, 4)).toBeCloseTo(0.1235, 10);
    expect(roundToSignificantFigures(12.3456, 4)).toBeCloseTo(12.35, 10);
  });
});

describe('formatLengthDisplay', () => {
  describe('with default options', () => {
    it('should format zero', () => {
      expect(formatLengthDisplay(0)).toBe('0');
    });

    it('should format simple values', () => {
      expect(formatLengthDisplay(1.5)).toBe('1.5');
      expect(formatLengthDisplay(12.5)).toBe('12.5');
      expect(formatLengthDisplay(125)).toBe('125');
    });

    it('should format with 4 significant figures', () => {
      expect(formatLengthDisplay(1.234_567)).toBe('1.235');
      expect(formatLengthDisplay(12.345_67)).toBe('12.35');
      expect(formatLengthDisplay(123.4567)).toBe('123.5');
    });

    it('should remove trailing zeros by default', () => {
      expect(formatLengthDisplay(1.5)).toBe('1.5');
      expect(formatLengthDisplay(12)).toBe('12');
      expect(formatLengthDisplay(0.125)).toBe('0.125');
    });

    it('should handle small values', () => {
      expect(formatLengthDisplay(0.001_234)).toBe('0.001234');
      expect(formatLengthDisplay(0.000_123_45)).toBe('0.0001235'); // Stays fixed format above 1e-4
    });

    it('should handle large values', () => {
      expect(formatLengthDisplay(999_999)).toBe('1e+6'); // Rounds to 1e6, uses scientific notation
      expect(formatLengthDisplay(1_234_567)).toBe('1.235e+6'); // Scientific notation at 1e6 and above
    });
  });

  describe('with preserveTrailingZeros', () => {
    it('should preserve trailing zeros', () => {
      expect(formatLengthDisplay(1.5, { preserveTrailingZeros: true })).toBe('1.500');
      expect(formatLengthDisplay(12, { preserveTrailingZeros: true })).toBe('12.00');
      expect(formatLengthDisplay(0.125, { preserveTrailingZeros: true })).toBe('0.1250');
    });
  });

  describe('with custom significant figures', () => {
    it('should format with 2 significant figures', () => {
      expect(formatLengthDisplay(1.2345, { significantFigures: 2 })).toBe('1.2');
      expect(formatLengthDisplay(12.345, { significantFigures: 2 })).toBe('12');
    });

    it('should format with 6 significant figures', () => {
      expect(formatLengthDisplay(1.234_567_89, { significantFigures: 6 })).toBe('1.23457');
    });
  });
});

describe('parseLengthInput', () => {
  describe('simple decimals', () => {
    it('should parse decimal numbers', () => {
      expect(parseLengthInput('12.5')).toEqual({ value: 12.5, unit: undefined });
      expect(parseLengthInput('0.5')).toEqual({ value: 0.5, unit: undefined });
      expect(parseLengthInput('-5.25')).toEqual({ value: -5.25, unit: undefined });
    });

    it('should parse decimals with units', () => {
      expect(parseLengthInput('12.5 mm')).toEqual({ value: 12.5, unit: 'mm' });
      expect(parseLengthInput('12.5mm')).toEqual({ value: 12.5, unit: 'mm' });
      expect(parseLengthInput('3.5 in')).toEqual({ value: 3.5, unit: 'in' });
      // Note: '2.5ft' matches the feet pattern which converts to inches
      expect(parseLengthInput('2.5 ft')).toEqual({ value: 30, unit: 'in' });
    });
  });

  describe('fractions', () => {
    it('should parse simple fractions', () => {
      expect(parseLengthInput('1/2')).toEqual({ value: 0.5, unit: undefined });
      expect(parseLengthInput('3/4')).toEqual({ value: 0.75, unit: undefined });
      expect(parseLengthInput('-1/4')).toEqual({ value: -0.25, unit: undefined });
    });

    it('should parse fractions with units', () => {
      expect(parseLengthInput('1/2 in')).toEqual({ value: 0.5, unit: 'in' });
      expect(parseLengthInput('3/4 mm')).toEqual({ value: 0.75, unit: 'mm' });
    });

    it('should parse mixed fractions', () => {
      expect(parseLengthInput('1 1/2')).toEqual({ value: 1.5, unit: undefined });
      expect(parseLengthInput('2-3/4')).toEqual({ value: 2.75, unit: undefined });
      expect(parseLengthInput('5 1/4 in')).toEqual({ value: 5.25, unit: 'in' });
    });

    it('should handle negative mixed fractions', () => {
      expect(parseLengthInput('-1 1/2')).toEqual({ value: -1.5, unit: undefined });
      expect(parseLengthInput('-2-3/4')).toEqual({ value: -2.75, unit: undefined });
    });

    it('should return undefined for division by zero', () => {
      expect(parseLengthInput('1/0')).toBeUndefined();
      expect(parseLengthInput('5 1/0')).toBeUndefined();
    });
  });

  describe('feet and inches', () => {
    it('should parse feet only', () => {
      expect(parseLengthInput("12'")).toEqual({ value: 144, unit: 'in' }); // 12 ft = 144 in
      expect(parseLengthInput('12ft')).toEqual({ value: 144, unit: 'in' });
      expect(parseLengthInput('12 feet')).toEqual({ value: 144, unit: 'in' });
    });

    it('should parse inches only with quotes', () => {
      expect(parseLengthInput('6"')).toEqual({ value: 6, unit: 'in' });
      expect(parseLengthInput('6in')).toEqual({ value: 6, unit: 'in' });
      expect(parseLengthInput('6 inches')).toEqual({ value: 6, unit: 'in' });
    });

    it('should parse feet and inches combined', () => {
      expect(parseLengthInput('12\' 6"')).toEqual({ value: 150, unit: 'in' }); // 12*12 + 6 = 150
      expect(parseLengthInput('5\' 11"')).toEqual({ value: 71, unit: 'in' }); // 5*12 + 11 = 71
      expect(parseLengthInput('12ft 6in')).toEqual({ value: 150, unit: 'in' });
    });

    it('should handle decimal feet and inches', () => {
      expect(parseLengthInput("1.5'")).toEqual({ value: 18, unit: 'in' }); // 1.5*12 = 18
      expect(parseLengthInput('2.5"')).toEqual({ value: 2.5, unit: 'in' });
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty or invalid input', () => {
      expect(parseLengthInput('')).toBeUndefined();
      expect(parseLengthInput('   ')).toBeUndefined();
      expect(parseLengthInput('abc')).toBeUndefined();
      expect(parseLengthInput('--5')).toBeUndefined();
    });

    it('should handle whitespace', () => {
      expect(parseLengthInput('  12.5  ')).toEqual({ value: 12.5, unit: undefined });
      expect(parseLengthInput('  12.5   mm  ')).toEqual({ value: 12.5, unit: 'mm' });
    });
  });
});

describe('isApproximatelyEqual', () => {
  it('should return true for equal values', () => {
    expect(isApproximatelyEqual(1, 1)).toBe(true);
    expect(isApproximatelyEqual(0, 0)).toBe(true);
    expect(isApproximatelyEqual(-5.5, -5.5)).toBe(true);
  });

  it('should return true for values within default tolerance', () => {
    expect(isApproximatelyEqual(1, 1 + 1e-11)).toBe(true);
    expect(isApproximatelyEqual(1, 1 - 1e-11)).toBe(true);
  });

  it('should return false for values outside default tolerance', () => {
    expect(isApproximatelyEqual(1, 1.0001)).toBe(false);
    expect(isApproximatelyEqual(1, 0.9999)).toBe(false);
  });

  it('should respect custom tolerance', () => {
    expect(isApproximatelyEqual(1, 1.001, 0.01)).toBe(true);
    expect(isApproximatelyEqual(1, 1.01, 0.01)).toBe(false);
  });

  it('should handle negative values', () => {
    expect(isApproximatelyEqual(-1, -1 + 1e-11)).toBe(true);
    expect(isApproximatelyEqual(-1, -1 - 1e-11)).toBe(true);
  });
});

describe('lengthUnitToMm constant', () => {
  it('should have correct conversion factors', () => {
    expect(lengthUnitToMm.mm).toBe(1);
    expect(lengthUnitToMm.cm).toBe(10);
    expect(lengthUnitToMm.m).toBe(1000);
    expect(lengthUnitToMm.in).toBe(25.4);
    expect(lengthUnitToMm.ft).toBe(304.8);
    expect(lengthUnitToMm.yd).toBe(914.4);
  });
});
