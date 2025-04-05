/**
 * Format a number as a currency string, uses USD as the currency.
 * @param value - The number to format
 * @returns A formatted currency string
 */
export const formatCurrency = (value: number) => {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
  });
};
