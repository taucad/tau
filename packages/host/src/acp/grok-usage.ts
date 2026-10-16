/** Preserve Grok's prompt ledger without presenting incomplete vendor cost as a known price. */
import { z } from 'zod';

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const completenessFlag = z
  .unknown()
  .transform((value) => (typeof value === 'boolean' ? value : true))
  .optional();
const modelUsageSchema = z.object({
  inputTokens: counter,
  outputTokens: counter,
  totalTokens: counter,
  cachedReadTokens: counter.optional(),
  cacheCreationTokens: counter.optional(),
  reasoningTokens: counter.optional(),
  modelCalls: counter.optional(),
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- Grok's external wire field, measured in milliseconds.
  apiDurationMs: counter.optional(),
  // An invalid or imprecise price must not discard otherwise valid usage counters.
  costUsdTicks: z
    .unknown()
    .transform((value) => counter.safeParse(value).data)
    .optional(),
  costIsPartial: completenessFlag,
});

const promptUsageSchema = modelUsageSchema.extend({
  numTurns: counter.optional(),
  usageIsIncomplete: completenessFlag,
  modelUsage: z
    .record(z.string().min(1).max(256), modelUsageSchema)
    .refine((rows) => Object.keys(rows).length <= 64)
    .optional(),
});

/** Vendor per-prompt counters, with unsafe prices removed. @internal */
export type GrokPromptUsage = z.infer<typeof promptUsageSchema>;
/** Vendor cost, separate from Tau billing; ticks preserve the exact supplied integer. @internal */
export type GrokVendorCost = { amount: number; currency: 'USD'; reportedBy: 'grok'; costUsdTicks: number };

/**
 * Strip untrustworthy cost without mutating the vendor payload or dropping usage flags.
 * @internal
 * @param meta - The prompt response's `_meta`, not its last-model-call sibling counters.
 * @returns The full prompt ledger, or nothing for absent/malformed usage.
 */
export const grokPromptUsageOf = (meta: unknown): GrokPromptUsage | undefined => {
  const parsed = z.object({ usage: promptUsageSchema }).safeParse(meta);
  if (!parsed.success) {
    return undefined;
  }
  const { usage } = parsed.data;
  const { costUsdTicks, modelUsage, ...rest } = usage;
  const untrustworthy = usage.usageIsIncomplete === true || usage.costIsPartial === true;
  return {
    ...rest,
    ...(!untrustworthy && costUsdTicks !== undefined ? { costUsdTicks } : {}),
    ...(modelUsage === undefined
      ? {}
      : {
          modelUsage: Object.fromEntries(
            Object.entries(modelUsage).map(([model, row]) => {
              const { costUsdTicks: rowTicks, ...rowRest } = row;
              return [
                model,
                {
                  ...rowRest,
                  ...(usage.costIsPartial === true ? { costIsPartial: true } : {}),
                  ...(!untrustworthy && row.costIsPartial !== true && rowTicks !== undefined
                    ? { costUsdTicks: rowTicks }
                    : {}),
                },
              ];
            }),
          ),
        }),
  };
};

/**
 * Convert an explicitly complete, precise vendor quote to its labelled dollar value.
 * @internal
 * @param usage - Validated Grok prompt ledger.
 * @returns Vendor-owned USD cost; absence means unknown, not free.
 */
export const grokVendorCostOf = (usage: GrokPromptUsage): GrokVendorCost | undefined =>
  usage.costUsdTicks === undefined || usage.usageIsIncomplete === true || usage.costIsPartial === true
    ? undefined
    : {
        amount: usage.costUsdTicks / 10_000_000_000,
        currency: 'USD',
        reportedBy: 'grok',
        costUsdTicks: usage.costUsdTicks,
      };
