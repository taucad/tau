/* oxlint-disable typescript/no-restricted-types -- The billing boundary returns explicit JSON nulls; swapping them for `undefined` would stop modelling what the API returns. */
/**
 * The `/v1/billing/usage` rows the live specs read, and how a run is judged by them.
 *
 * Deliberately free of browser imports: the judgement is the part worth pinning
 * without a server, a browser and real provider credit. The drive-and-settle
 * helpers that fetch these rows live in `live-chat-turn.ts`.
 */

/** One `/v1/billing/usage` row for a model turn. */
export type UsageReceipt = {
  readonly kind: 'base';
  /** Attribution the usage feed groups by; the hints are null until a producer sets them. */
  readonly activity: {
    readonly kind: string;
    readonly projectHint: string | null;
    readonly chatHint: string | null;
  };
  readonly customerState: 'absorbed' | 'released' | 'settled';
  readonly executionStatus: string;
  readonly meteringStatus: string;
  readonly model: { readonly id: string; readonly providerId: string | null };
  readonly operationId: string;
  readonly tokens: {
    readonly output: string | null;
    readonly reasoning?: string | null;
  };
};

/**
 * Split the receipts an assertion owns into the ones that were charged and the ones that are defects.
 *
 * A turn that recovered from a provider refusal legitimately leaves a
 * `released`/`rejected` receipt for the same model beside the charged ones, so
 * "every matching receipt settled" fails a run that is in fact correct. What has
 * to hold is that enough receipts settled end to end and that none was
 * `absorbed` — the state where Tau ate the cost, which is never a recovery.
 *
 * @param receipts - Every base row the signed-in account has.
 * @param match - Which rows this assertion owns (by provider or provider-side model).
 * @returns The fully settled rows, and the absorbed ones a caller must refuse.
 */
export const classifyReceipts = (
  receipts: readonly UsageReceipt[],
  match: (receipt: UsageReceipt) => boolean,
): { readonly absorbed: readonly UsageReceipt[]; readonly settled: readonly UsageReceipt[] } => {
  const matched = receipts.filter((receipt) => match(receipt));
  return {
    absorbed: matched.filter((receipt) => receipt.customerState === 'absorbed'),
    settled: matched.filter(
      (receipt) =>
        receipt.customerState === 'settled' &&
        receipt.executionStatus === 'succeeded' &&
        receipt.meteringStatus === 'complete',
    ),
  };
};
