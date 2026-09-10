import type { SupplierFinalityClassification } from '#api/billing/billable-model-invocation.types.js';
import type { SupplierValuation, SupplierValuationRate, TerminalEvidence } from '#api/billing/credit-ledger.types.js';

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
};

const unsigned = (value: string): bigint | undefined => {
  if (!/^(0|[1-9][0-9]*)$/u.test(value) || value.length > 78) {
    return undefined;
  }
  return BigInt(value);
};

const key = ({ dimension, tier }: Pick<SupplierValuationRate, 'dimension' | 'tier'>): string =>
  `${dimension}:${tier ?? ''}`;

/** Derives exact preliminary USD from complete usage and its independently pinned valuation schedule. */
export const calculatePreliminarySupplierCost = (input: {
  invocation: { supplierValuation?: SupplierValuation };
  evidence: TerminalEvidence;
  payloadDigest: string;
}): SupplierFinalityClassification['supplierEvidence'] => {
  const valuation = input.invocation.supplierValuation;
  if (input.evidence.kind !== 'final_usage' || valuation?.version !== 'supplier-valuation-v1') {
    return undefined;
  }
  const baseKeys = new Set(valuation.baseRates.map((rate) => key(rate)));
  const meterKeys = new Set(input.evidence.meterItems.map((item) => key(item)));
  if (
    valuation.sourceRevision.length === 0 ||
    baseKeys.size === 0 ||
    baseKeys.size !== valuation.baseRates.length ||
    meterKeys.size !== input.evidence.meterItems.length ||
    baseKeys.size !== meterKeys.size ||
    [...baseKeys].some((rateKey) => !meterKeys.has(rateKey))
  ) {
    return undefined;
  }

  let selectedRates = valuation.baseRates;
  if (valuation.longContextMinimumInputTokens !== null) {
    const minimum = unsigned(valuation.longContextMinimumInputTokens);
    const longRates = valuation.longContextRates;
    if (minimum === undefined || minimum === 0n || longRates === null) {
      return undefined;
    }
    const longKeys = new Set(longRates.map((rate) => key(rate)));
    if (
      longKeys.size !== longRates.length ||
      longKeys.size !== baseKeys.size ||
      [...longKeys].some((rateKey) => !baseKeys.has(rateKey))
    ) {
      return undefined;
    }
    const inputQuantity = input.evidence.meterItems
      .filter(
        ({ dimension }) => dimension === 'uncached_input' || dimension === 'cache_read' || dimension === 'cache_write',
      )
      .reduce((sum, item) => sum + item.quantity, 0n);
    if (inputQuantity >= minimum) {
      selectedRates = longRates;
    }
  } else if (valuation.longContextRates !== null) {
    return undefined;
  }

  let numeratorPicoUsd = 0n;
  let denominator = 1n;
  try {
    for (const item of input.evidence.meterItems) {
      const rate = selectedRates.find((candidate) => key(candidate) === key(item));
      if (!rate || item.quantity < 0n) {
        return undefined;
      }
      const rateNumerator = unsigned(rate.numeratorPicoUsd);
      const rateDenominator = unsigned(rate.denominatorUnits);
      if (rateNumerator === undefined || rateDenominator === undefined || rateDenominator === 0n) {
        return undefined;
      }
      const nextNumerator = numeratorPicoUsd * rateDenominator + item.quantity * rateNumerator * denominator;
      const nextDenominator = denominator * rateDenominator;
      const divisor = gcd(nextNumerator, nextDenominator);
      numeratorPicoUsd = nextNumerator / divisor;
      denominator = nextDenominator / divisor;
    }
  } catch {
    return undefined;
  }
  const usdDenominator = denominator * 1_000_000_000_000n;
  const divisor = gcd(numeratorPicoUsd, usdDenominator);
  const numerator = numeratorPicoUsd / divisor;
  const normalizedDenominator = usdDenominator / divisor;
  if (numerator.toString().length > 78 || normalizedDenominator.toString().length > 78) {
    return undefined;
  }
  return {
    sourceRevision: `${valuation.sourceRevision}:normalized-usage:${input.payloadDigest}`,
    payloadDigest: input.payloadDigest,
    currency: 'usd',
    numerator: numerator.toString(),
    denominator: normalizedDenominator.toString(),
    completeness: 'complete',
  };
};
