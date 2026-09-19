import { describe, expect, it } from 'vitest';
import { maximumMeterCharge } from '#api/billing/billable-model-bound.js';

describe('joint input maximum', () => {
  it('uses the largest exact tariff independently for retail and supplier, then rounds once', () => {
    const meters = [
      { dimension: 'uncached_input', quantity: 3n, numerator: 1n, denominator: 3n },
      { dimension: 'cache_read', quantity: 3n, numerator: 2n, denominator: 5n },
      { dimension: 'cache_write', quantity: 3n, numerator: 1n, denominator: 4n },
      { dimension: 'output', quantity: 1n, numerator: 1n, denominator: 5n },
    ];
    const joint = { version: 'joint-input-v1', quantity: '3' } satisfies Parameters<typeof maximumMeterCharge>[1];
    expect(maximumMeterCharge(meters, joint)).toBe(2n);
    expect(maximumMeterCharge(meters)).toBe(4n);
    expect(
      maximumMeterCharge(
        meters.map((meter) => ({
          ...meter,
          numerator: meter.dimension === 'cache_write' ? 20n : meter.numerator,
        })),
        joint,
      ),
    ).toBe(16n);
    expect(
      maximumMeterCharge([{ dimension: 'uncached_input', quantity: 3n, numerator: 1n, denominator: 3n }], joint),
    ).toBe(1n);
  });

  it('rejects an unqualified partition or mismatched cap', () => {
    expect(() =>
      maximumMeterCharge([{ dimension: 'audio', quantity: 3n, numerator: 1n, denominator: 1n }], {
        version: 'joint-input-v1',
        quantity: '3',
      }),
    ).toThrow('qualified meter partition');
    expect(() =>
      maximumMeterCharge([{ dimension: 'uncached_input', quantity: 4n, numerator: 1n, denominator: 1n }], {
        version: 'joint-input-v1',
        quantity: '3',
      }),
    ).toThrow('qualified meter partition');
  });
});
