import { describe, it, expect } from 'vitest';
import {
  convertLength,
  convertMass,
  convertTime,
  convertElectricCurrent,
  convertTemperature,
  convertAmountOfSubstance,
  convertLuminousIntensity,
} from '#converter/unit.converter.js';

// =============================================================================
// LENGTH CONVERSION TESTS
// =============================================================================

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

// =============================================================================
// MASS CONVERSION TESTS
// =============================================================================

describe('convertMass', () => {
  it('should return same value when converting to same unit', () => {
    expect(convertMass(10, 'kg', 'kg')).toBe(10);
    expect(convertMass(5.5, 'g', 'g')).toBe(5.5);
  });

  it('should convert between metric units', () => {
    expect(convertMass(1000, 'g', 'kg')).toBe(1);
    expect(convertMass(1, 'kg', 'g')).toBe(1000);
    expect(convertMass(1, 't', 'kg')).toBe(1000);
  });

  it('should convert between imperial and metric', () => {
    expect(convertMass(1, 'kg', 'lb')).toBeCloseTo(2.204_62, 3);
    expect(convertMass(1, 'lb', 'kg')).toBeCloseTo(0.453_592, 5);
  });
});

// =============================================================================
// TIME CONVERSION TESTS
// =============================================================================

describe('convertTime', () => {
  it('should return same value when converting to same unit', () => {
    expect(convertTime(10, 's', 's')).toBe(10);
  });

  it('should convert between time units', () => {
    expect(convertTime(60, 's', 'min')).toBe(1);
    expect(convertTime(1, 'min', 's')).toBe(60);
    expect(convertTime(3600, 's', 'h')).toBe(1);
    expect(convertTime(1, 'h', 'min')).toBe(60);
  });

  it('should handle SI prefixed units', () => {
    expect(convertTime(1000, 'ms', 's')).toBe(1);
    expect(convertTime(1, 's', 'ms')).toBe(1000);
  });
});

// =============================================================================
// TEMPERATURE CONVERSION TESTS
// =============================================================================

describe('convertTemperature', () => {
  it('should return same value when converting to same unit', () => {
    expect(convertTemperature(273.15, 'K', 'K')).toBe(273.15);
  });

  it('should convert between Celsius and Kelvin', () => {
    expect(convertTemperature(0, '°C', 'K')).toBeCloseTo(273.15, 5);
    expect(convertTemperature(273.15, 'K', '°C')).toBeCloseTo(0, 5);
    expect(convertTemperature(100, '°C', 'K')).toBeCloseTo(373.15, 5);
  });

  it('should convert between Fahrenheit and Celsius', () => {
    expect(convertTemperature(32, '°F', '°C')).toBeCloseTo(0, 5);
    expect(convertTemperature(0, '°C', '°F')).toBeCloseTo(32, 5);
    expect(convertTemperature(212, '°F', '°C')).toBeCloseTo(100, 5);
  });

  it('should convert between Fahrenheit and Kelvin', () => {
    expect(convertTemperature(32, '°F', 'K')).toBeCloseTo(273.15, 5);
    expect(convertTemperature(273.15, 'K', '°F')).toBeCloseTo(32, 5);
  });
});

// =============================================================================
// ELECTRIC CURRENT CONVERSION TESTS
// =============================================================================

describe('convertElectricCurrent', () => {
  it('should convert between SI prefix units', () => {
    expect(convertElectricCurrent(1000, 'mA', 'A')).toBe(1);
    expect(convertElectricCurrent(1, 'A', 'mA')).toBe(1000);
    expect(convertElectricCurrent(1, 'kA', 'A')).toBe(1000);
  });
});

// =============================================================================
// AMOUNT OF SUBSTANCE CONVERSION TESTS
// =============================================================================

describe('convertAmountOfSubstance', () => {
  it('should convert between SI prefix units', () => {
    expect(convertAmountOfSubstance(1000, 'mmol', 'mol')).toBe(1);
    expect(convertAmountOfSubstance(1, 'mol', 'mmol')).toBe(1000);
  });
});

// =============================================================================
// LUMINOUS INTENSITY CONVERSION TESTS
// =============================================================================

describe('convertLuminousIntensity', () => {
  it('should convert between SI prefix units', () => {
    expect(convertLuminousIntensity(1000, 'mcd', 'cd')).toBe(1);
    expect(convertLuminousIntensity(1, 'cd', 'mcd')).toBe(1000);
  });
});
