import { describe, it, expect } from 'vitest';
import {
  parseLengthInput,
  parseMassInput,
  parseTimeInput,
  parseElectricCurrentInput,
  parseTemperatureInput,
  parseAmountOfSubstanceInput,
  parseLuminousIntensityInput,
  parseUnitInput,
} from '#parser/unit.parser.js';

describe('parseLengthInput', () => {
  describe('simple decimals', () => {
    it('should parse decimal numbers', () => {
      expect(parseLengthInput('12.5')).toEqual({ value: 12.5, unit: undefined, symbol: undefined, quantity: 'length' });
      expect(parseLengthInput('0.5')).toEqual({ value: 0.5, unit: undefined, symbol: undefined, quantity: 'length' });
      expect(parseLengthInput('-5.25')).toEqual({
        value: -5.25,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
    });

    it('should parse decimals with units', () => {
      expect(parseLengthInput('12.5 mm')).toEqual({
        value: 12.5,
        unit: 'millimeter',
        symbol: 'mm',
        quantity: 'length',
      });
      expect(parseLengthInput('12.5mm')).toEqual({ value: 12.5, unit: 'millimeter', symbol: 'mm', quantity: 'length' });
      expect(parseLengthInput('3.5 in')).toEqual({ value: 3.5, unit: 'inch', symbol: 'in', quantity: 'length' });
      // Note: '2.5ft' matches the feet pattern which converts to inches
      const result = parseLengthInput('2.5 ft');
      expect(result?.value).toBeCloseTo(30, 10);
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');
    });
  });

  describe('fractions', () => {
    it('should parse simple fractions', () => {
      expect(parseLengthInput('1/2')).toEqual({ value: 0.5, unit: undefined, symbol: undefined, quantity: 'length' });
      expect(parseLengthInput('3/4')).toEqual({ value: 0.75, unit: undefined, symbol: undefined, quantity: 'length' });
      expect(parseLengthInput('-1/4')).toEqual({
        value: -0.25,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
    });

    it('should parse fractions with units', () => {
      expect(parseLengthInput('1/2 in')).toEqual({ value: 0.5, unit: 'inch', symbol: 'in', quantity: 'length' });
      expect(parseLengthInput('3/4 mm')).toEqual({ value: 0.75, unit: 'millimeter', symbol: 'mm', quantity: 'length' });
    });

    it('should parse mixed fractions', () => {
      expect(parseLengthInput('1 1/2')).toEqual({ value: 1.5, unit: undefined, symbol: undefined, quantity: 'length' });
      expect(parseLengthInput('2-3/4')).toEqual({
        value: 2.75,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
      expect(parseLengthInput('5 1/4 in')).toEqual({ value: 5.25, unit: 'inch', symbol: 'in', quantity: 'length' });
    });

    it('should handle negative mixed fractions', () => {
      expect(parseLengthInput('-1 1/2')).toEqual({
        value: -1.5,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
      expect(parseLengthInput('-2-3/4')).toEqual({
        value: -2.75,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
    });

    it('should return undefined for division by zero', () => {
      expect(parseLengthInput('1/0')).toBeUndefined();
      expect(parseLengthInput('5 1/0')).toBeUndefined();
    });
  });

  describe('feet and inches', () => {
    it('should parse feet only', () => {
      // Use toBeCloseTo for feet conversions due to floating point precision
      let result = parseLengthInput("12'");
      expect(result?.value).toBeCloseTo(144, 10); // 12 ft = 144 in
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');

      result = parseLengthInput('12ft');
      expect(result?.value).toBeCloseTo(144, 10);
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');

      result = parseLengthInput('12 feet');
      expect(result?.value).toBeCloseTo(144, 10);
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');
    });

    it('should parse inches only with quotes', () => {
      expect(parseLengthInput('6"')).toEqual({ value: 6, unit: 'inch', symbol: 'in', quantity: 'length' });
      expect(parseLengthInput('6in')).toEqual({ value: 6, unit: 'inch', symbol: 'in', quantity: 'length' });
      expect(parseLengthInput('6 inches')).toEqual({ value: 6, unit: 'inch', symbol: 'in', quantity: 'length' });
    });

    it('should parse feet and inches combined', () => {
      // Use toBeCloseTo for feet conversions due to floating point precision
      let result = parseLengthInput('12\' 6"');
      expect(result?.value).toBeCloseTo(150, 10); // 12*12 + 6 = 150
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');

      result = parseLengthInput('5\' 11"');
      expect(result?.value).toBeCloseTo(71, 10); // 5*12 + 11 = 71
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');

      result = parseLengthInput('12ft 6in');
      expect(result?.value).toBeCloseTo(150, 10);
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');
    });

    it('should handle decimal feet and inches', () => {
      // Use toBeCloseTo for feet conversions due to floating point precision
      const result = parseLengthInput("1.5'");
      expect(result?.value).toBeCloseTo(18, 10); // 1.5*12 = 18
      expect(result?.unit).toBe('inch');
      expect(result?.symbol).toBe('in');
      expect(result?.quantity).toBe('length');

      expect(parseLengthInput('2.5"')).toEqual({ value: 2.5, unit: 'inch', symbol: 'in', quantity: 'length' });
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
      expect(parseLengthInput('  12.5  ')).toEqual({
        value: 12.5,
        unit: undefined,
        symbol: undefined,
        quantity: 'length',
      });
      expect(parseLengthInput('  12.5   mm  ')).toEqual({
        value: 12.5,
        unit: 'millimeter',
        symbol: 'mm',
        quantity: 'length',
      });
    });
  });
});

// =============================================================================
// MASS PARSER TESTS
// =============================================================================

describe('parseMassInput', () => {
  it('should parse mass values without units', () => {
    expect(parseMassInput('12.5')).toEqual({ value: 12.5, unit: undefined, symbol: undefined, quantity: 'mass' });
  });

  it('should parse mass values with units', () => {
    expect(parseMassInput('12.5 kg')).toEqual({ value: 12.5, unit: 'kilogram', symbol: 'kg', quantity: 'mass' });
    expect(parseMassInput('500g')).toEqual({ value: 500, unit: 'gram', symbol: 'g', quantity: 'mass' });
    expect(parseMassInput('2.5 lb')).toEqual({ value: 2.5, unit: 'pound', symbol: 'lb', quantity: 'mass' });
  });

  it('should parse SI magnitude-prefixed mass units', () => {
    expect(parseMassInput('100 mg')).toEqual({ value: 100, unit: 'milligram', symbol: 'mg', quantity: 'mass' });
    expect(parseMassInput('5μg')).toEqual({ value: 5, unit: 'microgram', symbol: 'μg', quantity: 'mass' });
    expect(parseMassInput('2.5 Mg')).toEqual({ value: 2.5, unit: 'megagram', symbol: 'Mg', quantity: 'mass' });
  });

  it('should parse unit names in addition to symbols', () => {
    expect(parseMassInput('100 milligram')).toEqual({ value: 100, unit: 'milligram', symbol: 'mg', quantity: 'mass' });
    expect(parseMassInput('5 kilogram')).toEqual({ value: 5, unit: 'kilogram', symbol: 'kg', quantity: 'mass' });
  });

  it('should return undefined for invalid input', () => {
    expect(parseMassInput('')).toBeUndefined();
    expect(parseMassInput('invalid')).toBeUndefined();
  });
});

// =============================================================================
// TIME PARSER TESTS
// =============================================================================

describe('parseTimeInput', () => {
  it('should parse time values without units', () => {
    expect(parseTimeInput('60')).toEqual({ value: 60, unit: undefined, symbol: undefined, quantity: 'time' });
  });

  it('should parse time values with units', () => {
    expect(parseTimeInput('60 s')).toEqual({ value: 60, unit: 'second', symbol: 's', quantity: 'time' });
    expect(parseTimeInput('5min')).toEqual({ value: 5, unit: 'minute', symbol: 'min', quantity: 'time' });
    expect(parseTimeInput('2 h')).toEqual({ value: 2, unit: 'hour', symbol: 'h', quantity: 'time' });
  });

  it('should parse SI magnitude-prefixed time units', () => {
    expect(parseTimeInput('100 ms')).toEqual({ value: 100, unit: 'millisecond', symbol: 'ms', quantity: 'time' });
    expect(parseTimeInput('50μs')).toEqual({ value: 50, unit: 'microsecond', symbol: 'μs', quantity: 'time' });
    expect(parseTimeInput('2 ns')).toEqual({ value: 2, unit: 'nanosecond', symbol: 'ns', quantity: 'time' });
  });

  it('should parse unit names', () => {
    expect(parseTimeInput('5 millisecond')).toEqual({ value: 5, unit: 'millisecond', symbol: 'ms', quantity: 'time' });
    expect(parseTimeInput('10 microsecond')).toEqual({
      value: 10,
      unit: 'microsecond',
      symbol: 'μs',
      quantity: 'time',
    });
  });
});

// =============================================================================
// TEMPERATURE PARSER TESTS
// =============================================================================

describe('parseTemperatureInput', () => {
  it('should parse temperature values with units', () => {
    expect(parseTemperatureInput('273.15 K')).toEqual({
      value: 273.15,
      unit: 'kelvin',
      symbol: 'K',
      quantity: 'thermodynamicTemperature',
    });
    expect(parseTemperatureInput('0 °C')).toEqual({
      value: 0,
      unit: 'celsius',
      symbol: '°C',
      quantity: 'thermodynamicTemperature',
    });
    expect(parseTemperatureInput('32°F')).toEqual({
      value: 32,
      unit: 'fahrenheit',
      symbol: '°F',
      quantity: 'thermodynamicTemperature',
    });
  });
});

// =============================================================================
// ELECTRIC CURRENT PARSER TESTS
// =============================================================================

describe('parseElectricCurrentInput', () => {
  it('should parse electric current values with units', () => {
    expect(parseElectricCurrentInput('1.5 A')).toEqual({
      value: 1.5,
      unit: 'ampere',
      symbol: 'A',
      quantity: 'electricCurrent',
    });
    expect(parseElectricCurrentInput('500mA')).toEqual({
      value: 500,
      unit: 'milliampere',
      symbol: 'mA',
      quantity: 'electricCurrent',
    });
  });

  it('should parse SI magnitude-prefixed current units', () => {
    expect(parseElectricCurrentInput('100 μA')).toEqual({
      value: 100,
      unit: 'microampere',
      symbol: 'μA',
      quantity: 'electricCurrent',
    });
    expect(parseElectricCurrentInput('5kA')).toEqual({
      value: 5,
      unit: 'kiloampere',
      symbol: 'kA',
      quantity: 'electricCurrent',
    });
  });

  it('should parse unit names', () => {
    expect(parseElectricCurrentInput('100 milliampere')).toEqual({
      value: 100,
      unit: 'milliampere',
      symbol: 'mA',
      quantity: 'electricCurrent',
    });
  });
});

// =============================================================================
// AMOUNT OF SUBSTANCE PARSER TESTS
// =============================================================================

describe('parseAmountOfSubstanceInput', () => {
  it('should parse amount of substance values with units', () => {
    expect(parseAmountOfSubstanceInput('2.5 mol')).toEqual({
      value: 2.5,
      unit: 'mole',
      symbol: 'mol',
      quantity: 'amountOfSubstance',
    });
    expect(parseAmountOfSubstanceInput('100mmol')).toEqual({
      value: 100,
      unit: 'millimole',
      symbol: 'mmol',
      quantity: 'amountOfSubstance',
    });
  });

  it('should parse SI magnitude-prefixed units', () => {
    expect(parseAmountOfSubstanceInput('50 μmol')).toEqual({
      value: 50,
      unit: 'micromole',
      symbol: 'μmol',
      quantity: 'amountOfSubstance',
    });
    expect(parseAmountOfSubstanceInput('3 kmol')).toEqual({
      value: 3,
      unit: 'kilomole',
      symbol: 'kmol',
      quantity: 'amountOfSubstance',
    });
  });

  it('should parse unit names', () => {
    expect(parseAmountOfSubstanceInput('100 millimole')).toEqual({
      value: 100,
      unit: 'millimole',
      symbol: 'mmol',
      quantity: 'amountOfSubstance',
    });
  });
});

// =============================================================================
// LUMINOUS INTENSITY PARSER TESTS
// =============================================================================

describe('parseLuminousIntensityInput', () => {
  it('should parse luminous intensity values with units', () => {
    expect(parseLuminousIntensityInput('5 cd')).toEqual({
      value: 5,
      unit: 'candela',
      symbol: 'cd',
      quantity: 'luminousIntensity',
    });
    expect(parseLuminousIntensityInput('1000mcd')).toEqual({
      value: 1000,
      unit: 'millicandela',
      symbol: 'mcd',
      quantity: 'luminousIntensity',
    });
  });

  it('should parse SI magnitude-prefixed units', () => {
    expect(parseLuminousIntensityInput('50 kcd')).toEqual({
      value: 50,
      unit: 'kilocandela',
      symbol: 'kcd',
      quantity: 'luminousIntensity',
    });
  });

  it('should parse unit names', () => {
    expect(parseLuminousIntensityInput('100 millicandela')).toEqual({
      value: 100,
      unit: 'millicandela',
      symbol: 'mcd',
      quantity: 'luminousIntensity',
    });
  });
});

// =============================================================================
// GENERIC PARSER TESTS
// =============================================================================

describe('parseUnitInput', () => {
  it('should parse and identify length inputs', () => {
    const result = parseUnitInput('12.5 mm');

    expect(result).toEqual({ value: 12.5, unit: 'millimeter', symbol: 'mm', quantity: 'length' });
  });

  it('should parse and identify mass inputs', () => {
    const result = parseUnitInput('2.5 kg');

    expect(result).toEqual({ value: 2.5, unit: 'kilogram', symbol: 'kg', quantity: 'mass' });
  });

  it('should parse and identify temperature inputs', () => {
    const result = parseUnitInput('0 °C');

    expect(result).toEqual({ value: 0, unit: 'celsius', symbol: '°C', quantity: 'thermodynamicTemperature' });
  });

  it('should parse SI magnitude-prefixed units', () => {
    expect(parseUnitInput('100 mg')).toEqual({ value: 100, unit: 'milligram', symbol: 'mg', quantity: 'mass' });
    expect(parseUnitInput('5 μA')).toEqual({
      value: 5,
      unit: 'microampere',
      symbol: 'μA',
      quantity: 'electricCurrent',
    });
    expect(parseUnitInput('2.5 ns')).toEqual({ value: 2.5, unit: 'nanosecond', symbol: 'ns', quantity: 'time' });
  });

  it('should parse unit names', () => {
    expect(parseUnitInput('50 milligram')).toEqual({ value: 50, unit: 'milligram', symbol: 'mg', quantity: 'mass' });
    expect(parseUnitInput('10 microsecond')).toEqual({
      value: 10,
      unit: 'microsecond',
      symbol: 'μs',
      quantity: 'time',
    });
  });

  it('should return undefined for invalid input', () => {
    expect(parseUnitInput('invalid')).toBeUndefined();
    expect(parseUnitInput('')).toBeUndefined();
  });
});
