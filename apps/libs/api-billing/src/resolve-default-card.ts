import type Stripe from 'stripe';

/** The customer's default saved card — the one thing both the top-up charge path and the display projection resolve. */
export type DefaultCard = {
  readonly id: string;
  readonly brand: string;
  readonly last4: string;
};

/**
 * Resolves the customer's default card once, so the card *shown* in the
 * mini-checkout equals the card *charged* by the fast path (redesign Finding 6).
 * Preference: the invoice-settings default payment method, else the most recent
 * saved card. Returns `undefined` when none is on file — or on any Stripe error,
 * so the entitlements projection fails closed and the charge path falls back to
 * hosted Checkout rather than throwing.
 *
 * @param stripe - The Stripe client (already known to be configured by callers)
 * @param customerId - The Stripe customer id
 * @returns The default card's `{ id, brand, last4 }`, or `undefined`
 */
export const resolveDefaultCard = async (stripe: Stripe, customerId: string): Promise<DefaultCard | undefined> => {
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (customer.deleted) {
      return undefined;
    }
    const defaultPaymentMethod = customer.invoice_settings.default_payment_method ?? undefined;
    // With `expand`, a set default arrives as a full PaymentMethod object; the
    // string case (unexpanded) degrades to the most-recent card below — still
    // consistent across display and charge since both call this resolver.
    // ponytail: string default → most-recent card; expand makes it an object in practice.
    let paymentMethod: Stripe.PaymentMethod | undefined;
    if (typeof defaultPaymentMethod === 'object') {
      paymentMethod = defaultPaymentMethod;
    } else {
      const cards = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
      paymentMethod = cards.data[0];
    }
    if (paymentMethod?.card === undefined) {
      return undefined;
    }
    return { id: paymentMethod.id, brand: paymentMethod.card.brand, last4: paymentMethod.card.last4 };
  } catch {
    return undefined;
  }
};
