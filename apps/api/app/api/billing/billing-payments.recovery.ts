import { createHash } from 'node:crypto';
/* oxlint-disable typescript/no-unnecessary-condition, typescript/prefer-optional-chain -- explicit Stripe evidence guards document every required field */
import type { Stripe } from 'stripe';
import { paidPaymentEvidenceSchema } from '#api/billing/billing-payment-contract.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import type {
  StripeInvoiceEvidence,
  StripePaymentEvidence,
  StripeTaxCalculationEvidence,
} from '#api/billing/billing-stripe.js';

export type ReloadSetupQualification =
  | {
      readonly status: 'qualified';
      readonly setupIntentId: string;
      readonly paymentMethodId: string;
      readonly brand: string;
      readonly last4: string;
    }
  | { readonly status: 'pending' | 'unsupported'; readonly reason: string };

export type ReloadCustomerLocation = {
  readonly revision: string;
  readonly address: {
    readonly city: string;
    readonly country: string;
    readonly line1: string;
    readonly postalCode: string;
    readonly state?: string;
  };
};

type ReloadCustomerSource = Pick<Stripe.Customer, 'address' | 'id' | 'livemode' | 'metadata' | 'object'>;
type ReloadSetupSource = {
  readonly session: Pick<
    Stripe.Checkout.Session,
    'client_reference_id' | 'customer' | 'id' | 'livemode' | 'metadata' | 'mode' | 'setup_intent' | 'status'
  >;
  readonly setupIntent: Pick<
    Stripe.SetupIntent,
    'customer' | 'id' | 'livemode' | 'metadata' | 'payment_method' | 'status' | 'usage'
  >;
  readonly paymentMethod: Omit<Pick<Stripe.PaymentMethod, 'card' | 'customer' | 'id' | 'type'>, 'card'> & {
    readonly card?: Pick<Stripe.PaymentMethod.Card, 'brand' | 'last4'>;
  };
};

/** Qualifies the owned Customer billing location and returns its content revision without retaining the address. */
export function qualifyReloadCustomerLocation(input: {
  readonly accountId: string;
  readonly customerBindingId: string;
  readonly customerId: string;
  readonly livemode: boolean;
  readonly customer: ReloadCustomerSource;
}): ReloadCustomerLocation | undefined {
  const { address } = input.customer;
  if (
    input.customer.id !== input.customerId ||
    input.customer.livemode !== input.livemode ||
    input.customer.metadata?.['tau_account_id'] !== input.accountId ||
    input.customer.metadata?.['tau_customer_binding_id'] !== input.customerBindingId ||
    address === null ||
    address === undefined ||
    !address.city ||
    !address.country ||
    !address.line1 ||
    !address.postal_code
  ) {
    return undefined;
  }
  const retained = {
    city: address.city,
    country: address.country,
    line1: address.line1,
    postalCode: address.postal_code,
    ...(address.state === null ? {} : { state: address.state }),
  };
  return {
    revision: createHash('sha256')
      .update(
        JSON.stringify({
          accountId: input.accountId,
          customerBindingId: input.customerBindingId,
          customerId: input.customerId,
          livemode: input.livemode,
          address: retained,
        }),
      )
      .digest('hex'),
    address: retained,
  };
}

/** Qualifies the complete hosted consent→Session→SetupIntent→card lineage. */
export function qualifyReloadSetup(input: {
  readonly consentId: string;
  readonly consentVersion: number;
  readonly customerId: string;
  readonly livemode: boolean;
  readonly providerLegId: string;
  readonly source: ReloadSetupSource;
}): ReloadSetupQualification {
  const { session, setupIntent, paymentMethod } = input.source;
  const expected = [
    ['tau_reload_consent_id', input.consentId],
    ['tau_reload_consent_version', String(input.consentVersion)],
    ['tau_provider_leg_id', input.providerLegId],
  ] as const;
  if (session.status === 'open' || setupIntent.status === 'processing') {
    return { status: 'pending', reason: 'setup_pending' };
  }
  if (
    session.livemode !== input.livemode ||
    session.mode !== 'setup' ||
    session.status !== 'complete' ||
    session.client_reference_id !== input.consentId ||
    stripeId(session.customer) !== input.customerId ||
    stripeId(session.setup_intent) !== setupIntent.id ||
    setupIntent.livemode !== input.livemode ||
    setupIntent.status !== 'succeeded' ||
    setupIntent.usage !== 'off_session' ||
    stripeId(setupIntent.customer) !== input.customerId ||
    stripeId(setupIntent.payment_method) !== paymentMethod.id ||
    stripeId(paymentMethod.customer) !== input.customerId ||
    paymentMethod.type !== 'card' ||
    paymentMethod.card === undefined ||
    expected.some(([key, value]) => session.metadata?.[key] !== value || setupIntent.metadata?.[key] !== value)
  ) {
    return { status: 'unsupported', reason: 'setup_source_mismatch' };
  }
  return {
    status: 'qualified',
    setupIntentId: setupIntent.id,
    paymentMethodId: paymentMethod.id,
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
  };
}

