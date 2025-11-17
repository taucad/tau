import { standardInternationalBaseUnits } from '@taucad/types/constants';

/**
 * Type-safe length unit system based on standardInternationalBaseUnits
 */

// Extract length unit symbols from the constants
type LengthUnitSymbol = (typeof standardInternationalBaseUnits)['length']['unitSymbol'];
type LengthVariantSymbol =
  (typeof standardInternationalBaseUnits)['length']['unitVariants'][keyof (typeof standardInternationalBaseUnits)['length']['unitVariants']]['unitSymbol'];

export type LengthUnit = LengthUnitSymbol | LengthVariantSymbol;

/**
 * Derive conversion factors to millimeters from the standard international units.
 * The constants store conversion factors to meters, so we multiply by 1000 to get mm.
 */
function deriveLengthUnitToMm(): Record<LengthUnit, number> {
  const lengthConstants = standardInternationalBaseUnits.length;
  const metersToMm = 1000;

  const result: Record<string, number> = {};

  // Add base unit (meter)
  result[lengthConstants.unitSymbol] = metersToMm;

  // Add all variants (convert from "factor to meters" to "factor to mm")
  for (const variant of Object.values(lengthConstants.unitVariants)) {
    result[variant.unitSymbol] = variant.conversionFactor * metersToMm;
  }

  return result as Record<LengthUnit, number>;
}

/**
 * Map of length unit symbols to their conversion factors (to millimeters)
 * This is the primary unit used internally in the app
 */
export const lengthUnitToMm: Record<LengthUnit, number> = deriveLengthUnitToMm();

/**
 * Alternative unit aliases that users might type
 */
const unitAliases: Record<string, LengthUnit> = {
  millimeter: 'mm',
  millimeters: 'mm',
  centimeter: 'cm',
  centimeters: 'cm',
  meter: 'm',
  meters: 'm',
  inch: 'in',
  inches: 'in',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Quote symbol for inches
  '"': 'in',
  foot: 'ft',
  feet: 'ft',
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Quote symbol for feet
  "'": 'ft',
  yard: 'yd',
  yards: 'yd',
};

/**
 * Normalize a unit string to a canonical LengthUnit symbol
 */
export function normalizeUnit(unit: string): LengthUnit | undefined {
  const normalized = unit.toLowerCase().trim();

  // Direct match
  if (normalized in lengthUnitToMm) {
    return normalized as LengthUnit;
  }

  // Alias match
  if (normalized in unitAliases) {
    return unitAliases[normalized];
  }

  return undefined;
}

/**
 * Convert a length value from one unit to another
 *
 * @param value - The numeric value to convert
 * @param fromUnit - The source unit
 * @param toUnit - The target unit
 * @returns The converted value
 */
export function convertLength(value: number, fromUnit: LengthUnit, toUnit: LengthUnit): number {
  if (fromUnit === toUnit) {
    return value;
  }

  // Convert to mm first (canonical base)
  const valueInMm = value * lengthUnitToMm[fromUnit];

  // Convert from mm to target unit
  return valueInMm / lengthUnitToMm[toUnit];
}

/**
 * Convert a length value from one unit to another, supporting unit aliases
 *
 * @param value - The numeric value to convert
 * @param fromUnit - The source unit (can be an alias)
 * @param toUnit - The target unit (can be an alias)
 * @returns The converted value, or undefined if units are invalid
 */
export function convertLengthWithAliases(value: number, fromUnit: string, toUnit: string): number | undefined {
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);

  if (!normalizedFrom || !normalizedTo) {
    return undefined;
  }

  return convertLength(value, normalizedFrom, normalizedTo);
}

/**
 * Round a number to a specified number of significant figures.
 * Handles edge cases including zero, infinity, and NaN.
 *
 * @param value - The number to round
 * @param significantFigures - The number of significant figures (must be >= 1)
 * @returns The rounded number
 */
