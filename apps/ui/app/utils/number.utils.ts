/**
 * Format a number with locale considered.
 * @param value - The number to format
 * @returns A formatted number string
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString();
};

/**
 * Format a number value with a specified number of maximum digits
 * Uses engineering notation (multiples of 3) for values >= 1000
 *
 * @param value - The number to format
 * @param maxDigits - The maximum number of digits to display
 * @returns A formatted number string
 */
export function formatNumberEngineeringNotation(value: number, maxDigits: number): string {
  // Handle edge cases
  if (value === 0) {
    return '0';
  }

  if (!Number.isFinite(value)) {
    return '0';
  }

  const absValue = Math.abs(value);

  // For values less than 1000, format normally with max digits
  if (absValue < 1000) {
    // Calculate how many decimal places we need
    const integerPart = Math.floor(absValue).toString();
    const integerDigits = integerPart.length;

    if (integerDigits >= maxDigits) {
      // No decimal places needed
      return Math.round(absValue).toString();
    }

    // Calculate decimal places to achieve target digits
    const decimalPlaces = maxDigits - integerDigits;
    const formatted = absValue.toFixed(decimalPlaces);

    // Remove trailing zeros after decimal point
    return formatted.replace(/\.?0+$/, '');
  }

  // For values >= 1000, use engineering notation (e.g., 1e3, 10e3, 100e3, 1e6)
  // Engineering notation uses exponents that are multiples of 3
  const rawExponent = Math.floor(Math.log10(absValue));
  const engineeringExponent = Math.floor(rawExponent / 3) * 3;
  const mantissa = absValue / 10 ** engineeringExponent;

  // Format mantissa based on its magnitude
  const mantissaIntegerDigits = Math.floor(mantissa).toString().length;

  if (mantissaIntegerDigits >= maxDigits) {
    // No decimal places needed
    return `${Math.round(mantissa)}e${engineeringExponent}`;
  }

  // Calculate decimal places to achieve target digits
  const decimalPlaces = maxDigits - mantissaIntegerDigits;
  const formattedMantissa = mantissa.toFixed(decimalPlaces);
  const trimmedMantissa = formattedMantissa.replace(/\.?0+$/, '');

  return `${trimmedMantissa}e${engineeringExponent}`;
}

/**
 * Clamp a number between a minimum and maximum value.
 * @param value - The number to clamp
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns The clamped number
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

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

type FormatUnitDisplayOptions = {
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
 * Format a unit value as a string with specified significant figures.
 * Avoids scientific notation within a sane range and optionally preserves trailing zeros.
 * Used for displaying converted unit values in UI.
 *
 * @param value - The numeric value to format
 * @param options - Formatting options
 * @returns Formatted string representation
 */
export function formatUnitDisplay(value: number, options: FormatUnitDisplayOptions = {}): string {
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
