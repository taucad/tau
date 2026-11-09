import { z } from 'zod';
import { financialEnvironmentSchema, financialIdentitySchema, unsignedIntegerStringSchema } from '@taucad/billing';

/**
 * Persisted payment evidence shapes: the JSON the `billing` payment tables store,
 * with the schemas that admit it. The billing payment contract re-exports them.
 */

/** Exact commercial terms frozen before a collection obligation. */
export const paymentOfferSnapshotSchema = z
  .object({
    version: z.literal('payment-offer-v1'),
    policyId: financialIdentitySchema,
    offerId: financialIdentitySchema,
    environment: financialEnvironmentSchema,
    accountId: financialIdentitySchema,
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    currency: z.literal('usd'),
    principalMinor: unsignedIntegerStringSchema,
    taxMinor: unsignedIntegerStringSchema.nullable(),
    grossMinor: unsignedIntegerStringSchema.nullable(),
    maximumGrossMinor: unsignedIntegerStringSchema.nullable(),
    creditAtoms: unsignedIntegerStringSchema,
    ceilingCreditAtoms: unsignedIntegerStringSchema.nullable(),
    stripePriceId: z.string().min(1).max(255).nullable(),
    stripeProductId: z.string().min(1).max(255).nullable(),
    quantity: z.literal(1),
    term: z.enum(['one_time', 'month']),
    taxBasis: z.enum(['synthetic_local_zero_tax', 'stripe_tax', 'stripe_checkout']),
    paymentMethod: z
      .object({
        id: z.string().min(1).max(255),
        brand: z.string().min(1).max(40),
        last4: z.string().regex(/^[0-9]{4}$/u),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((offer, context) => {
    if (offer.taxBasis === 'stripe_checkout') {
      if (
        offer.taxMinor !== null ||
        offer.grossMinor !== null ||
        offer.maximumGrossMinor !== null ||
        offer.paymentMethod !== null
      ) {
        context.addIssue({ code: 'custom', message: 'Checkout tax remains source-qualified until payment' });
      }
      return;
    }
    if (offer.taxMinor === null || offer.grossMinor === null || offer.maximumGrossMinor === null) {
      context.addIssue({ code: 'custom', message: 'Quoted payment totals are required' });
      return;
    }
    if (
      ![
        offer.principalMinor,
        offer.taxMinor,
        offer.grossMinor,
        offer.maximumGrossMinor,
        offer.creditAtoms,
        ...(offer.ceilingCreditAtoms === null ? [] : [offer.ceilingCreditAtoms]),
      ].every((value) => unsignedIntegerStringSchema.safeParse(value).success)
    ) {
      return;
    }
    if (
      BigInt(offer.principalMinor) + BigInt(offer.taxMinor) !== BigInt(offer.grossMinor) ||
      BigInt(offer.grossMinor) > BigInt(offer.maximumGrossMinor) ||
      BigInt(offer.creditAtoms) === 0n ||
      (offer.term === 'month') !== (offer.ceilingCreditAtoms !== null)
    ) {
      context.addIssue({ code: 'custom', message: 'Unsupported or inconsistent payment offer' });
    }
  });

export type PaymentOfferSnapshot = z.infer<typeof paymentOfferSnapshotSchema>;

/** Minimal source evidence; no personal address, email or provider error payload. */
export const paidPaymentEvidenceSchema = z
  .object({
    version: z.literal('stripe-paid-v1'),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    customerId: z.string().min(1).max(255),
    currency: z.literal('usd'),
    principalMinor: unsignedIntegerStringSchema,
    taxMinor: unsignedIntegerStringSchema,
    grossMinor: unsignedIntegerStringSchema,
    paymentIntentIds: z.array(z.string().min(1).max(255)).min(1).max(100),
    chargeIds: z.array(z.string().min(1).max(255)).min(1).max(100),
    invoiceId: z.string().min(1).max(255).nullable(),
    subscriptionId: z.string().min(1).max(255).nullable(),
    subscriptionItemId: z.string().min(1).max(255).nullable(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    paidAt: z.iso.datetime({ offset: true }),
    paymentMethod: z
      .object({
        id: z.string().min(1).max(255),
        brand: z.string().min(1).max(40),
        last4: z.string().regex(/^[0-9]{4}$/u),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      ![evidence.principalMinor, evidence.taxMinor, evidence.grossMinor].every(
        (value) => unsignedIntegerStringSchema.safeParse(value).success,
      )
    ) {
      return;
    }
    if (BigInt(evidence.principalMinor) + BigInt(evidence.taxMinor) !== BigInt(evidence.grossMinor)) {
      context.addIssue({ code: 'custom', message: 'Paid principal plus tax must equal gross' });
    }
  });

export type PaidPaymentEvidence = z.infer<typeof paidPaymentEvidenceSchema>;

/** Source-conclusive cancellation retained before a replacement may collect. */
export const noChargeEvidenceSchema = z
  .object({
    version: z.literal('stripe-no-charge-v1'),
    status: z.literal('canceled'),
    paymentIntentId: z.string().min(1).max(255),
    customerId: z.string().min(1).max(255),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    amountReceived: z.literal('0'),
    amountCapturable: z.literal('0'),
    chargeId: z.string().min(1).max(255).nullable(),
    amountCaptured: z.literal('0'),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type NoChargeEvidence = z.infer<typeof noChargeEvidenceSchema>;

/** Refetched terminal setup Session evidence; this never proves a cash refund or PI cancellation. */
export const checkoutExpiryEvidenceSchema = z
  .object({
    version: z.literal('stripe-checkout-expiry-v1'),
    checkoutSessionId: z.string().min(1).max(255),
    customerId: z.string().min(1).max(255),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    status: z.literal('expired'),
    mode: z.literal('setup'),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type CheckoutExpiryEvidence = z.infer<typeof checkoutExpiryEvidenceSchema>;

/** Refetched canceled Subscription identity, including already-canceled source recovery. */
export const subscriptionCancellationEvidenceSchema = z
  .object({
    version: z.literal('stripe-subscription-canceled-v1'),
    subscriptionId: z.string().min(1).max(255),
    customerId: z.string().min(1).max(255),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    status: z.literal('canceled'),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type SubscriptionCancellationEvidence = z.infer<typeof subscriptionCancellationEvidenceSchema>;

/** An expired subscription Checkout proves no external subscription was created. */
export const subscriptionCheckoutExpiryEvidenceSchema = z
  .object({
    version: z.literal('stripe-subscription-checkout-expired-v1'),
    checkoutSessionId: z.string().min(1).max(255),
    customerId: z.string().min(1).max(255),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    status: z.literal('expired'),
    mode: z.literal('subscription'),
    subscriptionId: z.null(),
    paymentIntentId: z.null(),
    paymentStatus: z.literal('unpaid'),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type SubscriptionCheckoutExpiryEvidence = z.infer<typeof subscriptionCheckoutExpiryEvidenceSchema>;

/** An expired payment Checkout proves no funds moved; any PaymentIntent it opened was canceled empty. */
export const paymentCheckoutExpiryEvidenceSchema = z
  .object({
    version: z.literal('stripe-payment-checkout-expired-v1'),
    checkoutSessionId: z.string().min(1).max(255),
    customerId: z.string().min(1).max(255),
    stripeAccountId: z.string().min(1).max(255),
    livemode: z.boolean(),
    status: z.literal('expired'),
    mode: z.literal('payment'),
    paymentIntentId: z.string().min(1).max(255).nullable(),
    paymentStatus: z.literal('unpaid'),
    amountReceived: z.literal('0'),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PaymentCheckoutExpiryEvidence = z.infer<typeof paymentCheckoutExpiryEvidenceSchema>;

/** Stripe refused a PaymentIntent create outright, so a replay under the same key can never charge. */
export type RequestRejectedEvidence = {
  readonly version: 'stripe-request-rejected-v1';
  readonly idempotencyKey: string;
  readonly errorType: string;
  readonly observedAt: string;
};
