/** Spend tiers a reader chooses between, cheapest first. @public */
export const modelTiers = ['Fast', 'Balanced', 'Frontier'] as const;

/** @public */
export type ModelTier = (typeof modelTiers)[number];

/**
 * Names the spend tier of a catalogue route from its published output price.
 *
 * The thresholds reproduce the tier table in
 * `docs/research/billing-admission-hold-redesign.md` ("How a user consumes
 * tiers"): Luna, Haiku and Gemini Flash are Fast; Terra, Sonnet and Gemini Pro
 * are Balanced; Astra, Sol, Opus and Fable are Frontier. Output price is the
 * discriminator because it dominates a turn's authorized maximum.
 *
 * @public
 */
export const modelTier = (outputCostPerMillion: number): ModelTier => {
  if (outputCostPerMillion < 8) {
    return 'Fast';
  }
  if (outputCostPerMillion <= 15) {
    return 'Balanced';
  }
  return 'Frontier';
};

/**
 * A model list grouped by tier, cheapest first, empty tiers dropped. The
 * self-host build, which prices nothing, lists one group instead.
 *
 * @public
 */
export const groupModelsByTier = <T extends { readonly details: { readonly cost: { readonly outputTokens: number } } }>(
  models: readonly T[],
): Array<{ name: string; items: T[] }> =>
  modelTiers
    .map((tier) => ({
      name: tier,
      items: models.filter((model) => modelTier(model.details.cost.outputTokens) === tier),
    }))
    .filter((group) => group.items.length > 0);
