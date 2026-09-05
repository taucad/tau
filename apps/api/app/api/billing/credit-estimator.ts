import type { Model } from '#api/models/model.schema.js';
import type { ChatUsageTokens } from '#api/chat/chat.schema.js';

/**
 * Pure µ$ cost arithmetic for the credit ledger (AD16 riders):
 * - rates are INTEGER µ$ per 1M tokens, derived once from the catalog's
 *   USD-per-1M numbers (×1e6 must be exact — a fractional µ$ rate is a
 *   catalog bug the tests catch);
 * - estimates/reservations CEIL (over-reserving is safe);
 * - the single accounting rounding point is {@link computeUserChargedCostMicro}
 *   at commit (round half up), bounding drift at 0.5 µ$ per line item.
 */

type RateTableMicroPer1M = {
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
};

const tokensPerRateUnit = 1_000_000n;
const markupScale = 1000n;

const toMicroRate = (usdPerMillionTokens: number, field: string, modelId: string): bigint => {
  const micro = Math.round(usdPerMillionTokens * 1_000_000);
  if (!Number.isFinite(usdPerMillionTokens) || Math.abs(micro - usdPerMillionTokens * 1_000_000) > 1e-6) {
    throw new Error(`Model ${modelId} has a non-integer µ$ rate for ${field}: ${usdPerMillionTokens}`);
  }
  return BigInt(micro);
};

/**
 * Derives the integer µ$-per-1M rate table for a catalog model.
 */
export const rateTableForModel = (model: Model): RateTableMicroPer1M => {
  const { cost } = model.details;
  return {
    inputTokens: toMicroRate(cost.inputTokens, 'inputTokens', model.id),
    outputTokens: toMicroRate(cost.outputTokens, 'outputTokens', model.id),
    cacheReadTokens: toMicroRate(cost.cacheReadTokens, 'cacheReadTokens', model.id),
    cacheWriteTokens: toMicroRate(cost.cacheWriteTokens, 'cacheWriteTokens', model.id),
  };
};

/**
 * Converts a markup fraction (0.3) into the integer milli-multiplier used by
 * exact ledger math (1300‰).
 */
export const markupMilliFromFraction = (markupFraction: number): bigint => {
  return BigInt(Math.round((1 + markupFraction) * 1000));
};

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => {
  return (numerator + denominator - 1n) / denominator;
};

const roundHalfUpDiv = (numerator: bigint, denominator: bigint): bigint => {
  return (numerator + denominator / 2n) / denominator;
};

/**
 * Worst-case pre-flight reservation (credits doc Finding 6, review Finding 8):
 * the whole input is priced at the CACHE-WRITE rate when it exceeds the input
 * rate (cache-invalidation turns re-write the entire prefix at 1.25x), plus a
 * full max-output generation, marked up, with a 20% margin for tool/thinking
 * overhead — ceiled to µ$.
 */
export const estimateWorstCaseCostMicro = (input: {
  model: Model;
  inputTokenEstimate: number;
  markupFraction: number;
}): bigint => {
  const rates = rateTableForModel(input.model);
  const inputRate = rates.cacheWriteTokens > rates.inputTokens ? rates.cacheWriteTokens : rates.inputTokens;
  const { contextWindow } = input.model.details;
  const remainingWindow = Math.max(contextWindow - input.inputTokenEstimate, 0);
  const maxOutputTokens = Math.min(input.model.details.maxTokens, remainingWindow);

  const providerMicroTimesMillion =
    BigInt(Math.max(Math.ceil(input.inputTokenEstimate), 0)) * inputRate + BigInt(maxOutputTokens) * rates.outputTokens;

  const markupMilli = markupMilliFromFraction(input.markupFraction);
  // Ceil((provider × markup‰ × 1.2) / (1e6 × 1000)): the 1.2 safety margin is 6/5.
  return ceilDiv(providerMicroTimesMillion * markupMilli * 6n, tokensPerRateUnit * markupScale * 5n);
};

/**
 * The Q36 abort/error floor: the input-token component of the reservation,
 * marked up, ceiled (a call that reached the provider is never free).
 */
export const estimateInputComponentMicro = (input: {
  model: Model;
  inputTokenEstimate: number;
  markupFraction: number;
}): bigint => {
  const rates = rateTableForModel(input.model);
  const inputRate = rates.cacheWriteTokens > rates.inputTokens ? rates.cacheWriteTokens : rates.inputTokens;
  const providerMicroTimesMillion = BigInt(Math.max(Math.ceil(input.inputTokenEstimate), 0)) * inputRate;
  const markupMilli = markupMilliFromFraction(input.markupFraction);
  return ceilDiv(providerMicroTimesMillion * markupMilli, tokensPerRateUnit * markupScale);
};

/**
 * The commit-time user charge for NORMALIZED usage (cache double-counting
 * already removed by `ModelService.normalizeUsageTokens`). Exact integer path —
 * deliberately independent of `getModelCost`'s float telemetry — with markup
 * applied in milli-units and ONE round-half-up at the end (AD16 rider 2).
 */
export const computeUserChargedCostMicro = (input: {
  model: Model;
  usage: ChatUsageTokens;
  markupFraction: number;
}): bigint => {
  const rates = rateTableForModel(input.model);
  const providerMicroTimesMillion =
    BigInt(Math.max(input.usage.inputTokens, 0)) * rates.inputTokens +
    BigInt(Math.max(input.usage.outputTokens, 0)) * rates.outputTokens +
    BigInt(Math.max(input.usage.cacheReadTokens, 0)) * rates.cacheReadTokens +
    BigInt(Math.max(input.usage.cacheWriteTokens, 0)) * rates.cacheWriteTokens;

  const markupMilli = markupMilliFromFraction(input.markupFraction);
  return roundHalfUpDiv(providerMicroTimesMillion * markupMilli, tokensPerRateUnit * markupScale);
};
