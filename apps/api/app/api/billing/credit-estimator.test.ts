import { describe, expect, it } from 'vitest';
import { isModelListEntryEnabled, modelList, modelListEntryToModel } from '#api/models/model.constants.js';
import type { Model } from '#api/models/model.schema.js';
import {
  computeUserChargedCostMicro,
  estimateInputComponentMicro,
  estimateWorstCaseCostMicro,
  markupMilliFromFraction,
  rateTableForModel,
} from '#api/billing/credit-estimator.js';

const syntheticModel = (cost: Model['details']['cost'], maxTokens = 16_000, contextWindow = 200_000): Model => ({
  id: 'test-model',
  providerKind: 'tau-hosted',
  name: 'Test Model',
  slug: 'test-model',
  model: 'test-model',
  provider: { id: 'anthropic', name: 'Anthropic' },
  details: {
    family: 'claude',
    families: ['claude'],
    contextWindow,
    maxTokens,
    cost,
  },
  configuration: { streaming: true },
});

describe('rateTableForModel', () => {
  it('should derive exact integer µ$ rates for every catalog entry (AD16 rider 1 guard)', () => {
    for (const providerModels of Object.values(modelList)) {
      for (const entry of Object.values(providerModels)) {
        const rates = rateTableForModel(modelListEntryToModel(entry));
        expect(rates.inputTokens).toBeGreaterThanOrEqual(0n);
        expect(rates.outputTokens).toBeGreaterThanOrEqual(0n);
      }
    }
  });

  it('should reject rates that do not convert to whole microdollars', () => {
    const model = syntheticModel({
      inputTokens: 0.000_000_1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });

    expect(() => rateTableForModel(model)).toThrow(/non-integer µ\$ rate/u);
  });
});

describe('markupMilliFromFraction', () => {
  it('should convert the 30% markup into 1300 milli-units', () => {
    expect(markupMilliFromFraction(0.3)).toBe(1300n);
    expect(markupMilliFromFraction(0)).toBe(1000n);
  });
});

describe('estimateWorstCaseCostMicro', () => {
  const flagship = syntheticModel(
    { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0.5, cacheWriteTokens: 6.25 },
    16_000,
  );

  it('should price the whole input at the cache-write rate when it dominates (review Finding 8)', () => {
    const withCacheWrite = estimateWorstCaseCostMicro({
      model: flagship,
      inputTokenEstimate: 50_000,
      markupFraction: 0.3,
    });
    const inputOnlyModel = syntheticModel(
      { inputTokens: 5, outputTokens: 25, cacheReadTokens: 0.5, cacheWriteTokens: 0 },
      16_000,
    );
    const withoutCacheWrite = estimateWorstCaseCostMicro({
      model: inputOnlyModel,
      inputTokenEstimate: 50_000,
      markupFraction: 0.3,
    });

    expect(withCacheWrite).toBeGreaterThan(withoutCacheWrite);
  });

  it('should match the credits-doc worked example within rounding (≈$1.11 reservation)', () => {
    // 50k input @ $6.25/M cache-write + 16k output @ $25/M ≈ $0.7125 provider
    // → ×1.3 markup ×1.2 margin ≈ $1.1115.
    const reserved = estimateWorstCaseCostMicro({ model: flagship, inputTokenEstimate: 50_000, markupFraction: 0.3 });

    expect(reserved).toBe(1_111_500n);
  });

  it('should clamp max output to the remaining context window', () => {
    const nearFull = estimateWorstCaseCostMicro({
      model: flagship,
      inputTokenEstimate: 199_000,
      markupFraction: 0.3,
    });
    // Only 1k output tokens fit: (199k × 6.25 + 1k × 25) / 1e6 × 1.3 × 1.2.
    expect(nearFull).toBe(1_979_250n);
  });
});

describe('estimateInputComponentMicro (the Q36 floor)', () => {
  it('should charge only the marked-up input component', () => {
    const model = syntheticModel({ inputTokens: 5, outputTokens: 25, cacheReadTokens: 0.5, cacheWriteTokens: 6.25 });
    // 50k @ $6.25/M = $0.3125 → ×1.3 = $0.40625 exactly.
    expect(estimateInputComponentMicro({ model, inputTokenEstimate: 50_000, markupFraction: 0.3 })).toBe(406_250n);
  });
});

describe('computeUserChargedCostMicro (the single commit rounding point)', () => {
  const model = syntheticModel({ inputTokens: 3, outputTokens: 15, cacheReadTokens: 0.3, cacheWriteTokens: 3.75 });

  it('should compute the marked-up charge in exact integer math', () => {
    const charged = computeUserChargedCostMicro({
      model,
      usage: { inputTokens: 1000, outputTokens: 500, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      markupFraction: 0.3,
    });
    // (1000×3 + 500×15) µ$/M = 10_500 µ$-per-M-scaled → ÷1e6 ... = 10.5k µ$ raw → ×1.3 = 13_650n... scaled: (10_500_000_000 × 1300) / 1e9
    expect(charged).toBe(13_650n);
  });

  it('should round half up exactly once at the end', () => {
    const tiny = computeUserChargedCostMicro({
      model,
      usage: { inputTokens: 1, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      markupFraction: 0.3,
    });
    // 1 token @ 3_000_000 µ$/M × 1.3 = 3.9 µ$ → rounds to 4.
    expect(tiny).toBe(4n);
  });

  it('should never charge cached reads at the full input rate', () => {
    const cached = computeUserChargedCostMicro({
      model,
      usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 10_000, cacheWriteTokens: 0 },
      markupFraction: 0.3,
    });
    const uncached = computeUserChargedCostMicro({
      model,
      usage: { inputTokens: 10_000, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      markupFraction: 0.3,
    });

    expect(cached).toBe(3900n);
    expect(uncached).toBe(39_000n);
  });

  it('should keep every enabled catalog model priceable end to end', () => {
    for (const providerModels of Object.values(modelList)) {
      for (const entry of Object.values(providerModels)) {
        if (!isModelListEntryEnabled(entry)) {
          continue;
        }
        const charged = computeUserChargedCostMicro({
          model: modelListEntryToModel(entry),
          usage: { inputTokens: 1000, outputTokens: 1000, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
          markupFraction: 0.3,
        });
        expect(charged).toBeGreaterThanOrEqual(0n);
      }
    }
  });
});
