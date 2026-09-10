import { describe, it, expect } from 'vitest';
import {
  convertQuantity,
  convertLength,
  convertMass,
  convertTime,
  convertElectricCurrent,
  convertTemperature,
  convertAmountOfSubstance,
  convertLuminousIntensity,
} from '#converter/unit.converter.js';
import { quantityIds, quantityRegistry } from '#constants/quantity.constants.js';
import type { QuantityId, UnitId } from '#types/unit.types.js';

const expectedDimensions = {
  length: { length: 1 },
  mass: { mass: 1 },
  time: { time: 1 },
  electricCurrent: { electricCurrent: 1 },
  thermodynamicTemperature: { thermodynamicTemperature: 1 },
  temperatureDifference: { thermodynamicTemperature: 1 },
  amountOfSubstance: { amountOfSubstance: 1 },
  luminousIntensity: { luminousIntensity: 1 },
  planeAngle: {},
  solidAngle: {},
  ratio: {},
  frequency: { time: -1 },
  force: { mass: 1, length: 1, time: -2 },
  pressure: { mass: 1, length: -1, time: -2 },
  energy: { mass: 1, length: 2, time: -2 },
  torque: { mass: 1, length: 2, time: -2 },
  power: { mass: 1, length: 2, time: -3 },
  electricCharge: { time: 1, electricCurrent: 1 },
  electricPotential: { mass: 1, length: 2, time: -3, electricCurrent: -1 },
  capacitance: { mass: -1, length: -2, time: 4, electricCurrent: 2 },
  electricalResistance: { mass: 1, length: 2, time: -3, electricCurrent: -2 },
  electricalConductance: { mass: -1, length: -2, time: 3, electricCurrent: 2 },
  magneticFlux: { mass: 1, length: 2, time: -2, electricCurrent: -1 },
  magneticFluxDensity: { mass: 1, time: -2, electricCurrent: -1 },
  inductance: { mass: 1, length: 2, time: -2, electricCurrent: -2 },
  luminousFlux: { luminousIntensity: 1 },
  illuminance: { luminousIntensity: 1, length: -2 },
  activityRadionuclide: { time: -1 },
  absorbedDose: { length: 2, time: -2 },
  doseEquivalent: { length: 2, time: -2 },
  catalyticActivity: { amountOfSubstance: 1, time: -1 },
  area: { length: 2 },
  volume: { length: 3 },
  speed: { length: 1, time: -1 },
  acceleration: { length: 1, time: -2 },
  density: { mass: 1, length: -3 },
} as const satisfies Record<QuantityId, Readonly<Record<string, number>>>;

describe('convertQuantity', () => {
  it('should match independent SI conversion oracles', () => {
    expect(convertQuantity({ quantity: 'length', value: 1, from: 'inch', to: 'meter' })).toBe(0.0254);
    expect(convertQuantity({ quantity: 'area', value: 1, from: 'squareMillimeter', to: 'squareMeter' })).toBe(1e-6);
    expect(convertQuantity({ quantity: 'volume', value: 1, from: 'cubicMillimeter', to: 'cubicMeter' })).toBe(1e-9);
    expect(
      convertQuantity({ quantity: 'thermodynamicTemperature', value: 32, from: 'fahrenheit', to: 'kelvin' }),
    ).toBeCloseTo(273.15, 12);
    expect(convertQuantity({ quantity: 'temperatureDifference', value: 18, from: 'fahrenheit', to: 'kelvin' })).toBe(
      10,
    );
    expect(convertQuantity({ quantity: 'planeAngle', value: 180, from: 'degree', to: 'radian' })).toBeCloseTo(
      Math.PI,
      15,
    );
    expect(
      convertQuantity({ quantity: 'speed', value: 36, from: 'kilometerPerHour', to: 'meterPerSecond' }),
    ).toBeCloseTo(10, 7);
  });

  it('should reject non-finite values and units outside the selected quantity', () => {
    expect(() => convertQuantity({ quantity: 'length', value: Number.NaN, from: 'meter', to: 'meter' })).toThrow(
      RangeError,
    );
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Runtime boundary test deliberately bypasses the UnitId constraint.
    expect(() => convertQuantity({ quantity: 'length', value: 1, from: 'second' as 'meter', to: 'meter' })).toThrow(
      TypeError,
    );
  });

  it('should expose canonical IDs, dimensions, and only valid compound units from one registry', () => {
    expect(quantityIds).toEqual(Object.keys(quantityRegistry));
    expect(Object.fromEntries(quantityIds.map((quantity) => [quantity, quantityRegistry[quantity].dimension]))).toEqual(
      expectedDimensions,
    );
    expect(quantityRegistry.area.units['squareMillimeter'].factor).toBe(1e-6);
    expect(quantityRegistry.volume.units['cubicMillimeter'].factor).toBe(1e-9);
    expect(Object.hasOwn(quantityRegistry.density.units, 'millikilogramPerCubicMeter')).toBe(false);
    expect(
      Object.values(quantityRegistry).every(({ canonicalUnit, units }) => Object.hasOwn(units, canonicalUnit)),
    ).toBe(true);
    expect(
      Object.values(quantityRegistry).every(({ units }) =>
        Object.values(units).every(
          ({ factor, offset }) => Number.isFinite(factor) && factor > 0 && Number.isFinite(offset),
        ),
      ),
    ).toBe(true);
  });

  it('should round-trip every admitted unit through its canonical unit', () => {
    for (const quantity of quantityIds) {
      const definition = quantityRegistry[quantity];
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Object.keys returns this registry entry's admitted unit IDs.
      const units = Object.keys(definition.units) as UnitId[];
      for (const unit of units) {
        for (const value of [-100, 0, 1, 123.456]) {
          const canonical = convertQuantity({ quantity, value, from: unit, to: definition.canonicalUnit });
          expect(convertQuantity({ quantity, value: canonical, from: definition.canonicalUnit, to: unit })).toBeCloseTo(
            value,
            12,
          );
        }
      }
    }
  });

  it('should preserve a legacy CAD millimeter value through canonical meters', () => {
    const meters = convertQuantity({ quantity: 'length', value: 0.2, from: 'millimeter', to: 'meter' });
    expect(meters).toBe(0.0002);
    expect(convertQuantity({ quantity: 'length', value: meters, from: 'meter', to: 'millimeter' })).toBeCloseTo(
      0.2,
      15,
    );
  });
});

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
    expect(convertMass(1, 'kg', 'lb')).toBeCloseTo(2.20462, 3);
    expect(convertMass(1, 'lb', 'kg')).toBeCloseTo(0.453592, 5);
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