export type ReloadTaxQualification =
  | {
      readonly status: 'qualified';
      readonly calculationId: string;
      readonly taxMinor: number;
      readonly grossMinor: number;
      readonly expiresAt: Date;
    }
  | { readonly status: 'pending' | 'unsupported'; readonly reason: string };

/** Qualifies a complete exclusive-tax calculation for one frozen reload principal. */
export function qualifyReloadTaxCalculation(input: {
  readonly customerId: string;
  readonly livemode: boolean;
  readonly principalMinor: number;
  readonly productId: string;
  readonly reference: string;
  readonly location: ReloadCustomerLocation;
  readonly observedAt: Date;
  readonly source: StripeTaxCalculationEvidence;
}): ReloadTaxQualification {
  const { calculation, lines, complete } = input.source;
  if (!complete) {
    return { status: 'pending', reason: 'tax_lines_incomplete' };
  }
  const line = lines.at(0);
  if (
    calculation.id === null ||
    calculation.livemode !== input.livemode ||
    calculation.customer !== input.customerId ||
    calculation.currency !== 'usd' ||
    calculation.customer_details.address?.city !== input.location.address.city ||
    calculation.customer_details.address.country !== input.location.address.country ||
    calculation.customer_details.address.line1 !== input.location.address.line1 ||
    calculation.customer_details.address.postal_code !== input.location.address.postalCode ||
    (calculation.customer_details.address.state ?? undefined) !== input.location.address.state ||
    calculation.customer_details.address_source !== 'billing' ||
    calculation.expires_at === null ||
    calculation.expires_at * 1000 <= input.observedAt.getTime() ||
    calculation.tax_amount_inclusive !== 0 ||
    calculation.tax_amount_exclusive < 0 ||
    calculation.amount_total !== input.principalMinor + calculation.tax_amount_exclusive ||
    lines.length !== 1 ||
    line === undefined ||
    line.livemode !== input.livemode ||
    line.amount !== input.principalMinor ||
    line.amount_tax !== calculation.tax_amount_exclusive ||
    line.product !== input.productId ||
    line.quantity !== 1 ||
    line.reference !== input.reference ||
    line.tax_behavior !== 'exclusive'
  ) {
    return { status: 'unsupported', reason: 'tax_source_mismatch' };
  }
  return {
    status: 'qualified',
    calculationId: calculation.id,
    taxMinor: calculation.tax_amount_exclusive,
    grossMinor: calculation.amount_total,
    expiresAt: new Date(calculation.expires_at * 1000),
  };
}

export type PaymentQualification =
  | { readonly status: 'paid'; readonly evidence: PaidPaymentEvidence }
  | { readonly status: 'pending'; readonly reason: string }
  | { readonly status: 'no_charge'; readonly reason: string }
  | { readonly status: 'unsupported'; readonly reason: string };

export type InvoiceQualification =
  | {
      readonly status: 'verified';
      readonly periodStart: Date;
      readonly periodEnd: Date;
      readonly evidence: PaidPaymentEvidence;
    }
  | { readonly status: 'pending' | 'unsupported'; readonly reason: string };

export type StripeCheckoutEvidence = {
  readonly session: Stripe.Checkout.Session;
  readonly lines: readonly Stripe.LineItem[];
  readonly complete: boolean;
};

