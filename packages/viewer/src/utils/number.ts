/**
 * Format a number value with a specified number of maximum digits
 * Uses engineering notation (multiples of 3) for values >= 1000 or
 * values too small to represent with the given maxDigits.
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

  // Threshold below which normal formatting loses all significant digits.
  // For values < 1, integerDigits is always 1 ("0"), so decimalPlaces = maxDigits - 1.
  // Values smaller than 10^-(maxDigits-1) would round to "0.00...0" and trim to "0".
  const smallThreshold = 10 ** -(maxDigits - 1);

  // For values that can be represented normally within maxDigits
  if (absValue >= smallThreshold && absValue < 1000) {
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

  // For values >= 1000 or < smallThreshold, use engineering notation
  // Engineering notation uses exponents that are multiples of 3 (e.g., 1e3, 10e-6)
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
