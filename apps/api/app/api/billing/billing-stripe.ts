import { createHash } from 'node:crypto';
import StripeClient from 'stripe';
import type { Stripe } from 'stripe';
import { z } from 'zod';
import { topupPrincipalBoundsMinor } from '@taucad/billing';

export const stripeApiVersion = '2026-07-29.dahlia';
const maximumWebhookBytes = 1024 * 1024;
const loopbackClients = new WeakSet<Stripe>();

export const stripeEventTypes = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.created',
  'payment_intent.processing',
  'payment_intent.requires_action',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'payment_intent.amount_capturable_updated',
  'payment_intent.partially_funded',
  'invoice.created',
  'invoice.finalized',
  'invoice.finalization_failed',
  'invoice.updated',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.payment_attempt_required',
  'invoice.overpaid',
  'invoice.marked_uncollectible',
  'invoice.voided',
  'invoice_payment.paid',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'charge.refunded',
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
] as const;

export type StripeBillingEventType = (typeof stripeEventTypes)[number];

export type StripeCreateLeg =
  | { readonly kind: 'customer'; readonly idempotencyKey: string; readonly request: Stripe.CustomerCreateParams }
  | {
      readonly kind: 'checkout';
      readonly idempotencyKey: string;
      readonly request: Stripe.Checkout.SessionCreateParams;
      readonly checkoutContract:
        | { readonly kind: 'top_up'; readonly productId: string; readonly principalMinor: number }
        | { readonly kind: 'subscription'; readonly priceId: string };
      readonly onSessionSaveConsent?: true;
    }
  | {
      readonly kind: 'payment_intent';
      readonly idempotencyKey: string;
      readonly request: Stripe.PaymentIntentCreateParams;
      readonly onSessionSaveConsent?: true;
      readonly automaticReload?: true;
    }
  | {
      readonly kind: 'portal';
      readonly idempotencyKey: string;
      readonly request: Stripe.BillingPortal.SessionCreateParams;
    };

export type StripeCreateResult =
  | { readonly kind: 'customer'; readonly object: Stripe.Customer }
  | { readonly kind: 'checkout'; readonly object: Stripe.Checkout.Session }
  | { readonly kind: 'payment_intent'; readonly object: Stripe.PaymentIntent }
  | { readonly kind: 'portal'; readonly object: Stripe.BillingPortal.Session };

export type StripeRecoveryQuery =
  | {
      readonly kind: 'customer';
      readonly providerObjectId?: string;
      readonly metadataKey: string;
      readonly metadataValue: string;
    }
  | {
      readonly kind: 'checkout';
      readonly providerObjectId?: string;
      readonly clientReferenceId: string;
      /** Scopes the listing to the owning Customer, so another account's sessions never crowd it out. */
      readonly customerId?: string;
    }
  | {
      readonly kind: 'payment_intent';
      readonly providerObjectId?: string;
      readonly metadataKey: string;
      readonly metadataValue: string;
    }
  | { readonly kind: 'portal'; readonly providerObjectId?: string };

export type StripeRecoveryResult =
  | { readonly status: 'known'; readonly object: StripeCreateResult }
  | { readonly status: 'unknown' }
  | { readonly status: 'ambiguous' };

export type StripeInvoiceEvidence = {
  readonly invoice: Stripe.Invoice;
  readonly lines: readonly Stripe.InvoiceLineItem[];
  readonly payments: readonly Stripe.InvoicePayment[];
  readonly complete: boolean;
};

export type StripeCheckoutSource = {
  readonly session: Stripe.Checkout.Session;
  readonly lines: readonly Stripe.LineItem[];
  readonly complete: boolean;
};

export type StripePaymentEvidence = {
  readonly paymentIntent: Stripe.PaymentIntent;
  readonly latestCharge: Stripe.Charge | undefined;
};

export type StripeSetupEvidence = {
  readonly session: Stripe.Checkout.Session;
  readonly setupIntent: Stripe.SetupIntent;
  readonly paymentMethod: Stripe.PaymentMethod;
};

export type StripeTaxCalculationEvidence = {
  readonly calculation: Stripe.Tax.Calculation;
  readonly lines: readonly Stripe.Tax.CalculationLineItem[];
  readonly complete: boolean;
};

export type StripeTaxTransactionEvidence = {
  readonly transaction: Stripe.Tax.Transaction;
  readonly lines: readonly Stripe.Tax.TransactionLineItem[];
  readonly complete: boolean;
};

export type CompactStripeEvent = {
  readonly id: string;
  readonly type: StripeBillingEventType;
  readonly created: number;
  readonly apiVersion: typeof stripeApiVersion;
  readonly livemode: boolean;
  readonly account?: undefined;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly payloadDigest: string;
  readonly evidence: Readonly<Record<string, unknown>>;
};