/** Qualifies a manual PaymentIntent against the immutable local offer and owner. */
export function qualifyManualPayment(input: {
  readonly offer: PaymentOfferSnapshot;
  readonly customerId: string;
  readonly customerBindingId: string;
  readonly providerLegId: string;
  readonly purchaseId: string;
  readonly paymentMethod: PaymentOfferSnapshot['paymentMethod'];
  readonly checkout?: StripeCheckoutEvidence;
  readonly sourceAcceptance?: { readonly type: 'payment_intent.succeeded'; readonly createdAt: Date };
  readonly source: StripePaymentEvidence;
}): PaymentQualification {
  const { paymentIntent, latestCharge } = input.source;
  const hosted =
    input.paymentMethod === null
      ? hostedCheckoutAmounts({
          source: input.checkout,
          offer: input.offer,
          purchaseId: input.purchaseId,
          customerId: input.customerId,
          customerBindingId: input.customerBindingId,
          providerLegId: input.providerLegId,
          paymentIntentId: paymentIntent.id,
        })
      : undefined;
  if (input.paymentMethod === null && hosted === undefined) {
    return {
      status: input.checkout?.complete === false ? 'pending' : 'unsupported',
      reason: input.checkout?.complete === false ? 'checkout_pagination_incomplete' : 'checkout_source_mismatch',
    };
  }
  const taxMinor = hosted?.taxMinor ?? input.offer.taxMinor;
  const grossMinor = hosted?.grossMinor ?? input.offer.grossMinor;
  if (taxMinor === null || grossMinor === null) {
    return { status: 'unsupported', reason: 'payment_offer_total_missing' };
  }
  if (
    paymentIntent.livemode !== input.offer.livemode ||
    stripeId(paymentIntent.customer) !== input.customerId ||
    paymentIntent.currency !== input.offer.currency ||
    paymentIntent.amount !== Number(grossMinor) ||
    paymentIntent.metadata['tau_purchase_id'] !== input.purchaseId ||
    paymentIntent.metadata['tau_customer_binding_id'] !== input.customerBindingId ||
    paymentIntent.metadata['tau_provider_leg_id'] !== input.providerLegId
  ) {
    return { status: 'unsupported', reason: 'payment_owner_or_amount_mismatch' };
  }
  if (paymentIntent.status === 'canceled') {
    return isConclusiveNoCharge(input.source, {
      customerId: input.customerId,
      livemode: input.offer.livemode,
      paymentIntentId: paymentIntent.id,
      grossMinor: Number(grossMinor),
      purchaseId: input.purchaseId,
      customerBindingId: input.customerBindingId,
      providerLegId: input.providerLegId,
      paymentMethodId: input.paymentMethod?.id,
    })
      ? { status: 'no_charge', reason: 'payment_canceled_without_funds' }
      : { status: 'unsupported', reason: 'canceled_payment_has_funds' };
  }
  if (paymentIntent.status !== 'succeeded') {
    return {
      status: 'pending',
      reason: paymentIntent.status === 'requires_action' ? 'authentication_required' : 'payment_pending',
    };
  }
  if (
    paymentIntent.amount_received !== paymentIntent.amount ||
    latestCharge === undefined ||
    latestCharge.id !== stripeId(paymentIntent.latest_charge) ||
    latestCharge.livemode !== input.offer.livemode ||
    stripeId(latestCharge.payment_intent) !== paymentIntent.id ||
    stripeId(latestCharge.customer) !== input.customerId ||
    latestCharge.currency !== input.offer.currency ||
    latestCharge.amount !== paymentIntent.amount ||
    latestCharge.amount_captured !== paymentIntent.amount ||
    !latestCharge.paid ||
    latestCharge.status !== 'succeeded' ||
    latestCharge.refunded ||
    latestCharge.amount_refunded !== 0
  ) {
    return { status: 'unsupported', reason: 'payment_settlement_incomplete' };
  }
  const card = latestCharge.payment_method_details?.card;
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- Stripe expanded-resource union is generated with an any escape
  const method = typeof latestCharge.payment_method === 'string' ? latestCharge.payment_method : undefined;
  const brand = typeof card?.brand === 'string' ? card.brand : undefined;
  const last4 = typeof card?.last4 === 'string' ? card.last4 : undefined;
  const chargedPaymentMethod =
    brand === undefined || last4 === undefined || method === undefined
      ? null
      : // oxlint-disable-next-line typescript/no-unsafe-assignment -- guarded Stripe identifier is a string at runtime
        { id: method, brand, last4 };
  if (
    input.paymentMethod !== null &&
    (chargedPaymentMethod === null ||
      chargedPaymentMethod.id !== input.paymentMethod.id ||
      chargedPaymentMethod.brand !== input.paymentMethod.brand ||
      chargedPaymentMethod.last4 !== input.paymentMethod.last4)
  ) {
    return { status: 'unsupported', reason: 'charged_payment_method_mismatch' };
  }
  if (input.sourceAcceptance === undefined || !Number.isFinite(input.sourceAcceptance.createdAt.getTime())) {
    return { status: 'pending', reason: 'payment_acceptance_time_unknown' };
  }
  const evidence = paidPaymentEvidenceSchema.parse({
    version: 'stripe-paid-v1',
    stripeAccountId: input.offer.stripeAccountId,
    livemode: input.offer.livemode,
    customerId: input.customerId,
    currency: input.offer.currency,
    principalMinor: input.offer.principalMinor,
    taxMinor,
    grossMinor,
    paymentIntentIds: [paymentIntent.id],
    chargeIds: [latestCharge.id],
    invoiceId: null,
    subscriptionId: null,
    subscriptionItemId: null,
    sourceDigest: paymentDigest(paymentIntent, latestCharge),
    paidAt: input.sourceAcceptance.createdAt.toISOString(),
    paymentMethod: chargedPaymentMethod,
  });
  return { status: 'paid', evidence };
}

