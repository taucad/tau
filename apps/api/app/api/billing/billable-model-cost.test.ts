import { describe, expect, it } from 'vitest';
import { calculateSupplierCost } from '#api/billing/billable-model-cost.js';
import type { NormalizedMeterItem, SupplierValuation } from '#api/billing/credit-ledger.types.js';

const untiered = (baseRates: SupplierValuation['baseRates']): SupplierValuation => ({
  version: 'supplier-valuation-v1',
  sourceRevision: 'official-pricing-2026-09-06',
  longContextMinimumInputTokens: null,
  baseRates,
  longContextRates: null,
});

describe('calculateSupplierCost', () => {
  it('should price mixed-denominator usage exactly and round the sum up once', () => {
    expect(
      calculateSupplierCost({
        valuation: untiered([
          { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '3', denominatorUnits: '2' },
          { dimension: 'output', tier: null, numeratorPicoUsd: '5', denominatorUnits: '3' },
        ]),
        meterItems: [
          { dimension: 'uncached_input', tier: null, quantity: 2n },
          { dimension: 'output', tier: null, quantity: 3n },
        ],
      }),
    ).toEqual({ picoUsd: 8n });
    // 1/3 + 1/3 rounds up to 1 pico-USD, where rounding each meter first would give 2.
    expect(
      calculateSupplierCost({
        valuation: untiered([
          { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '3' },
          { dimension: 'output', tier: null, numeratorPicoUsd: '1', denominatorUnits: '3' },
        ]),
        meterItems: [
          { dimension: 'uncached_input', tier: null, quantity: 1n },
          { dimension: 'output', tier: null, quantity: 1n },
        ],
      }),
    ).toEqual({ picoUsd: 1n });
  });

  it('should select the inclusive long-context band from the complete input partition', () => {
    const meters = (uncached: bigint, read: bigint, write: bigint): NormalizedMeterItem[] => [
      { dimension: 'uncached_input', tier: null, quantity: uncached },
      { dimension: 'cache_read', tier: null, quantity: read },
      { dimension: 'cache_write', tier: '30m', quantity: write },
      { dimension: 'output', tier: null, quantity: 1n },
    ];
    const rate = (numeratorPicoUsd: string): SupplierValuation['baseRates'] => [
      { dimension: 'uncached_input', tier: null, numeratorPicoUsd, denominatorUnits: '1' },
      { dimension: 'cache_read', tier: null, numeratorPicoUsd, denominatorUnits: '1' },
      { dimension: 'cache_write', tier: '30m', numeratorPicoUsd, denominatorUnits: '1' },
      { dimension: 'output', tier: null, numeratorPicoUsd, denominatorUnits: '1' },
    ];
    const valuation: SupplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'tiered',
      longContextMinimumInputTokens: '3',
      baseRates: rate('1'),
      longContextRates: rate('2'),
    };

    expect(calculateSupplierCost({ valuation, meterItems: meters(1n, 1n, 0n) })).toEqual({ picoUsd: 3n });
    expect(calculateSupplierCost({ valuation, meterItems: meters(1n, 1n, 1n) })).toEqual({ picoUsd: 8n });
  });

  it('should use the pinned inclusive boundary at 199999, 200000 and 200001 input tokens', () => {
    const valuation: SupplierValuation = {
      version: 'supplier-valuation-v1',
      sourceRevision: 'pricing-boundary-2026-09-06',
      longContextMinimumInputTokens: '200000',
      baseRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
      ],
      longContextRates: [
        { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'cache_read', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        { dimension: 'output', tier: null, numeratorPicoUsd: '0', denominatorUnits: '1' },
      ],
    };
    const cost = (quantity: bigint) =>
      calculateSupplierCost({
        valuation,
        meterItems: [
          { dimension: 'uncached_input', tier: null, quantity },
          { dimension: 'cache_read', tier: null, quantity: 0n },
          { dimension: 'output', tier: null, quantity: 0n },
        ],
      });

    expect(cost(199_999n)).toEqual({ picoUsd: 0n });
    expect(cost(200_000n)).toEqual({ picoUsd: 200_000n });
    expect(cost(200_001n)).toEqual({ picoUsd: 200_001n });
  });

  it('should name a missing valuation or an unrated reported meter as missing_rate', () => {
    const meterItems: NormalizedMeterItem[] = [
      { dimension: 'uncached_input', tier: null, quantity: 1n },
      { dimension: 'cache_write', tier: '5m', quantity: 1n },
      { dimension: 'output', tier: null, quantity: 1n },
    ];
    expect(calculateSupplierCost({ valuation: undefined, meterItems })).toEqual({ unpriced: 'missing_rate' });
    // The reported cache write carries a TTL the valuation has no rate for.
    expect(
      calculateSupplierCost({
        valuation: untiered([
          { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
          { dimension: 'cache_write', tier: '30m', numeratorPicoUsd: '1', denominatorUnits: '1' },
          { dimension: 'output', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        ]),
        meterItems,
      }),
    ).toEqual({ unpriced: 'missing_rate' });
  });

  it('should name a schedule pricing a meter the supplier did not report as dimension_mismatch', () => {
    expect(
      calculateSupplierCost({
        valuation: untiered([
          { dimension: 'uncached_input', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
          { dimension: 'cache_read', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
          { dimension: 'output', tier: null, numeratorPicoUsd: '1', denominatorUnits: '1' },
        ]),
        meterItems: [
          { dimension: 'uncached_input', tier: null, quantity: 1n },
          { dimension: 'output', tier: null, quantity: 1n },
        ],
      }),
    ).toEqual({ unpriced: 'dimension_mismatch' });
  });
});
