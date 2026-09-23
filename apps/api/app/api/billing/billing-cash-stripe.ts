/* eslint-disable @typescript-eslint/naming-convention -- Stripe request fields use provider wire names. */
import type { Stripe } from 'stripe';

const maximumPageSize = 100;
const metadataKeys = new Set(['tau_refund_intent_id', 'tau_reversal_case_id']);

export type StripeCashPage<T> = {
  readonly data: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
};

export type StripeCashPageRequest = {
  readonly created: { readonly gte: number; readonly lt: number };
  readonly startingAfter?: string;
};

export async function createStripeRefundOnce(
  stripe: { readonly refunds: Pick<Stripe['refunds'], 'create'> },
  input: {
    readonly chargeId: string;
    readonly amountMinor: bigint;
    readonly reason: 'requested_by_customer';
    readonly metadata: Readonly<Record<string, string>>;
    readonly idempotencyKey: string;
  },
): Promise<Stripe.Refund> {
  assertId(input.chargeId, 'Charge');
  assertId(input.idempotencyKey, 'idempotency key');
  const amount = safePositiveInteger(input.amountMinor, 'refund amount');
  assertMetadata(input.metadata);
  return stripe.refunds.create(
    { charge: input.chargeId, amount, reason: input.reason, metadata: input.metadata },
    { idempotencyKey: input.idempotencyKey },
  );
}

export async function retrieveStripeRefund(
  stripe: { readonly refunds: Pick<Stripe['refunds'], 'retrieve'> },
  refundId: string,
): Promise<Stripe.Refund> {
  assertId(refundId, 'Refund');
  return stripe.refunds.retrieve(refundId);
}

export async function retrieveStripeDispute(
  stripe: { readonly disputes: Pick<Stripe['disputes'], 'retrieve'> },
  disputeId: string,
): Promise<Stripe.Dispute> {
  assertId(disputeId, 'Dispute');
  return stripe.disputes.retrieve(disputeId);
}

export async function retrieveStripePaymentIntent(
  stripe: { readonly paymentIntents: Pick<Stripe['paymentIntents'], 'retrieve'> },
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent> {
  assertId(paymentIntentId, 'PaymentIntent');
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

export async function retrieveStripeCustomer(
  stripe: { readonly customers: Pick<Stripe['customers'], 'retrieve'> },
  customerId: string,
): Promise<Stripe.Customer | Stripe.DeletedCustomer> {
  assertId(customerId, 'Customer');
  return stripe.customers.retrieve(customerId);
}

export async function retrieveStripeCharge(
  stripe: { readonly charges: Pick<Stripe['charges'], 'retrieve'> },
  chargeId: string,
): Promise<Stripe.Charge> {
  assertId(chargeId, 'Charge');
  return stripe.charges.retrieve(chargeId);
}

export async function listStripeDisputePage(
  stripe: { readonly disputes: Pick<Stripe['disputes'], 'list'> },
  request: StripeCashPageRequest & { readonly chargeId: string },
): Promise<StripeCashPage<Stripe.Dispute>> {
  assertPageRequest(request);
  assertId(request.chargeId, 'Charge');
  return normalizePage(
    await stripe.disputes.list({
      created: request.created,
      limit: maximumPageSize,
      starting_after: request.startingAfter,
      charge: request.chargeId,
    }),
    request.startingAfter,
  );
}

export async function listStripeBalancePage(
  stripe: { readonly balanceTransactions: Pick<Stripe['balanceTransactions'], 'list'> },
  request: StripeCashPageRequest,
): Promise<StripeCashPage<Stripe.BalanceTransaction>> {
  assertPageRequest(request);
  return normalizePage(
    await stripe.balanceTransactions.list({
      created: request.created,
      limit: maximumPageSize,
      starting_after: request.startingAfter,
    }),
    request.startingAfter,
  );
}

export async function listStripePaymentIntentPage(
  stripe: { readonly paymentIntents: Pick<Stripe['paymentIntents'], 'list'> },
  request: StripeCashPageRequest,
): Promise<StripeCashPage<Stripe.PaymentIntent>> {
  assertPageRequest(request);
  return normalizePage(
    await stripe.paymentIntents.list({
      created: request.created,
      limit: maximumPageSize,
      starting_after: request.startingAfter,
    }),
    request.startingAfter,
  );
}

export async function listStripeChargePage(
  stripe: { readonly charges: Pick<Stripe['charges'], 'list'> },
  request: StripeCashPageRequest,
): Promise<StripeCashPage<Stripe.Charge>> {
  assertPageRequest(request);
  return normalizePage(
    await stripe.charges.list({
      created: request.created,
      limit: maximumPageSize,
      starting_after: request.startingAfter,
    }),
    request.startingAfter,
  );
}

export async function listStripeRefundPage(
  stripe: { readonly refunds: Pick<Stripe['refunds'], 'list'> },
  request: StripeCashPageRequest & { readonly chargeId?: string; readonly paymentIntentId?: string },
): Promise<StripeCashPage<Stripe.Refund>> {
  assertPageRequest(request);
  if (request.chargeId !== undefined && request.paymentIntentId !== undefined) {
    throw new Error('Refund page accepts one source filter');
  }
  if (request.chargeId !== undefined) {
    assertId(request.chargeId, 'Charge');
  }
  if (request.paymentIntentId !== undefined) {
    assertId(request.paymentIntentId, 'PaymentIntent');
  }
  return normalizePage(
    await stripe.refunds.list({
      created: request.created,
      limit: maximumPageSize,
      starting_after: request.startingAfter,
      charge: request.chargeId,
      payment_intent: request.paymentIntentId,
    }),
    request.startingAfter,
  );
}

function normalizePage<T extends { id: string }>(
  page: Stripe.ApiList<T>,
  startingAfter: string | undefined,
): StripeCashPage<T> {
  const last = page.data.at(-1);
  if (page.has_more && (last === undefined || last.id === startingAfter)) {
    throw new Error('Stripe cash pagination made no progress');
  }
  return { data: page.data, hasMore: page.has_more, ...(last === undefined ? {} : { nextCursor: last.id }) };
}

function assertPageRequest(request: StripeCashPageRequest): void {
  if (
    !Number.isSafeInteger(request.created.gte) ||
    !Number.isSafeInteger(request.created.lt) ||
    request.created.gte < 0 ||
    request.created.gte >= request.created.lt
  ) {
    throw new Error('Invalid Stripe cash page bounds');
  }
  if (request.startingAfter !== undefined) {
    assertId(request.startingAfter, 'Stripe cursor');
  }
}

function assertMetadata(metadata: Readonly<Record<string, string>>): void {
  const entries = Object.entries(metadata);
  if (
    entries.length !== metadataKeys.size ||
    entries.some(([key, value]) => !metadataKeys.has(key) || value.length === 0 || value.length > 200)
  ) {
    throw new Error('Invalid refund metadata');
  }
}

function assertId(value: string, label: string): void {
  if (value.length === 0 || value.length > 255) {
    throw new Error(`Invalid ${label}`);
  }
}

function safePositiveInteger(value: bigint, label: string): number {
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Invalid ${label}`);
  }
  return Number(value);
}
