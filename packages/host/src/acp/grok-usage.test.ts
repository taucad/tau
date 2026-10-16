import { describe, expect, it } from 'vitest';
import { grokPromptUsageOf, grokVendorCostOf } from '#acp/grok-usage.js';

const tokens = { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedReadTokens: 40, reasoningTokens: 8 };

describe('Grok prompt usage', () => {
  it('should retain prompt totals and exact vendor cost independently of last-call siblings', () => {
    const usage = grokPromptUsageOf({
      inputTokens: 1,
      usage: {
        ...tokens,
        costUsdTicks: 2_000_000_000,
        numTurns: 2,
        modelUsage: { grok: { ...tokens, costUsdTicks: 2_000_000_000 } },
      },
    });
    expect(usage).toEqual({
      ...tokens,
      costUsdTicks: 2_000_000_000,
      numTurns: 2,
      modelUsage: { grok: { ...tokens, costUsdTicks: 2_000_000_000 } },
    });
    expect(usage && grokVendorCostOf(usage)).toEqual({
      amount: 0.2,
      currency: 'USD',
      reportedBy: 'grok',
      costUsdTicks: 2_000_000_000,
    });
  });

  it.each([{ usageIsIncomplete: true }, { costIsPartial: true }])(
    'should scrub every price on an incomplete ledger %j',
    (flags) => {
      const raw = {
        ...tokens,
        ...flags,
        costUsdTicks: 2_000_000_000,
        modelUsage: { grok: { ...tokens, costUsdTicks: 2_000_000_000 } },
      };
      const original = structuredClone(raw);
      const usage = grokPromptUsageOf({ usage: raw });
      expect(usage).toMatchObject({ ...tokens, ...flags, modelUsage: { grok: tokens } });
      expect(usage?.costUsdTicks).toBeUndefined();
      expect(usage?.modelUsage?.['grok']?.costUsdTicks).toBeUndefined();
      expect(usage && grokVendorCostOf(usage)).toBeUndefined();
      expect(raw).toEqual(original);
    },
  );

  it('should suppress a partial model price without losing its tokens', () => {
    const usage = grokPromptUsageOf({
      usage: { ...tokens, modelUsage: { grok: { ...tokens, costIsPartial: true, costUsdTicks: 50 } } },
    });
    expect(usage?.modelUsage?.['grok']).toEqual({ ...tokens, costIsPartial: true });
  });

  it('should distinguish an explicit zero quote from missing cost', () => {
    expect(grokVendorCostOf(tokens)).toBeUndefined();
    expect(grokVendorCostOf({ ...tokens, costUsdTicks: 0 })).toEqual({
      amount: 0,
      currency: 'USD',
      reportedBy: 'grok',
      costUsdTicks: 0,
    });
  });

  it.each([Number.MAX_SAFE_INTEGER + 1, -1, 'not-a-price', Number.NaN])(
    'should discard invalid cost %s without discarding valid tokens',
    (costUsdTicks) => {
      expect(grokPromptUsageOf({ usage: { ...tokens, costUsdTicks } })).toEqual(tokens);
    },
  );

  it('should treat malformed completeness flags as incomplete rather than trusting cost', () => {
    const usage = grokPromptUsageOf({ usage: { ...tokens, usageIsIncomplete: 'unknown', costUsdTicks: 20 } });
    expect(usage).toEqual({ ...tokens, usageIsIncomplete: true });
  });

  it('should reject absent, malformed and unbounded token reports', () => {
    expect(grokPromptUsageOf({ inputTokens: 10 })).toBeUndefined();
    expect(grokPromptUsageOf({ usage: { ...tokens, totalTokens: Number.POSITIVE_INFINITY } })).toBeUndefined();
    expect(
      grokPromptUsageOf({
        usage: {
          ...tokens,
          modelUsage: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [String(index), tokens])),
        },
      }),
    ).toBeUndefined();
  });
});
