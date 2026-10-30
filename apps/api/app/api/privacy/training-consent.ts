import type { BillingTier } from '@taucad/billing';

/**
 * Whether an account's chats may be used to improve the service.
 *
 * An assured Free account follows its stored preference, which defaults on. Every other account, paid or with a tier
 * that could not be established, counts only a `true` it chose itself: the column default never opts a paying user in.
 *
 * @param input - The account's tier, its assurance, and its stored preference with when it was chosen.
 * @returns The effective consent.
 */
export function effectiveTrainingConsent(input: {
  readonly tier: BillingTier;
  readonly assured: boolean;
  readonly allowsAiTraining: boolean;
  readonly decidedAt: Date | undefined;
}): boolean {
  if (input.tier === 'free' && input.assured) {
    return input.allowsAiTraining;
  }
  return input.decidedAt !== undefined && input.allowsAiTraining;
}
