/* oxlint-disable typescript/no-restricted-types -- null is the closed-collection state the payment service already models */
/**
 * Which Stripe collection a process may perform. `local_fixture` is the loopback test double;
 * `stripe_test` is a real Stripe sandbox; `stripe_live` takes real money.
 */
export type BillingCollection = {
  readonly kind: 'local_fixture' | 'stripe_test' | 'stripe_live';
  readonly monthlyPriceId: string;
  readonly topupProductId: string;
};

/**
 * Selects the collection a deployment may perform, or `null` when it must collect nothing.
 *
 * Test keys collect only outside `prod-*`; live keys collect only inside `prod-*` and only
 * once the operator has set the explicit live activation. Every other combination is closed,
 * and the caller reports that truthfully instead of offering a purchase that cannot succeed.
 */
export function resolveBillingCollection(input: {
  readonly environment: string | undefined;
  readonly stripeAccountId: string | undefined;
  readonly livemode: boolean | undefined;
  readonly liveCollectionEnabled: boolean;
  readonly monthlyPriceId: string | undefined;
  readonly topupProductId: string | undefined;
}): BillingCollection | null {
  const { environment, monthlyPriceId, topupProductId } = input;
  if (!environment || !input.stripeAccountId || input.livemode === undefined || !monthlyPriceId || !topupProductId) {
    return null;
  }
  const production = environment.startsWith('prod-');
  if (input.livemode) {
    return production && input.liveCollectionEnabled ? { kind: 'stripe_live', monthlyPriceId, topupProductId } : null;
  }
  return production ? null : { kind: 'stripe_test', monthlyPriceId, topupProductId };
}

/** True when a composed collection agrees with the process's key mode and environment. */
export function collectionMatchesScope(
  collection: BillingCollection | null,
  scope: { readonly livemode: boolean; readonly environment: string },
): collection is BillingCollection {
  if (collection === null) {
    return false;
  }
  const live = collection.kind === 'stripe_live';
  return live === scope.livemode && live === scope.environment.startsWith('prod-');
}