/* eslint-disable @typescript-eslint/naming-convention -- Stripe request schemas preserve provider wire field names. */
const metadataSchema = z.record(z.string(), z.string());
const idempotencyKeySchema = z.string().min(1).max(255);
const checkoutContractSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('top_up'),
      productId: z.string().min(1),
      principalMinor: z.number().int().min(topupPrincipalBoundsMinor.minimum).max(topupPrincipalBoundsMinor.maximum),
    })
    .strict(),
  z.object({ kind: z.literal('subscription'), priceId: z.string().min(1) }).strict(),
]);
const checkoutRequestSchema = z
  .object({
    mode: z.enum(['payment', 'subscription']),
    customer: z.string().min(1),
    client_reference_id: z.string().min(1),
    success_url: z.url(),
    cancel_url: z.url(),
    line_items: z
      .array(
        z.union([
          z.object({ price: z.string().min(1), quantity: z.literal(1) }).strict(),
          z
            .object({
              price_data: z
                .object({
                  currency: z.literal('usd'),
                  product: z.string().min(1),
                  tax_behavior: z.literal('exclusive'),
                  unit_amount: z
                    .number()
                    .int()
                    .min(topupPrincipalBoundsMinor.minimum)
                    .max(topupPrincipalBoundsMinor.maximum),
                })
                .strict(),
              quantity: z.literal(1),
            })
            .strict(),
        ]),
      )
      .length(1),
    metadata: metadataSchema.optional(),
    automatic_tax: z.object({ enabled: z.literal(true) }).strict(),
    billing_address_collection: z.literal('required'),
    customer_update: z.object({ address: z.literal('auto'), name: z.literal('auto') }).strict(),
    tax_id_collection: z.object({ enabled: z.literal(true) }).strict(),
    payment_method_types: z.array(z.literal('card')).length(1).optional(),
    payment_intent_data: z
      .object({ metadata: metadataSchema.optional(), setup_future_usage: z.literal('on_session').optional() })
      .strict()
      .optional(),
    subscription_data: z.object({ metadata: metadataSchema.optional() }).strict().optional(),
  })
  .strict();

/** Parses persisted JSON into the closed create-leg contract before any dispatch. */
export function parseStripeCreateLeg(input: unknown): StripeCreateLeg {
  const envelope = z.looseObject({ kind: z.enum(['customer', 'checkout', 'payment_intent', 'portal']) }).parse(input);
  switch (envelope.kind) {
    case 'customer': {
      return z
        .object({
          kind: z.literal('customer'),
          idempotencyKey: idempotencyKeySchema,
          request: z.object({ metadata: metadataSchema.optional() }).strict(),
        })
        .strict()
        .parse(input);
    }
    case 'checkout': {
      return z
        .object({
          kind: z.literal('checkout'),
          idempotencyKey: idempotencyKeySchema,
          request: checkoutRequestSchema,
          checkoutContract: checkoutContractSchema,
          onSessionSaveConsent: z.literal(true).optional(),
        })
        .strict()
        .parse(input);
    }
    case 'payment_intent': {
      return z
        .object({
          kind: z.literal('payment_intent'),
          idempotencyKey: idempotencyKeySchema,
          onSessionSaveConsent: z.literal(true).optional(),
          automaticReload: z.literal(true).optional(),
          request: z
            .object({
              amount: z.number().int().positive(),
              currency: z.literal('usd'),
              customer: z.string().min(1),
              payment_method: z.string().min(1),
              // Persisted with the request so the stored leg is exactly what was dispatched.
              payment_method_types: z.tuple([z.literal('card')]).optional(),
              confirm: z.literal(true),
              capture_method: z.literal('automatic').optional(),
              setup_future_usage: z.literal('on_session').optional(),
              off_session: z.literal(true).optional(),
              metadata: metadataSchema.optional(),
              return_url: z.url().optional(),
            })
            .strict(),
        })
        .strict()
        .parse(input);
    }
    case 'portal': {
      return z
        .object({
          kind: z.literal('portal'),
          idempotencyKey: idempotencyKeySchema,
          request: z
            .object({
              customer: z.string().min(1),
              configuration: z.string().min(1).optional(),
              return_url: z.url().optional(),
            })
            .strict(),
        })
        .strict()
        .parse(input);
    }
  }
}
/* eslint-enable @typescript-eslint/naming-convention -- End Stripe provider wire schemas. */