export function roundToSignificantFigures(value: number, significantFigures: number): number {
  // Handle edge cases
  if (value === 0 || !Number.isFinite(value)) {
    return value;
  }

  if (significantFigures < 1) {
    return value;
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? -1 : 1;

  // Calculate the order of magnitude
  const orderOfMagnitude = absValue === 0 ? 0 : Math.floor(Math.log10(absValue));
  const factor = 10 ** (significantFigures - 1 - orderOfMagnitude);

  // Round and scale back
  return (sign * Math.round(absValue * factor)) / factor;
}

type FormatLengthDisplayOptions = {
  /**
   * Number of significant figures to display (default: 4)
   */
  significantFigures?: number;
  /**
   * Whether to preserve trailing zeros (default: false)
   */
  preserveTrailingZeros?: boolean;
  /**
   * Minimum value to avoid scientific notation (default: 1e-4)
   */
  minFixed?: number;
  /**
   * Maximum value to avoid scientific notation (default: 1e6)
   */
  maxFixed?: number;
};

/**
 * Format a length value as a string with specified significant figures.
 * Avoids scientific notation within a sane range and optionally preserves trailing zeros.
 * Used for displaying converted length values in UI.
 *
 * @param value - The numeric value to format
 * @param options - Formatting options
 * @returns Formatted string representation
 */
export function formatLengthDisplay(value: number, options: FormatLengthDisplayOptions = {}): string {
  const { significantFigures = 4, preserveTrailingZeros = false, minFixed = 1e-4, maxFixed = 1e6 } = options;

  // Handle edge cases
  if (value === 0) {
    return '0';
  }

  if (!Number.isFinite(value)) {
    return '0';
  }

  // Round to significant figures first
  const rounded = roundToSignificantFigures(value, significantFigures);
  const absRounded = Math.abs(rounded);

  // Use scientific notation outside the sane range (check after rounding)
  if (absRounded < minFixed || absRounded >= maxFixed) {
    const expNotation = rounded.toExponential(significantFigures - 1);
    // Remove trailing zeros from mantissa if not preserving them
    if (!preserveTrailingZeros) {
      return expNotation.replace(/\.?0+(e[+-]\d+)$/, '$1');
    }

    return expNotation;
  }

  // Calculate how many decimal places we need
  const orderOfMagnitude = Math.floor(Math.log10(absRounded));
  const decimalPlaces = Math.max(0, significantFigures - 1 - orderOfMagnitude);

  // Format with fixed decimal places
  const formatted = rounded.toFixed(decimalPlaces);

  // Optionally remove trailing zeros
  if (!preserveTrailingZeros) {
    return formatted.replace(/\.?0+$/, '');
  }

  return formatted;
}

export type ParsedLength = {
  value: number;
  unit?: string;
};

/**
 * Parse a length input string that may contain units and fractions.
 * Supports formats like: "12.5", "12.5 mm", "12.5mm", "1/2", "3/4 in", "12' 6\"", "12ft 6in"
 *
 * @param input - The input string to parse
 * @returns Parsed value and detected unit, or undefined if invalid
 */
// eslint-disable-next-line complexity -- Complex input parsing requires multiple format checks
export function parseLengthInput(input: string): ParsedLength | undefined {
  if (!input || typeof input !== 'string') {
    return undefined;
  }

  // Trim whitespace
  const trimmed = input.trim();
  if (trimmed === '') {
    return undefined;
  }

  // Pattern for feet-inches: 12' 6" or 12ft 6in or 12' or 12"
  const feetInchesMatch = /^(-?\d+(?:\.\d+)?)\s*(?:ft|'|feet)\s*(?:(-?\d+(?:\.\d+)?)\s*(?:in|"|inches)?)?$/i.exec(
    trimmed,
  );
  if (feetInchesMatch?.[1]) {
    const feet = Number.parseFloat(feetInchesMatch[1]);
    const inches = feetInchesMatch[2] ? Number.parseFloat(feetInchesMatch[2]) : 0;
    const totalInches = feet * 12 + inches;
    return { value: totalInches, unit: 'in' };
  }

  // Pattern for just inches with double quote or "in": 6" or 6in
  const inchesOnlyMatch = /^(-?\d+(?:\.\d+)?)\s*(?:in|"|inches)$/i.exec(trimmed);
  if (inchesOnlyMatch?.[1]) {
    return { value: Number.parseFloat(inchesOnlyMatch[1]), unit: 'in' };
  }

  // Pattern for fraction: 1/2, 3/4, -1/4
  const fractionMatch = /^(-?\d+)\s*\/\s*(\d+)(?:\s*([a-z]+))?$/i.exec(trimmed);
  if (fractionMatch?.[1] && fractionMatch[2]) {
    const numerator = Number.parseInt(fractionMatch[1], 10);
    const denominator = Number.parseInt(fractionMatch[2], 10);
    if (denominator === 0) {
      return undefined;
    }

    const value = numerator / denominator;
    const unit = fractionMatch[3];
    return { value, unit };
  }

  // Pattern for mixed fraction: 1 1/2 in, 2-3/4 mm
  const mixedFractionMatch = /^(-?\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)(?:\s*([a-z]+))?$/i.exec(trimmed);
  if (mixedFractionMatch?.[1] && mixedFractionMatch[2] && mixedFractionMatch[3]) {
    const whole = Number.parseInt(mixedFractionMatch[1], 10);
    const numerator = Number.parseInt(mixedFractionMatch[2], 10);
    const denominator = Number.parseInt(mixedFractionMatch[3], 10);
    if (denominator === 0) {
      return undefined;
    }

    const sign = whole < 0 ? -1 : 1;
    const value = whole + sign * (numerator / denominator);
    const unit = mixedFractionMatch[4];
    return { value, unit };
  }

  // Pattern for decimal with optional unit: 12.5, 12.5 mm, 12.5mm
  const decimalMatch = /^(-?\d+(?:\.\d+)?)\s*([a-z"']+)?$/i.exec(trimmed);
  if (decimalMatch?.[1]) {
    const value = Number.parseFloat(decimalMatch[1]);
    const unit = decimalMatch[2];
    if (Number.isFinite(value)) {
      return { value, unit };
    }
  }

  return undefined;
}

/**
 * Check if a value is approximately equal to another value within a tolerance
 * Useful for detecting if a displayed value differs from the true converted value
 *
 * @param a - First value
 * @param b - Second value
 * @param tolerance - Maximum difference to consider equal (default: 1e-10)
 * @returns True if values are approximately equal
 */
export function isApproximatelyEqual(a: number, b: number, tolerance = 1e-10): boolean {
  return Math.abs(a - b) < tolerance;
}
