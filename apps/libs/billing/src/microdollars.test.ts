import { describe, expect, it } from 'vitest';
import { centsToMicro, formatMicroUsd, microPerCent, microPerUsd, usdToMicro } from '#microdollars.js';

describe('microdollar conversions', () => {
  it('converts cents to microdollars at exactly 10,000 µ$ per cent', () => {
    expect(centsToMicro(2500)).toBe(25_000_000n);
    expect(centsToMicro(1)).toBe(10_000n);
    expect(centsToMicro(0)).toBe(0n);
    expect(centsToMicro(2500n)).toBe(25_000_000n);
  });

  it('keeps the unit constants mutually consistent', () => {
    expect(microPerUsd).toBe(100n * microPerCent);
  });

  it('converts USD floats to the nearest microdollar', () => {
    expect(usdToMicro(20)).toBe(20_000_000n);
    expect(usdToMicro(0.5)).toBe(500_000n);
    expect(usdToMicro(0.000_001)).toBe(1n);
    // The classic float trap: 0.1 + 0.2 style drift must round away.
    expect(usdToMicro(0.3)).toBe(300_000n);
  });
});

describe('formatMicroUsd', () => {
  it('formats whole and fractional balances with two decimal places', () => {
    expect(formatMicroUsd(18_420_000n)).toBe('18.42');
    expect(formatMicroUsd(20_000_000n)).toBe('20.00');
    expect(formatMicroUsd(0n)).toBe('0.00');
  });

  it('formats four decimal places for per-turn telemetry amounts', () => {
    expect(formatMicroUsd(3100n, 4)).toBe('0.0031');
    expect(formatMicroUsd(100n, 4)).toBe('0.0001');
  });

  it('rounds half up at the displayed precision', () => {
    expect(formatMicroUsd(5000n)).toBe('0.01');
    expect(formatMicroUsd(4999n)).toBe('0.00');
    expect(formatMicroUsd(50n, 4)).toBe('0.0001');
  });

  it('renders negative balances (debt) with a leading minus', () => {
    expect(formatMicroUsd(-1_500_000n)).toBe('-1.50');
    expect(formatMicroUsd(-3100n, 4)).toBe('-0.0031');
  });

  it('stays exact far beyond float precision', () => {
    expect(formatMicroUsd(9_000_000_000_000_000n)).toBe('9000000000.00');
  });
});