function hostedCheckoutAmounts(input: {
  readonly source?: StripeCheckoutEvidence;
  readonly offer: PaymentOfferSnapshot;
  readonly purchaseId: string;
  readonly customerId: string;
  readonly customerBindingId: string;
  readonly providerLegId: string;
  readonly paymentIntentId: string;
}): { readonly taxMinor: string; readonly grossMinor: string } | undefined {
  const { source, offer, purchaseId, customerId, customerBindingId, providerLegId, paymentIntentId } = input;
  if (source === undefined || !source.complete || source.lines.length !== 1) {
    return undefined;
  }
  const { session } = source;
  const line = source.lines.at(0);
  const productId = line === undefined || line.price === null ? undefined : stripeId(line.price.product);
  const taxMinor = session.total_details?.amount_tax;
  const grossMinor = session.amount_total;
  const exactOfferMatches =
    offer.taxMinor === null || offer.grossMinor === null
      ? offer.taxBasis === 'stripe_checkout'
      : Number(offer.taxMinor) === taxMinor && Number(offer.grossMinor) === grossMinor;
  const matches =
    session.livemode === offer.livemode &&
    session.mode === 'payment' &&
    session.status === 'complete' &&
    session.payment_status === 'paid' &&
    stripeId(session.customer) === customerId &&
    stripeId(session.payment_intent) === paymentIntentId &&
    session.client_reference_id === purchaseId &&
    session.currency === offer.currency &&
    session.amount_subtotal === Number(offer.principalMinor) &&
    Number.isSafeInteger(taxMinor) &&
    taxMinor !== undefined &&
    taxMinor >= 0 &&
    Number.isSafeInteger(grossMinor) &&
    grossMinor !== null &&
    grossMinor === Number(offer.principalMinor) + taxMinor &&
    session.automatic_tax?.status === 'complete' &&
    session.customer_details?.address?.country !== null &&
    session.customer_details?.address?.country !== undefined &&
    session.metadata?.['tau_purchase_id'] === purchaseId &&
    session.metadata['tau_customer_binding_id'] === customerBindingId &&
    session.metadata['tau_provider_leg_id'] === providerLegId &&
    line !== undefined &&
    line.quantity === 1 &&
    line.amount_subtotal === Number(offer.principalMinor) &&
    line.amount_total === grossMinor &&
    line.currency === offer.currency &&
    offer.stripeProductId !== null &&
    productId === offer.stripeProductId &&
    exactOfferMatches;
  return matches ? { taxMinor: String(taxMinor), grossMinor: String(grossMinor) } : undefined;
}

