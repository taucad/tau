import type {
  NormalizedMeterItem,
  SupplierCostUnpricedReason,
  SupplierValuation,
  SupplierValuationRate,
} from '#api/billing/credit-ledger.types.js';

/** A supplier cost estimate in pico-USD, or why the usage could not be priced. */
export type SupplierCost =
  | { readonly picoUsd: bigint }
  | { readonly unpriced: Exclude<SupplierCostUnpricedReason, 'absorbed'> };

const unsigned = (value: string): bigint | undefined => {
  if (!/^(0|[1-9][0-9]*)$/u.test(value) || value.length > 78) {
    return undefined;
  }
  return BigInt(value);
};

const key = ({ dimension, tier }: Pick<SupplierValuationRate, 'dimension' | 'tier'>): string =>
  `${dimension}:${tier ?? ''}`;

const inputDimensions = new Set(['uncached_input', 'cache_read', 'cache_write']);

/**
 * Prices reported usage at the supplier valuation pinned on the operation.
 *
 * The result is `ceil(Σ quantity × numeratorPicoUsd ÷ denominatorUnits)` over every meter, so
 * rounding happens once, on the exact sum. A reported meter the valuation has no rate for is
 * `missing_rate`; a schedule that prices a meter the supplier did not report is
 * `dimension_mismatch`. Neither changes what the customer is charged.
 *
 * @param input - The pinned valuation, absent on a route without one, and the reported meters.
 * @returns The supplier cost estimate, or the reason it is unpriced.
 */
export const calculateSupplierCost = (input: {
  readonly valuation: SupplierValuation | undefined;
  readonly meterItems: readonly NormalizedMeterItem[];
}): SupplierCost => {
  const { valuation, meterItems } = input;
  if (valuation?.version !== 'supplier-valuation-v1' || valuation.sourceRevision.length === 0) {
    return { unpriced: 'missing_rate' };
  }
  let rates = valuation.baseRates;
  if (valuation.longContextMinimumInputTokens !== null && valuation.longContextRates !== null) {
    const minimum = unsigned(valuation.longContextMinimumInputTokens);
    if (minimum === undefined) {
      return { unpriced: 'missing_rate' };
    }
    const observedInput = meterItems
      .filter(({ dimension }) => inputDimensions.has(dimension))
      .reduce((sum, item) => sum + item.quantity, 0n);
    if (observedInput >= minimum) {
      rates = valuation.longContextRates;
    }
  } else if (valuation.longContextMinimumInputTokens !== null || valuation.longContextRates !== null) {
    return { unpriced: 'missing_rate' };
  }
  const byKey = new Map(rates.map((rate) => [key(rate), rate]));
  if (byKey.size !== rates.length || meterItems.some((item) => !byKey.has(key(item)) || item.quantity < 0n)) {
    return { unpriced: 'missing_rate' };
  }
  if (new Set(meterItems.map((item) => key(item))).size !== meterItems.length || meterItems.length !== byKey.size) {
    return { unpriced: 'dimension_mismatch' };
  }
  let numerator = 0n;
  let denominator = 1n;
  for (const item of meterItems) {
    const rate = byKey.get(key(item));
    const rateNumerator = rate === undefined ? undefined : unsigned(rate.numeratorPicoUsd);
    const rateDenominator = rate === undefined ? undefined : unsigned(rate.denominatorUnits);
    if (rateNumerator === undefined || rateDenominator === undefined || rateDenominator === 0n) {
      return { unpriced: 'missing_rate' };
    }
    numerator = numerator * rateDenominator + item.quantity * rateNumerator * denominator;
    denominator *= rateDenominator;
  }
  return { picoUsd: (numerator + denominator - 1n) / denominator };
};
