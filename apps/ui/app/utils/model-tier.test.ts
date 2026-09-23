// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { modelTier } from '#utils/model-tier.js';

describe('modelTier', () => {
  // The governing tier table: Luna/Haiku/Gemini Flash are Fast, Terra/Sonnet/
  // Gemini Pro are Balanced, Astra/Sol/Opus/Fable are Frontier.
  const cases: Array<[number, string]> = [
    [0, 'Fast'],
    [1.2, 'Fast'],
    [5, 'Fast'],
    [7.5, 'Fast'],
    [9, 'Balanced'],
    [12, 'Balanced'],
    [15, 'Balanced'],
    [15.01, 'Frontier'],
    [25, 'Frontier'],
    [50, 'Frontier'],
  ];
  it.each(cases)('names $%s output per 1M as %s', (cost, tier) => {
    expect(modelTier(cost)).toBe(tier);
  });
});