/** Creates the one direct-account Stripe client used by billing transport helpers. */
export function createBillingStripeClient(input: {
  readonly secretKey: string;
  /** Milliseconds. */
  readonly requestTimeout?: number;
  readonly fixtureUrl?: string;
}): Stripe {
  const requestTimeout = input.requestTimeout ?? 5000;
  const transport = StripeClient.createFetchHttpClient(async (url, init) => {
    const abort = new AbortController();
    const upstream = init?.signal;
    const abortFromUpstream = () => {
      abort.abort(upstream?.reason);
    };
    upstream?.addEventListener('abort', abortFromUpstream, { once: true });
    const timer = setTimeout(() => {
      abort.abort(new Error('Stripe request deadline exceeded'));
    }, requestTimeout);
    const cleanup = () => {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', abortFromUpstream);
    };
    try {
      const response = await fetch(url, { ...init, signal: abort.signal });
      if (response.body === null) {
        cleanup();
        return response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull: async (controller) => {
          try {
            const result = await reader.read();
            if (result.done) {
              cleanup();
              controller.close();
            } else {
              controller.enqueue(result.value);
            }
          } catch (error) {
            cleanup();
            controller.error(error);
          }
        },
        cancel: async (reason) => {
          cleanup();
          abort.abort(reason);
          await reader.cancel(reason);
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      cleanup();
      throw error;
    }
  });
  const config: Stripe.StripeConfig = {
    apiVersion: stripeApiVersion,
    httpClient: {
      getClientName: () => transport.getClientName(),
      makeRequest: async (...arguments_: Parameters<typeof transport.makeRequest>) => {
        try {
          return await transport.makeRequest(...arguments_);
        } catch (error) {
          // Stripe retries CONNECTION_CLOSED once before consulting maxNetworkRetries; reclassification retains the
          // cause while keeping every persisted billing leg to its authorized single transport attempt.
          throw new Error('Stripe transport failed before a qualified response', { cause: error });
        }
      },
    },
    maxNetworkRetries: 0,
    timeout: requestTimeout,
  };
  if (input.fixtureUrl !== undefined) {
    const url = new URL(input.fixtureUrl);
    if (
      (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '::1') ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      throw new Error('Stripe fixture URL must be a loopback origin');
    }
    config.host = url.hostname;
    config.port = Number(url.port);
    config.protocol = url.protocol === 'https:' ? 'https' : 'http';
  }
  const stripe = new StripeClient(input.secretKey, config);
  if (input.fixtureUrl !== undefined) {
    loopbackClients.add(stripe);
  }
  return stripe;
}

/** Reports whether this exact client was constructed for a validated loopback fixture origin. */
export function isLoopbackBillingStripeClient(stripe: Stripe): boolean {
  return loopbackClients.has(stripe);
}

/** Dispatches an already-persisted immutable provider leg exactly once. */
export async function dispatchStripeLegOnce(stripe: Stripe, leg: StripeCreateLeg): Promise<StripeCreateResult> {
  assertIdempotencyKey(leg.idempotencyKey);
  assertClosedCreateRequest(leg);
  const options = { idempotencyKey: leg.idempotencyKey };
  switch (leg.kind) {
    case 'customer': {
      return { kind: leg.kind, object: await stripe.customers.create(leg.request, options) };
    }
    case 'checkout': {
      return { kind: leg.kind, object: await stripe.checkout.sessions.create(leg.request, options) };
    }
    case 'payment_intent': {
      assertPaymentIntentRequest(leg.request, leg.onSessionSaveConsent === true, leg.automaticReload === true);
      return {
        kind: leg.kind,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe owns this request field name.
        object: await stripe.paymentIntents.create({ ...leg.request, payment_method_types: ['card'] }, options),
      };
    }
    case 'portal': {
      return { kind: leg.kind, object: await stripe.billingPortal.sessions.create(leg.request, options) };
    }
  }
}

/** Retrieves a known object or performs one bounded correlation lookup. */
export async function recoverStripeLegSource(
  stripe: Stripe,
  query: StripeRecoveryQuery,
): Promise<StripeRecoveryResult> {
  if (query.providerObjectId !== undefined) {
    return { status: 'known', object: await retrieveKnown(stripe, query.kind, query.providerObjectId) };
  }
  if (query.kind === 'portal') {
    return { status: 'unknown' };
  }
  if (query.kind === 'customer') {
    const result = await stripe.customers.search({
      query: metadataQuery(query.metadataKey, query.metadataValue),
      limit: 2,
    });
    return selectRecovery(result.data, (object) => ({ kind: query.kind, object }));
  }
  if (query.kind === 'payment_intent') {
    const result = await stripe.paymentIntents.search({
      query: metadataQuery(query.metadataKey, query.metadataValue),
      limit: 2,
    });
    return selectRecovery(result.data, (object) => ({ kind: query.kind, object }));
  }
  const result = await stripe.checkout.sessions.list({
    limit: 100,
    ...(query.customerId === undefined ? {} : { customer: query.customerId }),
  });
  const matches = result.data.filter((session) => session.client_reference_id === query.clientReferenceId);
  if (result.has_more && matches.length <= 1) {
    return { status: 'ambiguous' };
  }
  return selectRecovery(matches, (object) => ({ kind: query.kind, object }));
}

/** Sends one persisted PaymentIntent cancellation request. Qualification follows retrieval. */
export async function cancelStripePaymentIntent(
  stripe: Stripe,
  input: { readonly paymentIntentId: string; readonly idempotencyKey: string },
): Promise<Stripe.PaymentIntent> {
  assertIdempotencyKey(input.idempotencyKey);
  return stripe.paymentIntents.cancel(input.paymentIntentId, {}, { idempotencyKey: input.idempotencyKey });
}

/** Cancels one already-persisted owned subscription cancellation leg. */
export async function cancelStripeSubscription(
  stripe: Stripe,
  input: { readonly stripeSubscriptionId: string; readonly idempotencyKey: string },
): Promise<Stripe.Subscription> {
  assertIdempotencyKey(input.idempotencyKey);
  if (input.stripeSubscriptionId.length === 0) {
    throw new Error('Stripe subscription identity is required');
  }
  return stripe.subscriptions.cancel(input.stripeSubscriptionId, {}, { idempotencyKey: input.idempotencyKey });
}

/* eslint-disable @typescript-eslint/naming-convention -- Stripe schedule fields preserve provider wire names. */
/** Creates one schedule wrapper for an existing owned subscription. */
export async function createStripeSubscriptionScheduleOnce(
  stripe: Stripe,
  input: { readonly subscriptionId: string; readonly idempotencyKey: string },
): Promise<Stripe.SubscriptionSchedule> {
  assertIdempotencyKey(input.idempotencyKey);
  return stripe.subscriptionSchedules.create(
    { from_subscription: input.subscriptionId },
    { idempotencyKey: input.idempotencyKey },
  );
}

/** Persists exact current and disclosed future monthly phases on an owned schedule. */
export async function updateStripeSubscriptionScheduleOnce(
  stripe: Stripe,
  input: {
    readonly scheduleId: string;
    readonly subscriptionOfferId: string;
    readonly currentStart: number;
    readonly effectivePeriodStart: number;
    readonly currentPriceId: string;
    readonly futurePriceId: string;
    readonly sourceSchedule: Stripe.SubscriptionSchedule;
    readonly idempotencyKey: string;
  },
): Promise<Stripe.SubscriptionSchedule> {
  assertIdempotencyKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.currentStart) ||
    !Number.isSafeInteger(input.effectivePeriodStart) ||
    input.currentStart >= input.effectivePeriodStart
  ) {
    throw new Error('Invalid subscription schedule boundary');
  }
  const { phases } = input.sourceSchedule;
  const current = phases.length === 1 ? phases[0] : undefined;
  const currentItem = current?.items.length === 1 ? current.items[0] : undefined;
  if (
    current === undefined ||
    currentItem === undefined ||
    current.start_date !== input.currentStart ||
    currentItem.price !== input.currentPriceId ||
    currentItem.quantity !== 1 ||
    current.add_invoice_items.length > 0 ||
    current.application_fee_percent !== null ||
    current.billing_thresholds !== null ||
    (current.default_tax_rates?.length ?? 0) !== 0 ||
    current.discounts.length > 0 ||
    current.invoice_settings !== null ||
    current.on_behalf_of !== null ||
    current.transfer_data !== null ||
    current.trial === true ||
    current.trial_end !== null
  ) {
    throw new Error('Unsupported subscription schedule phase settings');
  }
  return stripe.subscriptionSchedules.update(
    input.scheduleId,
    {
      end_behavior: 'release',
      metadata: { tau_subscription_offer_id: input.subscriptionOfferId },
      proration_behavior: 'none',
      phases: [
        {
          start_date: input.currentStart,
          end_date: input.effectivePeriodStart,
          items: [{ price: input.currentPriceId, quantity: 1 }],
          collection_method: current.collection_method ?? undefined,
          currency: current.currency,
          default_payment_method:
            typeof current.default_payment_method === 'string' ? current.default_payment_method : undefined,
          description: current.description ?? undefined,
          metadata: current.metadata ?? undefined,
          billing_cycle_anchor: current.billing_cycle_anchor ?? undefined,
          proration_behavior: 'none',
        },
        {
          start_date: input.effectivePeriodStart,
          duration: { interval: 'month', interval_count: 1 },
          items: [{ price: input.futurePriceId, quantity: 1 }],
          proration_behavior: 'none',
        },
      ],
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

/** Retrieves the complete schedule object used to qualify future renewal terms. */
export async function retrieveStripeSubscriptionSchedule(
  stripe: Stripe,
  scheduleId: string,
): Promise<Stripe.SubscriptionSchedule> {
  return stripe.subscriptionSchedules.retrieve(scheduleId);
}
/* eslint-enable @typescript-eslint/naming-convention -- Stripe schedule request block ends here. */

/* eslint-disable @typescript-eslint/naming-convention -- Stripe request fields preserve provider wire names. */
/** Creates one card-only hosted SetupIntent flow from a persisted consent leg. */
export async function createStripeSetupCheckoutOnce(
  stripe: Stripe,
  input: {
    readonly idempotencyKey: string;
    readonly customerId: string;
    readonly consentId: string;
    readonly consentVersion: number;
    readonly providerLegId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
  },
): Promise<Stripe.Checkout.Session> {
  assertIdempotencyKey(input.idempotencyKey);
  if (!Number.isSafeInteger(input.consentVersion) || input.consentVersion < 1) {
    throw new Error('Invalid reload consent version');
  }
  const metadata = {
    tau_reload_consent_id: input.consentId,
    tau_reload_consent_version: String(input.consentVersion),
    tau_provider_leg_id: input.providerLegId,
  };
  assertMetadata(metadata);
  return stripe.checkout.sessions.create(
    {
      mode: 'setup',
      customer: input.customerId,
      client_reference_id: input.consentId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      payment_method_types: ['card'],
      metadata,
      setup_intent_data: { metadata },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

/** Retrieves the full Session→SetupIntent→PaymentMethod chain for consent qualification. */
export async function retrieveStripeSetupEvidence(stripe: Stripe, sessionId: string): Promise<StripeSetupEvidence> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const setupIntentId = stripeExpandableId(session.setup_intent);
  if (setupIntentId === undefined) {
    throw new Error('Stripe setup Session has no SetupIntent');
  }
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = stripeExpandableId(setupIntent.payment_method);
  if (paymentMethodId === undefined) {
    throw new Error('Stripe SetupIntent has no PaymentMethod');
  }
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  return { session, setupIntent, paymentMethod };
}

/** Retrieves one non-deleted Customer for owned billing-address qualification. */
export async function retrieveStripeBillingCustomer(stripe: Stripe, customerId: string): Promise<Stripe.Customer> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    throw new Error('Stripe billing Customer was deleted');
  }
  return customer;
}

/** Creates one exact Customer-based Stripe Tax calculation for a saved-card quote. */
export async function createStripeReloadTaxCalculationOnce(
  stripe: Stripe,
  input: {
    readonly idempotencyKey: string;
    readonly customerId: string;
    readonly productId: string;
    readonly reference: string;
    readonly principalMinor: number;
  },
): Promise<Stripe.Tax.Calculation> {
  assertIdempotencyKey(input.idempotencyKey);
  if (
    !Number.isSafeInteger(input.principalMinor) ||
    input.principalMinor < topupPrincipalBoundsMinor.minimum ||
    input.principalMinor > topupPrincipalBoundsMinor.maximum
  ) {
    throw new Error('Tax calculation principal must be within the supported USD top-up bounds');
  }
  if (input.customerId.length === 0 || input.productId.length === 0 || input.reference.length === 0) {
    throw new Error('Reload tax calculation identity is incomplete');
  }
  return stripe.tax.calculations.create(
    {
      currency: 'usd',
      customer: input.customerId,
      line_items: [
        {
          amount: input.principalMinor,
          product: input.productId,
          quantity: 1,
          reference: input.reference,
          tax_behavior: 'exclusive',
        },
      ],
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

/** Commits a standalone Tax Transaction only after its owned PaymentIntent is paid. */
export async function createStripeTaxTransactionOnce(
  stripe: Stripe,
  input: {
    readonly calculationId: string;
    readonly reference: string;
    readonly postedAt: number;
    readonly idempotencyKey: string;
  },
): Promise<Stripe.Tax.Transaction> {
  assertIdempotencyKey(input.idempotencyKey);
  if (input.calculationId.length === 0 || input.reference.length === 0 || !Number.isSafeInteger(input.postedAt)) {
    throw new Error('Tax Transaction identity is incomplete');
  }
  return stripe.tax.transactions.createFromCalculation(
    { calculation: input.calculationId, reference: input.reference, posted_at: input.postedAt },
    { idempotencyKey: input.idempotencyKey },
  );
}

/** Retrieves a Tax Transaction and every bounded line page. */
export async function fetchStripeTaxTransactionEvidence(
  stripe: Stripe,
  input: { readonly transactionId: string; readonly maximumLinePages: number },
): Promise<StripeTaxTransactionEvidence> {
  assertPageBound(input.maximumLinePages);
  const transaction = await stripe.tax.transactions.retrieve(input.transactionId);
  const lines = await collectPages(
    (startingAfter) =>
      stripe.tax.transactions.listLineItems(input.transactionId, {
        limit: 100,
        ...(startingAfter === undefined ? {} : { starting_after: startingAfter }),
      }),
    input.maximumLinePages,
  );
  return { transaction, lines: lines.data, complete: lines.complete };
}

/** Retrieves all bounded line pages for a Stripe Tax calculation. */
export async function fetchStripeTaxCalculationEvidence(
  stripe: Stripe,
  input: { readonly calculationId: string; readonly maximumLinePages: number },
): Promise<StripeTaxCalculationEvidence> {
  assertPageBound(input.maximumLinePages);
  const calculation = await stripe.tax.calculations.retrieve(input.calculationId);
  const lines = await collectPages(
    (startingAfter) =>
      stripe.tax.calculations.listLineItems(input.calculationId, {
        limit: 100,
        ...(startingAfter === undefined ? {} : { starting_after: startingAfter }),
      }),
    input.maximumLinePages,
  );
  return { calculation, lines: lines.data, complete: lines.complete };
}

/** Expires one persisted hosted recovery Session; callers retrieve it before releasing capacity. */
export async function expireStripeCheckoutSession(
  stripe: Stripe,
  input: { readonly sessionId: string; readonly idempotencyKey: string },
): Promise<Stripe.Checkout.Session> {
  assertIdempotencyKey(input.idempotencyKey);
  return stripe.checkout.sessions.expire(input.sessionId, {}, { idempotencyKey: input.idempotencyKey });
}
/* eslint-enable @typescript-eslint/naming-convention -- Stripe request field block ends here. */

/* eslint-disable @typescript-eslint/naming-convention -- Stripe pagination fields preserve provider wire names. */
/** Retrieves all bounded invoice line and payment pages without returning partial evidence as complete. */
export async function fetchStripeInvoiceEvidence(
  stripe: Stripe,
  input: { readonly invoiceId: string; readonly maximumLinePages: number; readonly maximumPaymentPages: number },
): Promise<StripeInvoiceEvidence> {
  assertPageBound(input.maximumLinePages);
  assertPageBound(input.maximumPaymentPages);
  const invoice = await stripe.invoices.retrieve(input.invoiceId);
  const lines = await collectPages(
    (startingAfter) =>
      stripe.invoices.listLineItems(input.invoiceId, {
        limit: 100,
        ...(startingAfter === undefined ? {} : { starting_after: startingAfter }),
      }),
    input.maximumLinePages,
  );
  const payments = await collectPages(
    (startingAfter) =>
      stripe.invoicePayments.list({
        invoice: input.invoiceId,
        limit: 100,
        ...(startingAfter === undefined ? {} : { starting_after: startingAfter }),
      }),
    input.maximumPaymentPages,
  );
  return { invoice, lines: lines.data, payments: payments.data, complete: lines.complete && payments.complete };
}

/** Retrieves a Checkout Session and all bounded line-item pages. */
export async function fetchStripeCheckoutSource(
  stripe: Stripe,
  input: { readonly sessionId: string; readonly maximumLinePages: number },
): Promise<StripeCheckoutSource> {
  assertPageBound(input.maximumLinePages);
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  const lines = await collectPages(
    (startingAfter) =>
      stripe.checkout.sessions.listLineItems(input.sessionId, {
        limit: 100,
        ...(startingAfter === undefined ? {} : { starting_after: startingAfter }),
      }),
    input.maximumLinePages,
  );
  return { session, lines: lines.data, complete: lines.complete };
}
/* eslint-enable @typescript-eslint/naming-convention -- Stripe pagination field block ends here. */

/** Retrieves a PaymentIntent and its latest Charge, if Stripe reports one. */
export async function retrieveStripePaymentEvidence(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<StripePaymentEvidence> {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const latestChargeId =
    typeof paymentIntent.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;
  const latestCharge = latestChargeId === undefined ? undefined : await stripe.charges.retrieve(latestChargeId);
  return { paymentIntent, latestCharge };
}

/** Verifies and compacts one direct-account webhook event for durable inbox insertion. */
export function parseVerifiedStripeEvent(
  stripe: Stripe,
  input: {
    readonly rawBody: Uint8Array<ArrayBuffer>;
    readonly signature: string;
    readonly secret: string;
    readonly livemode: boolean;
  },
): CompactStripeEvent {
  if (input.rawBody.byteLength > maximumWebhookBytes) {
    throw new Error('Stripe webhook payload exceeds 1 MiB');
  }
  const event = stripe.webhooks.constructEvent(input.rawBody, input.signature, input.secret);
  if (
    event.api_version !== stripeApiVersion ||
    event.livemode !== input.livemode ||
    typeof event.account === 'string'
  ) {
    throw new Error('Stripe webhook scope mismatch');
  }
  if (!isBillingEventType(event.type)) {
    throw new Error('Unsupported Stripe event type');
  }
  const source = parseStripeEventSource(event.data.object);
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    apiVersion: stripeApiVersion,
    livemode: event.livemode,
    sourceType: source.object,
    sourceId: source.id,
    payloadDigest: createHash('sha256').update(input.rawBody).digest('hex'),
    // The inbox schedules a mandatory source fetch; webhook snapshots never qualify money.
    evidence: source,
  };
}

function assertPaymentIntentRequest(
  request: Stripe.PaymentIntentCreateParams,
  onSessionSaveConsent: boolean,
  automaticReload: boolean,
): void {
  if (
    !Number.isSafeInteger(request.amount) ||
    request.amount <= 0 ||
    !/^[a-z]{3}$/.test(request.currency) ||
    typeof request.customer !== 'string' ||
    typeof request.payment_method !== 'string' ||
    (request.capture_method !== undefined && request.capture_method !== 'automatic') ||
    request.confirm !== true ||
    (automaticReload
      ? request.off_session !== true || request.setup_future_usage !== undefined || onSessionSaveConsent
      : request.off_session !== undefined ||
        (request.setup_future_usage !== undefined &&
          (request.setup_future_usage !== 'on_session' || !onSessionSaveConsent)))
  ) {
    throw new Error('PaymentIntent must match its on-session or automatic reload contract');
  }
}

function assertClosedCreateRequest(leg: StripeCreateLeg): void {
  const allowed = new Set(
    leg.kind === 'customer'
      ? ['metadata']
      : leg.kind === 'payment_intent'
        ? [
            'amount',
            'capture_method',
            'confirm',
            'currency',
            'customer',
            'metadata',
            'off_session',
            'payment_method',
            'payment_method_types',
            'return_url',
            'setup_future_usage',
          ]
        : leg.kind === 'portal'
          ? ['configuration', 'customer', 'return_url']
          : [
              'automatic_tax',
              'billing_address_collection',
              'cancel_url',
              'client_reference_id',
              'customer_update',
              'customer',
              'line_items',
              'metadata',
              'mode',
              'payment_intent_data',
              'payment_method_types',
              'subscription_data',
              'success_url',
              'tax_id_collection',
            ],
  );
  for (const key of Object.keys(leg.request)) {
    if (!allowed.has(key)) {
      throw new Error(`Unsupported Stripe ${leg.kind} request field`);
    }
  }
  if ('metadata' in leg.request && leg.request.metadata !== undefined) {
    if (leg.request.metadata === null || typeof leg.request.metadata === 'string') {
      throw new Error('Invalid Stripe metadata');
    }
    assertMetadata(leg.request.metadata);
  }
  if (leg.kind === 'checkout') {
    assertCheckoutRequest(leg);
  }
}

function assertCheckoutRequest(leg: Extract<StripeCreateLeg, { readonly kind: 'checkout' }>): void {
  const { request } = leg;
  if (
    typeof request.customer !== 'string' ||
    typeof request.client_reference_id !== 'string' ||
    request.line_items?.length !== 1
  ) {
    throw new Error('Invalid Stripe Checkout request');
  }
  const item = request.line_items.at(0);
  if (item === undefined) {
    throw new Error('Invalid Stripe Checkout line item');
  }
  assertCheckoutLineItem(item, leg.checkoutContract);
  assertCheckoutNestedData(leg);
}

function assertCheckoutLineItem(
  item: Stripe.Checkout.SessionCreateParams.LineItem,
  contract: Extract<StripeCreateLeg, { readonly kind: 'checkout' }>['checkoutContract'],
): void {
  if (item.quantity !== 1) {
    throw new Error('Invalid Stripe Checkout line item');
  }
  if (contract.kind === 'subscription') {
    if (
      item.price !== contract.priceId ||
      item.price_data !== undefined ||
      Object.keys(item).some((key) => key !== 'price' && key !== 'quantity')
    ) {
      throw new Error('Invalid Stripe subscription Checkout line item');
    }
  } else {
    const { principalMinor, productId } = contract;
    const priceData = item.price_data;
    if (
      !Number.isSafeInteger(principalMinor) ||
      principalMinor < topupPrincipalBoundsMinor.minimum ||
      principalMinor > topupPrincipalBoundsMinor.maximum ||
      item.price !== undefined ||
      priceData?.currency !== 'usd' ||
      priceData.product !== productId ||
      priceData.tax_behavior !== 'exclusive' ||
      priceData.unit_amount !== principalMinor ||
      Object.keys(item).some((key) => key !== 'price_data' && key !== 'quantity') ||
      Object.keys(priceData).some(
        (key) => key !== 'currency' && key !== 'product' && key !== 'tax_behavior' && key !== 'unit_amount',
      )
    ) {
      throw new Error('Invalid Stripe top-up Checkout line item');
    }
  }
}

function assertCheckoutNestedData(leg: Extract<StripeCreateLeg, { readonly kind: 'checkout' }>): void {
  const { request } = leg;
  if (
    request.automatic_tax?.enabled !== true ||
    request.billing_address_collection !== 'required' ||
    request.customer_update?.address !== 'auto' ||
    request.customer_update.name !== 'auto' ||
    request.tax_id_collection?.enabled !== true
  ) {
    throw new Error('Stripe Checkout tax and customer evidence are required');
  }
  const paymentData = request.payment_intent_data;
  if (paymentData !== undefined) {
    if (
      Object.keys(paymentData).some((key) => key !== 'metadata' && key !== 'setup_future_usage') ||
      (paymentData.setup_future_usage !== undefined &&
        (paymentData.setup_future_usage !== 'on_session' || leg.onSessionSaveConsent !== true))
    ) {
      throw new Error('Unsupported Stripe Checkout payment data');
    }
    if (paymentData.metadata !== undefined) {
      assertMetadata(paymentData.metadata);
    }
  }
  const subscriptionData = request.subscription_data;
  if (subscriptionData !== undefined) {
    if (Object.keys(subscriptionData).some((key) => key !== 'metadata')) {
      throw new Error('Unsupported Stripe Checkout subscription data');
    }
    if (subscriptionData.metadata !== undefined) {
      assertMetadata(subscriptionData.metadata);
    }
  }
}

function assertMetadata(metadata: Stripe.MetadataParam): void {
  const allowed = new Set([
    'tau_account_id',
    'tau_customer_binding_id',
    'tau_payment_attempt_id',
    'tau_provider_leg_id',
    'tau_purchase_id',
    'tau_reload_consent_id',
    'tau_reload_consent_version',
    'tau_reload_work_generation',
    'tau_subscription_id',
    'tau_subscription_offer_id',
  ]);
  for (const key of Object.keys(metadata)) {
    if (!allowed.has(key)) {
      throw new Error('Unsupported Stripe metadata key');
    }
  }
}

// oxlint-disable-next-line typescript/no-restricted-types -- Stripe SDK expandable fields use null for absence.
function stripeExpandableId(value: string | { readonly id: string } | null): string | undefined {
  return typeof value === 'string' ? value : value?.id;
}

function assertIdempotencyKey(value: string): void {
  if (value.length === 0 || value.length > 255) {
    throw new Error('Invalid Stripe idempotency key');
  }
}

function assertPageBound(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error('Invalid Stripe pagination bound');
  }
}

function metadataQuery(key: string, value: string): string {
  if (!/^\w{1,40}$/.test(key) || value.length === 0 || value.length > 200 || value.includes("'")) {
    throw new Error('Invalid Stripe metadata correlation');
  }
  return `metadata['${key}']:'${value}'`;
}

async function retrieveKnown(
  stripe: Stripe,
  kind: StripeRecoveryQuery['kind'],
  id: string,
): Promise<StripeCreateResult> {
  switch (kind) {
    case 'customer': {
      const customer = await stripe.customers.retrieve(id);
      if (customer.deleted) {
        throw new Error('Stripe Customer was deleted');
      }
      return { kind, object: customer };
    }
    case 'checkout': {
      return { kind, object: await stripe.checkout.sessions.retrieve(id) };
    }
    case 'payment_intent': {
      return { kind, object: await stripe.paymentIntents.retrieve(id) };
    }
    case 'portal': {
      throw new Error('Stripe portal Sessions are not recoverable by ID');
    }
  }
}

async function collectPages<T extends { readonly id: string }>(
  fetchPage: (startingAfter?: string) => Promise<Stripe.ApiList<T>>,
  maximumPages: number,
): Promise<{ readonly data: readonly T[]; readonly complete: boolean }> {
  const data: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < maximumPages; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Stripe pagination cursors are sequential.
    const result = await fetchPage(startingAfter);
    data.push(...result.data);
    if (!result.has_more) {
      return { data, complete: true };
    }
    const last = result.data.at(-1);
    if (last === undefined) {
      throw new Error('Stripe pagination made no progress');
    }
    startingAfter = last.id;
  }
  return { data, complete: false };
}

function isBillingEventType(type: string): type is StripeBillingEventType {
  return (stripeEventTypes as readonly string[]).includes(type);
}

function selectRecovery<T>(matches: readonly T[], wrap: (object: T) => StripeCreateResult): StripeRecoveryResult {
  if (matches.length === 0) {
    return { status: 'unknown' };
  }
  if (matches.length !== 1) {
    return { status: 'ambiguous' };
  }
  const match = matches.at(0);
  if (match === undefined) {
    return { status: 'unknown' };
  }
  return { status: 'known', object: wrap(match) };
}

function parseStripeEventSource(value: unknown): { readonly id: string; readonly object: string } {
  return z
    .looseObject({ id: z.string().min(1), object: z.string().min(1) })
    .transform(({ id, object }) => ({ id, object }))
    .parse(value);
}
