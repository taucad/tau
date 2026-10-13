/**
 * Format a number with locale considered.
 * @param value - The number to format
 * @returns A formatted number string
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString();
};

type FormatNumberAbbreviationOptions = {
  /**
   * Number of significant figures to display (default: 2)
   */
  significantFigures?: number;
  /**
   * Minimum value to trigger compact notation (default: 1000)
   * Values below this will be formatted with locale string
   */
  compactThreshold?: number;
};

/**
 * Format a number in compact notation with K, M, B, T suffixes.
 * Examples: 11000 -> "11K", 2423525 -> "2.4M", 999 -> "999"
 *
 * @param value - The number to format
 * @param options - Formatting options
 * @returns A compact formatted number string
 */
export function formatNumberAbbreviation(value: number, options: FormatNumberAbbreviationOptions = {}): string {
  const { significantFigures = 2, compactThreshold = 1000 } = options;

  // Handle edge cases
  if (value === 0) {
    return '0';
  }

  if (!Number.isFinite(value)) {
    return '0';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // For values below threshold, format with locale string
  if (absValue < compactThreshold) {
    return sign + absValue.toLocaleString();
  }

  // Define suffixes and their thresholds
  const suffixes = [
    { threshold: 1e12, suffix: 'T' },
    { threshold: 1e9, suffix: 'B' },
    { threshold: 1e6, suffix: 'M' },
    { threshold: 1e3, suffix: 'K' },
  ];

  // Find the appropriate suffix
  for (const { threshold, suffix } of suffixes) {
    if (absValue >= threshold) {
      const scaled = absValue / threshold;
      const rounded = roundToSignificantFigures(scaled, significantFigures);

      // Format without unnecessary trailing zeros
      let formatted: string;
      if (rounded >= 100) {
        // For values like 100K, 999K - no decimals needed
        formatted = Math.round(rounded).toString();
      } else if (rounded >= 10) {
        // For values like 10K, 99.9K - one decimal at most
        formatted = rounded.toFixed(1).replace(/\.0$/, '');
      } else {
        // For values like 1K, 9.99K - use significant figures
        const decimalPlaces = Math.max(0, significantFigures - 1);
        formatted = rounded.toFixed(decimalPlaces).replace(/\.?0+$/, '');
      }

      return sign + formatted + suffix;
    }
  }

  // Fallback (shouldn't reach here)
  return sign + absValue.toLocaleString();
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