/** A hosted replacement is allowed only after Stripe proves the old intent received no funds. */
export function isConclusiveNoCharge(
  source: StripePaymentEvidence,
  expected: {
    readonly customerId: string;
    readonly customerBindingId: string;
    readonly grossMinor: number;
    readonly livemode: boolean;
    readonly paymentMethodId?: string;
    readonly paymentIntentId: string;
    readonly providerLegId: string;
    readonly purchaseId: string;
  },
): boolean {
  const { paymentIntent, latestCharge } = source;
  return (
    paymentIntent.id === expected.paymentIntentId &&
    paymentIntent.livemode === expected.livemode &&
    stripeId(paymentIntent.customer) === expected.customerId &&
    paymentIntent.amount === expected.grossMinor &&
    paymentIntent.metadata['tau_purchase_id'] === expected.purchaseId &&
    paymentIntent.metadata['tau_customer_binding_id'] === expected.customerBindingId &&
    paymentIntent.metadata['tau_provider_leg_id'] === expected.providerLegId &&
    // A declined attempt detaches its method; the decline itself still names the card that was tried.
    (expected.paymentMethodId === undefined ||
      stripeId(paymentIntent.payment_method) === expected.paymentMethodId ||
      (paymentIntent.payment_method === null &&
        stripeId(paymentIntent.last_payment_error?.payment_method ?? null) === expected.paymentMethodId)) &&
    paymentIntent.status === 'canceled' &&
    paymentIntent.amount_received === 0 &&
    paymentIntent.amount_capturable === 0 &&
    (latestCharge === undefined ||
      (latestCharge.livemode === expected.livemode &&
        stripeId(latestCharge.payment_intent) === paymentIntent.id &&
        stripeId(latestCharge.customer) === expected.customerId &&
        latestCharge.amount_captured === 0))
  );
}

