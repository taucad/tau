/**
 * Format a number with locale considered.
 * @param value - The number to format
 * @returns A formatted number string
 */
export const formatNumber = (value: number) => {
  return value.toLocaleString();
};
