import { describe, expect, it } from 'vitest';
import {
  ceilRationalCreditAtoms,
  creditAtomsPerCredit,
  formatCreditAtoms,
  maxCreditAtoms,
  roundHalfUpRationalCreditAtoms,
  usdCentsToCreditAtoms,
} from '#credit-atoms.js';

describe('exact credit atom arithmetic', () => {
  it('uses the fixed atom denomination and exact principal conversion', () => {
    expect(creditAtomsPerCredit).toBe(10_000n);
    expect(usdCentsToCreditAtoms(2500n, 10_000n)).toBe(25_000_000n);
    expect(usdCentsToCreditAtoms(2500n, 20_000n)).toBe(50_000_000n);
    expect(() => usdCentsToCreditAtoms(-1n, 10_000n)).toThrow(RangeError);
    expect(() => usdCentsToCreditAtoms(1n, -1n)).toThrow(RangeError);
    expect(() => usdCentsToCreditAtoms(maxCreditAtoms / creditAtomsPerCredit + 1n, creditAtomsPerCredit)).toThrow(
      RangeError,
    );
  });

  it('rounds once after summing exact contributions', () => {
    const contributions = [
      { numeratorCreditAtoms: 49n, denominator: 100n },
      { numeratorCreditAtoms: 49n, denominator: 100n },
    ];
    expect(ceilRationalCreditAtoms(contributions)).toBe(1n);
    expect(roundHalfUpRationalCreditAtoms(contributions)).toBe(1n);
    expect(roundHalfUpRationalCreditAtoms([{ numeratorCreditAtoms: 49n, denominator: 100n }])).toBe(0n);
    expect(roundHalfUpRationalCreditAtoms([{ numeratorCreditAtoms: 1n, denominator: 2n }])).toBe(1n);
  });

  it('handles zero, one atom, invalid rationals, and result overflow', () => {
    expect(ceilRationalCreditAtoms([])).toBe(0n);
    expect(roundHalfUpRationalCreditAtoms([{ numeratorCreditAtoms: 1n, denominator: 1n }])).toBe(1n);
    expect(formatCreditAtoms(1n)).toBe('0.0001');
    expect(formatCreditAtoms(-10_010n)).toBe('-1.001');
    expect(() => ceilRationalCreditAtoms([{ numeratorCreditAtoms: -1n, denominator: 1n }])).toThrow(RangeError);
    expect(() => ceilRationalCreditAtoms([{ numeratorCreditAtoms: 1n, denominator: 0n }])).toThrow(RangeError);
    expect(() => ceilRationalCreditAtoms([{ numeratorCreditAtoms: maxCreditAtoms + 1n, denominator: 1n }])).toThrow(
      RangeError,
    );
  });
});
