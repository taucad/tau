import { describe, expect, it } from 'vitest';
import { formatMonthlyPrice, formatUsdMinor, formatUsdTotalMinor, formatUsdWholeMinor } from '#money.js';

describe('formatUsdMinor', () => {
  it('should print a charged amount with a dollar sign and two decimals', () => {
    expect(formatUsdMinor('1000')).toBe('$10.00');
    expect(formatUsdMinor(2750)).toBe('$27.50');
    expect(formatUsdMinor(0)).toBe('$0.00');
  });

  it('should group thousands and keep the sign in front of the symbol', () => {
    expect(formatUsdMinor(500_000n)).toBe('$5,000.00');
    expect(formatUsdMinor(-1250)).toBe('-$12.50');
  });

  it('should never use the US$ prefix', () => {
    expect(formatUsdMinor('2500')).not.toContain('US$');
  });
});

describe('formatUsdTotalMinor', () => {
  it('should name the currency once, after the amount', () => {
    expect(formatUsdTotalMinor('1000')).toBe('$10.00 USD');
  });
});

describe('formatUsdWholeMinor', () => {
  it('should drop the cents from a whole-dollar amount', () => {
    expect(formatUsdWholeMinor(2500)).toBe('$25');
    expect(formatUsdWholeMinor(500_000)).toBe('$5,000');
  });

  it('should keep cents the amount actually has', () => {
    expect(formatUsdWholeMinor(1250)).toBe('$12.50');
  });
});

describe('formatMonthlyPrice', () => {
  it('should join the price and its period with a slash', () => {
    expect(formatMonthlyPrice('$20')).toBe('$20/month');
  });
});