/** Qualifies one fully paginated monthly invoice and its actual cash payment. */
export function qualifySubscriptionInvoice(input: {
  readonly offer: PaymentOfferSnapshot;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly subscription: Stripe.Subscription;
  readonly invoice: StripeInvoiceEvidence;
  readonly payment: StripePaymentEvidence;
}): InvoiceQualification {
  const { invoice, lines, payments, complete } = input.invoice;
  if (!complete) {
    return { status: 'pending', reason: 'invoice_pagination_incomplete' };
  }
  const invoiceSubscription =
    invoice.parent?.type === 'subscription_details'
      ? stripeId(invoice.parent.subscription_details?.subscription ?? null)
      : undefined;
  const remoteSubscription = input.subscription;
  const principalMinor = Number(input.offer.principalMinor);
  const grossMinor = invoice.total;
  const taxMinor = grossMinor - invoice.subtotal;
  const exactOfferMatches =
    input.offer.taxMinor === null || input.offer.grossMinor === null
      ? input.offer.taxBasis === 'stripe_checkout'
      : Number(input.offer.taxMinor) === taxMinor && Number(input.offer.grossMinor) === grossMinor;
  if (
    remoteSubscription.id !== input.subscriptionId ||
    remoteSubscription.livemode !== input.offer.livemode ||
    stripeId(remoteSubscription.customer) !== input.customerId ||
    invoice.livemode !== input.offer.livemode ||
    invoice.status !== 'paid' ||
    stripeId(invoice.customer) !== input.customerId ||
    invoiceSubscription !== input.subscriptionId ||
    invoice.currency !== 'usd' ||
    !Number.isSafeInteger(grossMinor) ||
    !Number.isSafeInteger(taxMinor) ||
    taxMinor < 0 ||
    invoice.subtotal !== principalMinor ||
    invoice.amount_paid !== grossMinor ||
    invoice.amount_remaining !== 0 ||
    invoice.amount_due !== grossMinor ||
    invoice.automatic_tax?.status !== 'complete' ||
    invoice.customer_address?.country === null ||
    invoice.customer_address?.country === undefined ||
    !exactOfferMatches ||
    lines.length !== 1 ||
    payments.length !== 1
  ) {
    return { status: 'unsupported', reason: 'invoice_owner_or_total_mismatch' };
  }
  const line = lines[0];
  const allocation = payments[0];
  const details = line?.parent?.subscription_item_details;
  const priceId = line?.pricing?.price_details === undefined ? undefined : stripeId(line.pricing.price_details.price);
  const paidAt = allocation?.status_transitions.paid_at ?? undefined;
  if (
    line === undefined ||
    allocation === undefined ||
    line.currency !== 'usd' ||
    line.quantity !== 1 ||
    line.amount !== principalMinor ||
    line.subtotal !== principalMinor ||
    !isStripeTimestamp(line.period.start) ||
    !isStripeTimestamp(line.period.end) ||
    line.period.start >= line.period.end ||
    details === null ||
    details === undefined ||
    details.proration ||
    details.subscription !== input.subscriptionId ||
    priceId !== input.offer.stripePriceId ||
    allocation.status !== 'paid' ||
    allocation.currency !== 'usd' ||
    allocation.amount_paid !== grossMinor ||
    !isStripeTimestamp(paidAt) ||
    allocation.payment.type !== 'payment_intent' ||
    stripeId(allocation.payment.payment_intent ?? null) !== input.payment.paymentIntent.id
  ) {
    return { status: 'unsupported', reason: 'invoice_line_or_payment_mismatch' };
  }
  const intent = input.payment.paymentIntent;
  const charge = input.payment.latestCharge;
  const subscriptionItem = remoteSubscription.items.data.find((item) => item.id === details.subscription_item);
  if (
    subscriptionItem === undefined ||
    stripeId(subscriptionItem.price) !== input.offer.stripePriceId ||
    intent.livemode !== input.offer.livemode ||
    intent.status !== 'succeeded' ||
    intent.currency !== 'usd' ||
    intent.amount !== grossMinor ||
    stripeId(intent.customer) !== input.customerId ||
    intent.amount_received !== grossMinor ||
    charge === undefined ||
    charge.livemode !== input.offer.livemode ||
    charge.status !== 'succeeded' ||
    !charge.paid ||
    charge.refunded ||
    charge.amount_refunded !== 0 ||
    stripeId(intent.latest_charge) !== charge.id ||
    stripeId(charge.payment_intent) !== intent.id ||
    stripeId(charge.customer) !== input.customerId ||
    stripeId(intent.payment_method) !== stripeId(charge.payment_method) ||
    charge.currency !== 'usd' ||
    charge.amount !== grossMinor ||
    charge.amount_captured !== grossMinor
  ) {
    return { status: 'unsupported', reason: 'invoice_cash_settlement_mismatch' };
  }
  const methodId = typeof charge.payment_method === 'string' ? charge.payment_method : undefined;
  const card = charge.payment_method_details?.card;
  const paymentMethod =
    methodId === undefined || typeof card?.brand !== 'string' || typeof card.last4 !== 'string'
      ? null
      : { id: methodId, brand: card.brand, last4: card.last4 };
  return {
    status: 'verified',
    periodStart: new Date(line.period.start * 1000),
    periodEnd: new Date(line.period.end * 1000),
    evidence: paidPaymentEvidenceSchema.parse({
      version: 'stripe-paid-v1',
      stripeAccountId: input.offer.stripeAccountId,
      livemode: input.offer.livemode,
      customerId: input.customerId,
      currency: 'usd',
      principalMinor: input.offer.principalMinor,
      taxMinor: String(taxMinor),
      grossMinor: String(grossMinor),
      paymentIntentIds: [intent.id],
      chargeIds: [charge.id],
      invoiceId: invoice.id,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: details.subscription_item,
      sourceDigest: paymentDigest(intent, charge),
      paidAt: new Date(paidAt * 1000).toISOString(),
      paymentMethod,
    }),
  };
}

function isStripeTimestamp(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

// oxlint-disable-next-line typescript/no-restricted-types -- Stripe SDK uses null for an absent expanded resource
function stripeId(value: string | { readonly id: string } | null): string | undefined {
  return typeof value === 'string' ? value : value?.id;
}

function paymentDigest(paymentIntent: Stripe.PaymentIntent, charge: Stripe.Charge): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        amount: paymentIntent.amount,
        amountCaptured: charge.amount_captured,
        amountReceived: paymentIntent.amount_received,
        chargeId: charge.id,
        currency: paymentIntent.currency,
        customerId: stripeId(paymentIntent.customer),
        paymentIntentId: paymentIntent.id,
        paymentMethodId: stripeId(paymentIntent.payment_method),
        status: paymentIntent.status,
      }),
    )
    .digest('hex');
}
/* oxlint-enable typescript/no-unnecessary-condition, typescript/prefer-optional-chain -- end explicit Stripe evidence guards */
