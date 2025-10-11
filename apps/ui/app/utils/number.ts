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
