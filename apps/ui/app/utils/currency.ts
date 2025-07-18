/**
 * Format a number as a currency string, uses USD as the currency.
 * @param value - The number to format
 * @param options - Formatting options
 * @param options.significantFigures - Number of significant figures to display (if provided, overrides default formatting)
 * @returns A formatted currency string
 */
export const formatCurrency = (value: number, options?: { significantFigures?: number }): string => {
  if (options?.significantFigures) {
    if (value === 0) {
      return '$0.00';
    }

    const formatted = value.toPrecision(options.significantFigures);
    const numericValue = Number.parseFloat(formatted);

    return numericValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
  });
};
