/* oxlint-disable eslint/complexity -- The controlled HTTP fixture enumerates distinct provider endpoints. */
/* eslint-disable @typescript-eslint/naming-convention -- Controlled Stripe fixture bodies retain provider field names. */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@taucad/api-database/schema';
import { cashOccurredAt, cashProjectionDigest } from '#billing-payment-contract.js';
import type { CashProjectionEvidence } from '#billing-payment-contract.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '@taucad/api-database/schema/billing-payment.types';
import { BillingPolicyService } from '#billing-policy.service.js';
import { BillingCashService } from '#billing-cash.service.js';
import type { QualifiedCashSource } from '#billing-cash.service.js';
import { BillingTaxService } from '#billing-tax.service.js';
import {
  assertCollectionNotSpendBlocked,
  BillingCashReconciliationService,
} from '#billing-cash-reconciliation.service.js';
import { createBillingStripeClient } from '#billing-stripe.js';
import { CreditLedgerService } from '#credit-ledger.service.js';
import { seedPaidPurchase } from '#testing/billing-payment.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const ledger = new CreditLedgerService(
  { database: runtimeDatabase },
  new BillingPolicyService({ database: runtimeDatabase }),
);
const tax = new BillingTaxService({ database: runtimeDatabase });
let stripeOrigin = '';
const cashStripeAccountId = 'acct_cash_foundation';
let refundFixture:
  | {
      customerId: string;
      paymentIntentId: string;
      chargeId: string;
      refundId: string;
      intentId: string;
      reversalCaseId: string;
    }
  | undefined;
let serveRefund = false;
let refundStatus: 'succeeded' | 'failed' = 'succeeded';
/** Serves the refund as a dashboard refund: no Tau metadata. */
let externalRefund = false;
let refundCreated: number | undefined;
let serveDispute = false;
let disputeReturned = false;
let disputeCreated = 1;
let listCashSources = false;
let invalidBalance = false;
// Settlement currency of the balance transactions; a NZ account presenting in USD settles in NZD.
let settlementCurrency = 'usd';
let failPaymentIntentRead = false;
let lostPaymentIntentId = '';
/**
 * Payments the fixture lists beside the purchase's own: a customer this database never bound (with its environment
 * stamp), a deleted bound customer, or none at all, as a Stripe CLI `payment_intent.succeeded` trigger creates.
 */
let strangerPayments: ReadonlyArray<{
  readonly paymentIntentId: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- Stripe represents a PaymentIntent without a Customer as null.
  readonly customerId: string | null;
  readonly stamp?: string;
  readonly deleted?: boolean;
  readonly livemode?: boolean;
  readonly shape?: Record<string, unknown>;
}> = [];
/** Refunds on charges no Tau purchase or binding names, served beside the purchase's own refund. */
let foreignRefunds: ReadonlyArray<{ readonly refundId: string; readonly chargeId: string }> = [];
/** Balance transactions served beside the purchase's own charge movement. */
let extraBalances: ReadonlyArray<Record<string, unknown>> = [];
/** Disputes the fixture answers by id, keyed by dispute, with the charge each withdrew from. */
let foreignDisputes: ReadonlyMap<string, string> = new Map();
let failDisputeRead = false;
/** Customer reads per Customer id, so a test can prove a scan never asked Stripe about one. */
const customerReads = new Map<string, number>();

const cashClaimId = (chargeId: string): string =>
  createHash('sha256')
    .update(JSON.stringify(['development', cashStripeAccountId, false, chargeId]))
    .digest('hex');
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const value = refundFixture;
  if (value === undefined) {
    response.writeHead(503).end();
    return;
  }
  const refund = {
    id: value.refundId,
    object: 'refund',
    amount: 250,
    balance_transaction: 'txn_refund_process',
    charge: value.chargeId,
    currency: 'usd',
    created: refundCreated ?? Math.floor(Date.now() / 1000),
    customer: value.customerId,
    metadata: externalRefund
      ? {}
      : { tau_refund_intent_id: value.intentId, tau_reversal_case_id: value.reversalCaseId },
    payment_intent: value.paymentIntentId,
    status: refundStatus,
  };
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'GET' && url.pathname === '/v1/refunds') {
    const foreign = foreignRefunds.map(({ refundId, chargeId }) => ({
      id: refundId,
      object: 'refund',
      amount: 250,
      balance_transaction: `txn_${refundId}`,
      charge: chargeId,
      currency: 'usd',
      created: Math.floor(Date.now() / 1000),
      metadata: {},
      payment_intent: null,
      status: 'succeeded',
    }));
    response.end(
      JSON.stringify({
        object: 'list',
        data: [...(serveRefund ? [refund] : []), ...foreign],
        has_more: false,
        url: '/v1/refunds',
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/refunds/${value.refundId}`) {
    response.end(JSON.stringify(refund));
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/payment_intents/${value.paymentIntentId}`) {
    if (failPaymentIntentRead) {
      response.writeHead(503).end();
      return;
    }
    response.end(
      JSON.stringify({
        id: value.paymentIntentId,
        object: 'payment_intent',
        status: 'succeeded',
        customer: value.customerId,
        latest_charge: value.chargeId,
        currency: 'usd',
        livemode: false,
        amount: 500,
        amount_received: 500,
        created: Math.floor(Date.now() / 1000),
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/v1/customers/')) {
    const customerId = url.pathname.slice('/v1/customers/'.length);
    customerReads.set(customerId, (customerReads.get(customerId) ?? 0) + 1);
  }
  const stranger = strangerPayments.find(
    ({ customerId }) => customerId !== null && url.pathname === `/v1/customers/${customerId}`,
  );
  if (request.method === 'GET' && stranger !== undefined) {
    response.end(
      JSON.stringify(
        stranger.deleted === true
          ? { id: stranger.customerId, object: 'customer', deleted: true }
          : {
              id: stranger.customerId,
              object: 'customer',
              livemode: stranger.livemode ?? false,
              metadata: stranger.stamp === undefined ? {} : { tau_environment: stranger.stamp },
            },
      ),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/payment_intents') {
    const paymentIntent = {
      id: value.paymentIntentId,
      object: 'payment_intent',
      status: 'succeeded',
      customer: value.customerId,
      latest_charge: value.chargeId,
      currency: 'usd',
      livemode: false,
      amount: 500,
      amount_received: 500,
      created: Math.floor(Date.now() / 1000),
    };
    const lostPaymentIntent = {
      ...paymentIntent,
      id: lostPaymentIntentId,
      latest_charge: `ch_lost_${lostPaymentIntentId}`,
    };
    response.end(
      JSON.stringify({
        object: 'list',
        data: listCashSources
          ? [
              paymentIntent,
              ...(lostPaymentIntentId === '' ? [] : [lostPaymentIntent]),
              ...strangerPayments.map(({ paymentIntentId, customerId, livemode, shape }) => ({
                ...paymentIntent,
                id: paymentIntentId,
                customer: customerId,
                latest_charge: `ch_${paymentIntentId}`,
                livemode: livemode ?? false,
                ...shape,
              })),
            ]
          : [],
        has_more: false,
        url: '/v1/payment_intents',
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/charges/${value.chargeId}`) {
    response.end(
      JSON.stringify({
        id: value.chargeId,
        object: 'charge',
        status: 'succeeded',
        paid: true,
        customer: value.customerId,
        payment_intent: value.paymentIntentId,
        currency: 'usd',
        livemode: false,
        amount: 500,
        amount_captured: 500,
        created: Math.floor(Date.now() / 1000),
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/charges') {
    const charge = {
      id: value.chargeId,
      object: 'charge',
      status: 'succeeded',
      paid: true,
      customer: value.customerId,
      payment_intent: value.paymentIntentId,
      currency: 'usd',
      livemode: false,
      amount: 500,
      amount_captured: 500,
      created: Math.floor(Date.now() / 1000),
    };
    response.end(
      JSON.stringify({ object: 'list', data: listCashSources ? [charge] : [], has_more: false, url: '/v1/charges' }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/balance_transactions') {
    const balance = {
      id: 'txn_scan_fixture',
      object: 'balance_transaction',
      type: 'charge',
      source: value.chargeId,
      currency: settlementCurrency,
      amount: 500,
      fee: 30,
      net: invalidBalance ? 400 : 470,
      status: 'available',
      created: Math.floor(Date.now() / 1000),
    };
    const canceling = [
      { ...balance, id: `txn_lost_charge_${lostPaymentIntentId}`, source: `ch_lost_${lostPaymentIntentId}`, net: 470 },
      {
        ...balance,
        id: `txn_lost_reversal_${lostPaymentIntentId}`,
        source: `ch_lost_${lostPaymentIntentId}`,
        type: 'refund',
        amount: -500,
        fee: -30,
        net: -470,
      },
    ];
    response.end(
      JSON.stringify({
        object: 'list',
        data: listCashSources ? [balance, ...(lostPaymentIntentId === '' ? [] : canceling), ...extraBalances] : [],
        has_more: false,
        url: '/v1/balance_transactions',
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/disputes') {
    const created = disputeCreated;
    const dispute = {
      id: `dp_${value.chargeId}`,
      object: 'dispute',
      charge: value.chargeId,
      currency: 'usd',
      livemode: false,
      payment_intent: value.paymentIntentId,
      status: disputeReturned ? 'won' : 'under_review',
      balance_transactions: [
        { id: `txn_withdraw_${value.chargeId}`, amount: -500, created: created - 1 },
        ...(disputeReturned ? [{ id: `txn_return_${value.chargeId}`, amount: 500, created }] : []),
      ],
    };
    response.end(
      JSON.stringify({ object: 'list', data: serveDispute ? [dispute] : [], has_more: false, url: '/v1/disputes' }),
    );
    return;
  }
  const foreignDispute = foreignDisputes.get(url.pathname.slice('/v1/disputes/'.length));
  if (request.method === 'GET' && url.pathname.startsWith('/v1/disputes/') && foreignDispute !== undefined) {
    response.end(
      JSON.stringify({
        id: url.pathname.slice('/v1/disputes/'.length),
        object: 'dispute',
        charge: foreignDispute,
        currency: 'usd',
        livemode: false,
        status: 'under_review',
        balance_transactions: [],
      }),
    );
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/disputes/dp_${value.chargeId}`) {
    if (failDisputeRead) {
      response.writeHead(503).end();
      return;
    }
    const created = disputeCreated;
    response.end(
      JSON.stringify({
        id: `dp_${value.chargeId}`,
        object: 'dispute',
        charge: value.chargeId,
        currency: 'usd',
        livemode: false,
        payment_intent: value.paymentIntentId,
        status: disputeReturned ? 'won' : 'under_review',
        balance_transactions: [
          { id: `txn_withdraw_${value.chargeId}`, amount: -500, created: created - 1 },
          ...(disputeReturned ? [{ id: `txn_return_${value.chargeId}`, amount: 500, created }] : []),
        ],
      }),
    );
    return;
  }
  response.writeHead(404).end();
});
/* eslint-enable @typescript-eslint/naming-convention -- End Stripe fixture bodies. */
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Cash fixture address unavailable');
  }
  stripeOrigin = `http://127.0.0.1:${address.port}/`;
});
afterAll(async () => {
  await Promise.all([
    adminClient.end(),
    runtimeClient.end(),
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    }),
  ]);
});

async function fixture(atoms = 1000n) {
  const accountId = randomUUID();
  await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
  const purchase = await seedPaidPurchase({
    database,
    accountId,
    environment: 'development',
    atoms,
    stripeAccountId: cashStripeAccountId,
  });
  const claimId = cashClaimId(purchase.proof.chargeId);
  await database.insert(schema.billingStripeSource).values({
    id: claimId,
    environment: 'development',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    sourceType: 'cash_charge',
    sourceId: purchase.proof.chargeId,
    state: 'processing',
    generation: 1n,
    leaseUntil: sql`transaction_timestamp() + interval '30 seconds'`,
  });
  return { accountId, purchase, claimId };
}

async function zeroEligiblePlanFixture() {
  const accountId = randomUUID();
  const suffix = randomUUID();
  const customerBindingId = `customer-${suffix}`;
  const subscriptionId = `subscription-${suffix}`;
  const periodId = randomUUID();
  const paymentIntentId = `pi_${suffix}`;
  const chargeId = `ch_${suffix}`;
  const customerId = `cus_${suffix}`;
  const invoiceId = `in_${suffix}`;
  const stripeSubscriptionId = `sub_${suffix}`;
  const paidAt = new Date();
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'cash-zero-policy',
    offerId: 'pro-monthly',
    environment: 'development',
    accountId,
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '500',
    creditAtoms: '1000',
    ceilingCreditAtoms: '1000',
    stripePriceId: 'price_cash_zero',
    stripeProductId: null,
    quantity: 1,
    term: 'month',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: null,
  };
  const paidEvidence: PaidPaymentEvidence = {
    version: 'stripe-paid-v1',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    customerId,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    paymentIntentIds: [paymentIntentId],
    chargeIds: [chargeId],
    invoiceId,
    subscriptionId: stripeSubscriptionId,
    subscriptionItemId: `si_${suffix}`,
    sourceDigest: suffix.replaceAll('-', '').repeat(2),
    paidAt: paidAt.toISOString(),
    paymentMethod: null,
  };
  await database.insert(schema.creditAccount).values({
    id: accountId,
    environment: 'development',
    planAtoms: 1000n,
  });
  await database.insert(schema.billingStripeCustomer).values({
    id: customerBindingId,
    accountId,
    environment: 'development',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    stripeCustomerId: customerId,
  });
  await database.insert(schema.subscription).values({
    id: subscriptionId,
    plan: 'pro',
    stripeSubscriptionId,
    accountId,
    environment: 'development',
    customerBindingId,
    requestId: randomUUID(),
    requestHash: 'a'.repeat(64),
    offerSnapshot: offer,
    slotState: 'current',
    status: 'active',
  });
  await database.insert(schema.billingPeriod).values({
    id: periodId,
    accountId,
    sourceIdentity: `period:${periodId}`,
    creditAtoms: 1000n,
    periodStart: new Date(paidAt.getTime() - 1000),
    periodEnd: new Date(paidAt.getTime() + 86_400_000),
    subscriptionId,
    invoiceId,
    offerSnapshot: offer,
    paidEvidence,
    state: 'verified',
    paidAt,
  });
  const claimId = cashClaimId(chargeId);
  await database.insert(schema.billingStripeSource).values({
    id: claimId,
    environment: 'development',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    sourceType: 'cash_charge',
    sourceId: chargeId,
    state: 'processing',
    generation: 1n,
    leaseUntil: sql`clock_timestamp() + interval '30 seconds'`,
  });
  const projection: CashProjectionEvidence = {
    version: 'stripe-cash-projection-v1',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    customerId,
    paymentIntentId,
    chargeId,
    currency: 'usd',
    originalPrincipalMinor: '500',
    originalTaxMinor: '0',
    originalGrossMinor: '500',
    principalLossMinor: '0',
    taxLossMinor: '0',
    grossLossMinor: '0',
    refundIds: [],
    disputeIds: [],
    balanceTransactionIds: [],
  };
  return { accountId, periodId, claimId, projection };
}

function evidence(input: Awaited<ReturnType<typeof fixture>>, principalLossMinor: string): CashProjectionEvidence {
  return {
    version: 'stripe-cash-projection-v1',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
    customerId: input.purchase.proof.paidEvidence.customerId,
    paymentIntentId: input.purchase.proof.paymentIntentId,
    chargeId: input.purchase.proof.chargeId,
    currency: 'usd',
    originalPrincipalMinor: '500',
    originalTaxMinor: '0',
    originalGrossMinor: '500',
    principalLossMinor,
    taxLossMinor: '0',
    grossLossMinor: principalLossMinor,
    refundIds: [],
    disputeIds: [],
    balanceTransactionIds: [],
  };
}

async function apply(input: Awaited<ReturnType<typeof fixture>>, projection: CashProjectionEvidence, generation = 1n) {
  return ledger.applyCashDisposition({
    accountId: input.accountId,
    causeId: input.purchase.purchaseId,
    source: 'purchased',
    sourceClaimId: input.claimId,
    sourceGeneration: generation,
    projectionDigest: cashProjectionDigest(projection),
    principalLossMinor: BigInt(projection.principalLossMinor),
    taxLossMinor: 0n,
    grossLossMinor: BigInt(projection.grossLossMinor),
    evidence: projection,
    occurredAt: new Date(),
  });
}

/** Mirrors the production cash application: ledger disposition, tax correction, then the claim finish. */
async function applyQualified(
  input: Awaited<ReturnType<typeof fixture>>,
  qualified: QualifiedCashSource,
): Promise<void> {
  await runtimeDatabase.transaction(async (tx) => {
    await ledger.applyCashDisposition(
      {
        accountId: input.accountId,
        causeId: input.purchase.purchaseId,
        source: 'purchased',
        ...qualified,
        occurredAt: cashOccurredAt(qualified, input.purchase.proof.paidAt),
      },
      tx,
    );
    await tax.observeQualifiedCashCorrection({
      transaction: tx,
      causeId: input.purchase.purchaseId,
      source: 'purchased',
      qualified,
    });
    await tx
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null, errorCode: null })
      .where(eq(schema.billingStripeSource.id, input.claimId));
  });
}

async function reclaim(input: Awaited<ReturnType<typeof fixture>>, generation: bigint): Promise<void> {
  await database
    .update(schema.billingStripeSource)
    .set({
      state: 'processing',
      generation,
      leaseUntil: sql`clock_timestamp() + interval '30 seconds'`,
    })
    .where(eq(schema.billingStripeSource.id, input.claimId));
}

function cashService(secretKey: string): BillingCashService {
  const stripe = createBillingStripeClient({ secretKey, fixtureUrl: stripeOrigin, requestTimeout: 500 });
  return new BillingCashService({ database: runtimeDatabase }, stripe, ledger, {
    environment: 'development',
    stripeAccountId: cashStripeAccountId,
    livemode: false,
  });
}

async function reversalCaseOf(
  input: Awaited<ReturnType<typeof fixture>>,
): Promise<typeof schema.billingReversalCase.$inferSelect> {
  const [cashCase] = await database
    .select()
    .from(schema.billingReversalCase)
    .where(eq(schema.billingReversalCase.purchaseId, input.purchase.purchaseId));
  if (cashCase === undefined) {
    throw new Error('Cash reversal case was not created');
  }
  return cashCase;
}

function reconciliationService(secretKey: string, livemode = false): BillingCashReconciliationService {
  const stripe = createBillingStripeClient({ secretKey, fixtureUrl: stripeOrigin, requestTimeout: 2000 });
  return new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
    environment: 'development',
    stripeAccountId: cashStripeAccountId,
    livemode,
  });
}

/** Runs one complete scan pass whose window ends `offsetMilliseconds` after now; distinct offsets are distinct scans. */
async function scanPass(reconciliation: BillingCashReconciliationService, offsetMilliseconds = 0): Promise<void> {
  const now = Date.now() + offsetMilliseconds;
  const scanId = await reconciliation.createScan({
    environment: 'development',
    currency: 'usd',
    lookbackStart: new Date(now - 60_000),
    windowStart: new Date(now - 30_000),
    windowEnd: new Date(now + 60_000),
  });
  await expect(reconciliation.runScan({ scanId, maximumPagesPerStream: 3 })).resolves.toEqual({ status: 'complete' });
}

async function casesFor(
  kind: string,
  sourceId: string,
): Promise<Array<typeof schema.billingFinancialCase.$inferSelect>> {
  return database
    .select()
    .from(schema.billingFinancialCase)
    .where(and(eq(schema.billingFinancialCase.kind, kind), eq(schema.billingFinancialCase.sourceId, sourceId)));
}

/** Lists the purchase's own payment, charge and charge movement, with nothing refunded or disputed. */
function serveOwnSources(purchase: Awaited<ReturnType<typeof seedPaidPurchase>>): void {
  refundFixture = {
    customerId: purchase.proof.paidEvidence.customerId,
    paymentIntentId: purchase.proof.paymentIntentId,
    chargeId: purchase.proof.chargeId,
    refundId: `re_${randomUUID()}`,
    intentId: randomUUID(),
    reversalCaseId: randomUUID(),
  };
  serveRefund = false;
  serveDispute = false;
  listCashSources = true;
  invalidBalance = false;
}

function resetServedSources(): void {
  strangerPayments = [];
  foreignRefunds = [];
  foreignDisputes = new Map();
  extraBalances = [];
  failDisputeRead = false;
  listCashSources = false;
}

async function freshAccount() {
  const accountId = randomUUID();
  await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
  return accountId;
}

/** New collection for an account: the check every purchase, renewal and reload preparation makes before it writes. */
async function expectCollectionAdmitted(accountId: string): Promise<void> {
  await expect(assertCollectionNotSpendBlocked(runtimeDatabase, 'development', accountId)).resolves.toBeUndefined();
}

describe('cash disposition foundation', () => {
  it('releases an initial cash claim when a provider source read fails', async () => {
    const value = await fixture();
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    failPaymentIntentRead = true;
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_read_failure', fixtureUrl: stripeOrigin });
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, ledger, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    await expect(
      cash.qualifyInitialPayment({
        environment: 'development',
        accountId: value.accountId,
        causeId: value.purchase.purchaseId,
        source: 'purchased',
        stripeAccountId: cashStripeAccountId,
        livemode: false,
        customerId: value.purchase.proof.paidEvidence.customerId,
        paymentIntentId: value.purchase.proof.paymentIntentId,
        chargeId: value.purchase.proof.chargeId,
        currency: 'usd',
        originalPrincipalMinor: 500n,
        originalTaxMinor: 0n,
        maximumRefundPages: 3,
      }),
    ).rejects.toThrow();
    failPaymentIntentRead = false;
    const [source] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, value.claimId));
    expect(source).toMatchObject({
      state: 'pending',
      generation: 2n,
      leaseUntil: null,
      errorCode: 'cash_payment_source_read_failed',
    });
  });

  it('records a paid plan period with zero eligible headroom without minting credit', async () => {
    const value = await zeroEligiblePlanFixture();
    const receipt = await ledger.applyCashDisposition({
      accountId: value.accountId,
      causeId: value.periodId,
      source: 'plan',
      sourceClaimId: value.claimId,
      sourceGeneration: 1n,
      projectionDigest: cashProjectionDigest(value.projection),
      principalLossMinor: 0n,
      taxLossMinor: 0n,
      grossLossMinor: 0n,
      evidence: value.projection,
      occurredAt: new Date(),
    });
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    const [cashCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.periodId, value.periodId));
    expect(receipt.grantedAtoms).toBe(0n);
    expect(account?.planAtoms).toBe(1000n);
    expect(cashCase).toMatchObject({ originalAtoms: 0n, initialIssuedAtoms: 0n, withheldAtoms: 0n });
  });

  it('rejects an initial cash case that omits original tax evidence', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    const [valid] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
    if (valid === undefined) {
      throw new Error('Expected canonical cash case');
    }
    await expect(
      database.insert(schema.billingReversalCase).values({
        ...valid,
        id: randomUUID(),
        purchaseId: randomUUID(),
        paymentIntentId: `pi_${randomUUID()}`,
        chargeId: `ch_${randomUUID()}`,
        originalTaxMinor: null,
      }),
    ).rejects.toMatchObject({
      cause: Object.fromEntries([
        ['code', '23514'],
        ['constraint_name', 'billing_reversal_cash'],
      ]),
    });
  });

  it('converges nondivisible partial losses to the exact full-loss endpoint', async () => {
    const value = await fixture(7n);
    await apply(value, evidence(value, '300'));
    await reclaim(value, 2n);
    await apply(value, evidence(value, '200'), 2n);
    await reclaim(value, 3n);
    await apply(value, evidence(value, '500'), 3n);
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    const [cashCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
    expect(account?.purchasedAtoms).toBe(0n);
    expect(cashCase).toMatchObject({
      originalAtoms: 7n,
      initialIssuedAtoms: 3n,
      deferredIssuedAtoms: 2n,
      netAppliedAtoms: 5n,
    });
  });

  it('never duplicates deferred issuance across loss and restoration cycles', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '250'));
    await reclaim(value, 2n);
    await apply(value, evidence(value, '0'), 2n);
    await reclaim(value, 3n);
    await apply(value, evidence(value, '250'), 3n);
    await reclaim(value, 4n);
    await apply(value, evidence(value, '0'), 4n);
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    const [cashCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
    expect(account?.purchasedAtoms).toBe(1000n);
    expect(cashCase).toMatchObject({ initialIssuedAtoms: 500n, deferredIssuedAtoms: 500n, netAppliedAtoms: 0n });
    const deferred = await database
      .select()
      .from(schema.creditTransaction)
      .where(
        and(
          eq(schema.creditTransaction.accountId, value.accountId),
          eq(schema.creditTransaction.kind, 'deferred_grant'),
        ),
      );
    expect(deferred).toHaveLength(1);
  });

  it('preserves active holds and applies restored cash to reversal debt first', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.creditAccount)
      .set({ purchasedAtoms: 600n, purchasedHeldAtoms: 400n })
      .where(eq(schema.creditAccount.id, value.accountId));
    await reclaim(value, 2n);
    await apply(value, evidence(value, '500'), 2n);
    let [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account).toMatchObject({ purchasedAtoms: 400n, purchasedHeldAtoms: 400n, debtAtoms: 800n });
    await reclaim(value, 3n);
    await apply(value, evidence(value, '0'), 3n);
    [account] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, value.accountId));
    expect(account).toMatchObject({ purchasedAtoms: 600n, purchasedHeldAtoms: 400n, debtAtoms: 0n });
  });

  it('issues net entitlement then releases withheld entitlement after authoritative restoration', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '250'));
    let [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account?.purchasedAtoms).toBe(500n);
    await database
      .update(schema.billingStripeSource)
      .set({
        state: 'processing',
        generation: 2n,
        leaseUntil: sql`transaction_timestamp() + interval '30 seconds'`,
      })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    await apply(value, evidence(value, '0'), 2n);
    [account] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, value.accountId));
    expect(account?.purchasedAtoms).toBe(1000n);
  });

  it('rejects a digest mismatch without granting atoms', async () => {
    const value = await fixture();
    const projection = evidence(value, '0');
    await expect(
      ledger.applyCashDisposition({
        accountId: value.accountId,
        causeId: value.purchase.purchaseId,
        source: 'purchased',
        sourceClaimId: value.claimId,
        sourceGeneration: 1n,
        projectionDigest: '0'.repeat(64),
        principalLossMinor: 0n,
        taxLossMinor: 0n,
        grossLossMinor: 0n,
        evidence: projection,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('Cash projection does not match');
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account?.purchasedAtoms).toBe(0n);
  });

  it('serializes ordinary and cash-qualified first fulfillment without a double grant', async () => {
    const value = await fixture();
    const projection = evidence(value, '0');
    const results = await Promise.allSettled([
      ledger.fulfillPaidPurchase({ accountId: value.accountId, causeId: value.purchase.purchaseId }),
      apply(value, projection),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account?.purchasedAtoms).toBe(1000n);
    const receipts = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.accountId, value.accountId));
    expect(receipts.filter((receipt) => receipt.kind === 'purchase_grant')).toHaveLength(1);
  });

  it('applies a Dashboard refund and returned dispute cash after a retained financial tombstone', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    const cashCase = await reversalCaseOf(value);
    const tombstoneAt = new Date();
    const bindingId = randomUUID();
    await database.insert(schema.billingOwnerBinding).values({
      id: bindingId,
      accountId: value.accountId,
      environment: 'development',
      authUserId: null,
      revokedAt: tombstoneAt,
    });
    await database.insert(schema.billingAccountClosure).values({
      id: randomUUID(),
      accountId: value.accountId,
      bindingId,
      environment: 'development',
      requestId: randomUUID(),
      requestHash: 'c'.repeat(64),
      state: 'closed',
      bindingRevokedAt: tombstoneAt,
      obligationsFrozenAt: tombstoneAt,
      authDeletedAt: tombstoneAt,
      closedAt: tombstoneAt,
    });
    await database
      .update(schema.creditAccount)
      .set({ status: 'closed' })
      .where(eq(schema.creditAccount.id, value.accountId));
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: '',
      reversalCaseId: cashCase.id,
    };
    externalRefund = true;
    serveRefund = true;
    refundStatus = 'succeeded';
    serveDispute = true;
    disputeReturned = true;
    disputeCreated = Math.floor(Date.now() / 1000);
    const cash = cashService('sk_test_cash_tombstone');
    try {
      await expect(
        cash.reconcileCharge({
          environment: 'development',
          chargeId: value.purchase.proof.chargeId,
          maximumRefundPages: 3,
        }),
      ).resolves.toEqual({ status: 'applied', accountId: value.accountId });
      const [account] = await database
        .select()
        .from(schema.creditAccount)
        .where(eq(schema.creditAccount.id, value.accountId));
      expect(account).toMatchObject({ purchasedAtoms: 500n, purchasedHeldAtoms: 0n });
    } finally {
      externalRefund = false;
      serveRefund = false;
      serveDispute = false;
      disputeReturned = false;
    }
  });

  it('applies an external dashboard refund as a conserved pro-rata reversal and replays it', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    const cashCase = await reversalCaseOf(value);
    const refundId = `re_external_${randomUUID()}`;
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId,
      intentId: '',
      reversalCaseId: cashCase.id,
    };
    externalRefund = true;
    serveRefund = true;
    refundStatus = 'succeeded';
    refundCreated = Math.floor(Date.now() / 1000) - 60;
    const cash = cashService('sk_test_cash_external');
    try {
      const request = {
        environment: 'development',
        chargeId: value.purchase.proof.chargeId,
        maximumRefundPages: 3,
      } as const;
      await expect(cash.reconcileCharge(request)).resolves.toEqual({ status: 'applied', accountId: value.accountId });
      const [account] = await database
        .select()
        .from(schema.creditAccount)
        .where(eq(schema.creditAccount.id, value.accountId));
      // Half the 500 minor principal came back, so half the 1000 granted atoms are reversed.
      expect(account).toMatchObject({ purchasedAtoms: 500n, purchasedHeldAtoms: 0n });
      const applied = await reversalCaseOf(value);
      expect(applied).toMatchObject({ cumulativePrincipalLossMinor: 250n, cumulativeGrossLossMinor: 250n });
      expect(applied.projectionEvidence).toMatchObject({ refundIds: [refundId] });
      // Replaying the same Stripe state changes nothing.
      await expect(cash.reconcileCharge(request)).resolves.toEqual({ status: 'applied', accountId: value.accountId });
      const [replayed] = await database
        .select()
        .from(schema.creditAccount)
        .where(eq(schema.creditAccount.id, value.accountId));
      expect(replayed?.purchasedAtoms).toBe(500n);
      // A charge with no fulfilled cause is left to the purchase's own first qualification.
      await expect(cash.reconcileCharge({ ...request, chargeId: `ch_unknown_${randomUUID()}` })).resolves.toEqual({
        status: 'no_cause',
      });
    } finally {
      externalRefund = false;
      serveRefund = false;
      refundCreated = undefined;
    }
  });

  it('converges a late dispute withdrawal and reinstatement after account closure', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    const tombstoneAt = new Date();
    const bindingId = randomUUID();
    await database.insert(schema.billingOwnerBinding).values({
      id: bindingId,
      accountId: value.accountId,
      environment: 'development',
      authUserId: null,
      revokedAt: tombstoneAt,
    });
    await database.insert(schema.billingAccountClosure).values({
      id: randomUUID(),
      accountId: value.accountId,
      bindingId,
      environment: 'development',
      requestId: randomUUID(),
      requestHash: 'd'.repeat(64),
      state: 'closed',
      bindingRevokedAt: tombstoneAt,
      obligationsFrozenAt: tombstoneAt,
      authDeletedAt: tombstoneAt,
      closedAt: tombstoneAt,
    });
    await database
      .update(schema.creditAccount)
      .set({ status: 'closed', purchasedAtoms: 0n })
      .where(eq(schema.creditAccount.id, value.accountId));
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    serveDispute = true;
    disputeReturned = false;
    disputeCreated = Math.floor(Date.now() / 1000) - 10;
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_dispute', fixtureUrl: stripeOrigin });
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, ledger, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    const [cashCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
    if (cashCase === undefined) {
      throw new Error('Cash reversal case was not created');
    }
    const withdrawn = await cash.qualifyChargeSource({
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      maximumRefundPages: 3,
    });
    if (withdrawn.status !== 'qualified') {
      throw new Error(`Withdrawal was not qualified: ${withdrawn.reason}`);
    }
    await applyQualified(value, withdrawn);
    let [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account).toMatchObject({ status: 'closed', purchasedAtoms: 0n, debtAtoms: 1000n });
    disputeReturned = true;
    disputeCreated += 5;
    const restored = await cash.qualifyChargeSource({
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      maximumRefundPages: 3,
    });
    if (restored.status !== 'qualified') {
      throw new Error(`Restoration was not qualified: ${restored.reason}`);
    }
    await applyQualified(value, restored);
    [account] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, value.accountId));
    expect(account).toMatchObject({ status: 'closed', purchasedAtoms: 0n, debtAtoms: 0n });
    const [source] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, value.claimId));
    expect(source).toMatchObject({ state: 'done', generation: 3n });
    const [restoredCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.id, cashCase.id));
    expect(restoredCase?.projectionObservedAt).toEqual(new Date(disputeCreated * 1000));
    serveDispute = false;
    disputeReturned = false;
  });

  it('opens owned paid-unfulfilled and gross/fee/net cases from independent scan pages', async () => {
    const value = await fixture();
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    listCashSources = true;
    invalidBalance = true;
    // A movement with no charge source names no purchase or binding, so its mismatch is nobody's account.
    const sourceless = `txn_sourceless_${randomUUID()}`;
    extraBalances = [
      {
        id: sourceless,
        object: 'balance_transaction',
        type: 'adjustment',
        source: null,
        currency: 'usd',
        amount: 500,
        fee: 30,
        net: 400,
        status: 'available',
        created: Math.floor(Date.now() / 1000),
      },
    ];
    try {
      await scanPass(reconciliationService('sk_test_cash_scan'));
    } finally {
      extraBalances = [];
    }
    const cases = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(eq(schema.billingFinancialCase.environment, 'development'));
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'paid_unfulfilled_recovery', accountId: value.accountId, state: 'open' }),
        // The balance transaction's source charge names the purchase, so the case names only its owner.
        expect.objectContaining({ kind: 'gross_fee_net_mismatch', accountId: value.accountId, state: 'open' }),
        expect.objectContaining({
          kind: 'gross_fee_net_mismatch',
          sourceId: sourceless,
          accountId: null,
          state: 'open',
        }),
      ]),
    );
    // Money Tau owes the owner and Tau's own fee accounting refuse no one's next purchase, the owner's included.
    await expectCollectionAdmitted(value.accountId);
  });

  it('retrieves a paid receipt source omitted from created-time pages before declaring an orphan', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    listCashSources = false;
    invalidBalance = false;
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_late', fixtureUrl: stripeOrigin });
    const reconciliation = new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    const now = new Date();
    const scanId = await reconciliation.createScan({
      environment: 'development',
      currency: 'usd',
      lookbackStart: new Date(now.getTime() - 60_000),
      windowStart: new Date(now.getTime() - 30_000),
      windowEnd: new Date(now.getTime() + 60_000),
    });
    await expect(reconciliation.runScan({ scanId, maximumPagesPerStream: 3 })).resolves.toEqual({ status: 'complete' });
    const orphan = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(
        and(
          eq(schema.billingFinancialCase.kind, 'orphan_local_receipt'),
          eq(schema.billingFinancialCase.accountId, value.accountId),
        ),
      );
    expect(orphan).toHaveLength(0);
    const links = await database
      .select()
      .from(schema.billingCashScanFact)
      .where(eq(schema.billingCashScanFact.scanId, scanId));
    expect(links).toHaveLength(2);
  });

  it('rejects a canonical source claim outside its configured scope or another charge lease', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    const cashCase = await reversalCaseOf(value);
    const input = {
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      maximumRefundPages: 3,
    } as const;
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_scope', fixtureUrl: stripeOrigin });
    const foreign = new BillingCashService({ database: runtimeDatabase }, stripe, ledger, {
      environment: 'development',
      stripeAccountId: 'acct_cash_other',
      livemode: false,
    });
    await expect(foreign.qualifyChargeSource(input)).rejects.toThrow('cash_source_scope');
    const live = new BillingCashService({ database: runtimeDatabase }, stripe, ledger, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: true,
    });
    await expect(live.qualifyChargeSource(input)).rejects.toThrow('cash_source_scope');
    await expect(
      cashService('sk_test_cash_scope').qualifyChargeSource({ ...input, environment: 'staging' }),
    ).rejects.toThrow('cash_source_scope');
    const [source] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, value.claimId));
    expect(source).toMatchObject({ generation: 1n });
    const other = await fixture();
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'pending', leaseUntil: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(schema.billingStripeSource.id, other.claimId));
    await expect(cashService('sk_test_cash_scope').qualifyChargeSource(input)).rejects.toThrow('cash_source_claimed');
    const [untouched] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, other.claimId));
    expect(untouched).toMatchObject({ state: 'pending', generation: 1n });
  });

  it('does not accept a shrunken dispute listing as returned cash', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    serveDispute = true;
    disputeReturned = false;
    disputeCreated = Math.floor(Date.now() / 1000) - 10;
    const cash = cashService('sk_test_cash_shrunken');
    const cashCase = await reversalCaseOf(value);
    const input = {
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      maximumRefundPages: 3,
    } as const;
    const withdrawn = await cash.qualifyChargeSource(input);
    if (withdrawn.status !== 'qualified') {
      throw new Error(`Withdrawal was not qualified: ${withdrawn.reason}`);
    }
    await applyQualified(value, withdrawn);
    serveDispute = false;
    await expect(cash.qualifyChargeSource(input)).resolves.toEqual({
      status: 'attention',
      reason: 'cash_source_coverage_regression',
    });
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    const [retained] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.id, cashCase.id));
    expect(account).toMatchObject({ purchasedAtoms: 0n, debtAtoms: 0n });
    expect(retained).toMatchObject({ cumulativePrincipalLossMinor: 500n, netAppliedAtoms: 1000n });
  });

  it('reaches the same bounded entitlement from split and single full refunds', async () => {
    const split = await fixture();
    await apply(split, evidence(split, '300'));
    await reclaim(split, 2n);
    await apply(split, evidence(split, '500'), 2n);
    const single = await fixture();
    const receipt = await apply(single, evidence(single, '500'));
    const [splitAccount] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, split.accountId));
    const [singleAccount] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, single.accountId));
    expect(splitAccount).toMatchObject({ purchasedAtoms: 0n, debtAtoms: 0n });
    expect(singleAccount).toMatchObject({ purchasedAtoms: 0n, debtAtoms: 0n });
    const splitCase = await reversalCaseOf(split);
    const singleCase = await reversalCaseOf(single);
    expect(splitCase).toMatchObject({
      originalAtoms: 1000n,
      initialIssuedAtoms: 400n,
      deferredIssuedAtoms: 0n,
      netAppliedAtoms: 400n,
    });
    expect(singleCase).toMatchObject({
      originalAtoms: 1000n,
      initialIssuedAtoms: 0n,
      withheldAtoms: 1000n,
      deferredIssuedAtoms: 0n,
      netAppliedAtoms: 0n,
    });
    expect(receipt.grantedAtoms).toBe(0n);
    expect(singleCase.canonicalReceiptId).toBe(receipt.receiptId);
  });

  it('detects a lost journal whose balance movements cancel internally', async () => {
    const value = await fixture();
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    serveDispute = false;
    listCashSources = true;
    invalidBalance = false;
    // The balance transactions settle in NZD while the scan covers USD presentment; that is not a mismatch.
    settlementCurrency = 'nzd';
    const lostPaymentIntent = `pi_lost_${randomUUID()}`;
    lostPaymentIntentId = lostPaymentIntent;
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_lost', fixtureUrl: stripeOrigin });
    const reconciliation = new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    const now = new Date();
    const scanId = await reconciliation.createScan({
      environment: 'development',
      currency: 'usd',
      lookbackStart: new Date(now.getTime() - 60_000),
      windowStart: new Date(now.getTime() - 30_000),
      windowEnd: new Date(now.getTime() + 60_000),
    });
    await expect(reconciliation.runScan({ scanId, maximumPagesPerStream: 3 })).resolves.toEqual({ status: 'complete' });
    const cases = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(eq(schema.billingFinancialCase.environment, 'development'));
    lostPaymentIntentId = '';
    listCashSources = false;
    settlementCurrency = 'usd';
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'missing_local_payment', sourceId: lostPaymentIntent, state: 'open' }),
        expect.objectContaining({
          kind: 'paid_unfulfilled_recovery',
          sourceId: value.purchase.proof.paymentIntentId,
          state: 'open',
        }),
      ]),
    );
    expect(
      cases.filter(
        (value_) => value_.kind === 'missing_local_payment' && value_.sourceId === value.purchase.proof.paymentIntentId,
      ),
    ).toHaveLength(0);
    expect(
      cases.filter(
        (value_) =>
          value_.kind === 'gross_fee_net_mismatch' &&
          (value_.sourceId === `txn_lost_charge_${lostPaymentIntent}` ||
            value_.sourceId === `txn_lost_reversal_${lostPaymentIntent}`),
      ),
    ).toHaveLength(0);
  });

  it('should skip a test-mode payment stamped by another environment and keep an unstamped stranger as unattributed work', async () => {
    const value = await fixture();
    refundFixture = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: randomUUID(),
      reversalCaseId: randomUUID(),
    };
    serveRefund = false;
    serveDispute = false;
    listCashSources = true;
    invalidBalance = false;
    const staging = {
      paymentIntentId: `pi_staging_${randomUUID()}`,
      customerId: `cus_staging_${randomUUID()}`,
      stamp: 'staging',
    };
    const own = {
      paymentIntentId: `pi_own_${randomUUID()}`,
      customerId: `cus_own_${randomUUID()}`,
      stamp: 'development',
    };
    const stranger = { paymentIntentId: `pi_stranger_${randomUUID()}`, customerId: `cus_stranger_${randomUUID()}` };
    strangerPayments = [staging, own, stranger];
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_foreign', fixtureUrl: stripeOrigin });
    const reconciliation = new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    const now = new Date();
    const scanId = await reconciliation.createScan({
      environment: 'development',
      currency: 'usd',
      lookbackStart: new Date(now.getTime() - 60_000),
      windowStart: new Date(now.getTime() - 30_000),
      windowEnd: new Date(now.getTime() + 60_000),
    });
    try {
      await expect(reconciliation.runScan({ scanId, maximumPagesPerStream: 3 })).resolves.toEqual({
        status: 'complete',
      });
    } finally {
      strangerPayments = [];
      listCashSources = false;
    }
    const cases = await database
      .select()
      .from(schema.billingFinancialCase)
      .where(
        and(
          eq(schema.billingFinancialCase.environment, 'development'),
          eq(schema.billingFinancialCase.kind, 'missing_local_payment'),
          inArray(schema.billingFinancialCase.sourceId, [
            staging.paymentIntentId,
            own.paymentIntentId,
            stranger.paymentIntentId,
          ]),
        ),
      );
    // Stamped by another environment sharing the test sandbox: its cash, not this one's.
    expect(cases.filter((row) => row.sourceId === staging.paymentIntentId)).toHaveLength(0);
    // A stamp naming this environment on an unbound customer proves nothing: the case still opens, for an operator.
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: own.paymentIntentId, accountId: null, state: 'open' }),
        expect.objectContaining({ sourceId: stranger.paymentIntentId, accountId: null, state: 'open' }),
      ]),
    );
    // Neither unattributed case refuses the owner's next purchase.
    await expectCollectionAdmitted(value.accountId);
    // Refuses nothing either way; resolving them keeps the open-case gauge this file leaves behind small.
    await database
      .update(schema.billingFinancialCase)
      .set({ state: 'resolved', resolvedAt: new Date(), resolutionEvidence: { disposition: 'test_cleanup' } })
      .where(inArray(schema.billingFinancialCase.sourceId, [own.paymentIntentId, stranger.paymentIntentId]));
  });

  it('should open one unattributed missing_local_payment for a succeeded PaymentIntent with no customer and refuse nobody', async () => {
    const value = await fixture();
    serveOwnSources(value.purchase);
    // What `stripe trigger payment_intent.succeeded` creates in the shared test account: no Customer, no metadata.
    const triggered = `pi_cli_${randomUUID()}`;
    strangerPayments = [
      {
        paymentIntentId: triggered,
        customerId: null,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe PaymentIntent field name.
        shape: { payment_method: 'pm_card_visa', description: '(created by Stripe CLI)', metadata: {} },
      },
    ];
    try {
      await scanPass(reconciliationService('sk_test_cash_cli_trigger'));
    } finally {
      resetServedSources();
    }
    const cases = await casesFor('missing_local_payment', triggered);
    expect(cases).toEqual([expect.objectContaining({ accountId: null, state: 'open', livemode: false })]);
    expect(cases[0]?.evidence).toHaveProperty('customer', null);
    await expectCollectionAdmitted(await freshAccount());
  });

  it('should treat a live-mode stranger payment as unattributed operator work', async () => {
    const value = await fixture();
    serveOwnSources(value.purchase);
    // A Dashboard payment or Payment Link: a Customer Tau never bound, and no Tau metadata.
    const customerId = `cus_unknown_${randomUUID()}`;
    const paymentIntentId = `pi_live_stranger_${randomUUID()}`;
    strangerPayments = [{ paymentIntentId, customerId, livemode: true }];
    try {
      await scanPass(reconciliationService('sk_test_cash_live_stranger', true));
    } finally {
      resetServedSources();
    }
    expect(await casesFor('missing_local_payment', paymentIntentId)).toEqual([
      expect.objectContaining({ accountId: null, state: 'open', livemode: true }),
    ]);
    // Live mode backs one environment, so an environment stamp proves nothing and the scan never reads the Customer.
    expect(customerReads.get(customerId)).toBeUndefined();
    await expectCollectionAdmitted(await freshAccount());
  });

  it('should open unattributed refund_unresolved and dispute_unresolved for a foreign payment and refuse nobody', async () => {
    const value = await fixture();
    serveOwnSources(value.purchase);
    const foreignCharge = `ch_foreign_${randomUUID()}`;
    const refundId = `re_foreign_${randomUUID()}`;
    const disputeId = `dp_foreign_${randomUUID()}`;
    foreignRefunds = [{ refundId, chargeId: foreignCharge }];
    foreignDisputes = new Map([[disputeId, foreignCharge]]);
    extraBalances = [
      {
        id: `txn_${disputeId}`,
        object: 'balance_transaction',
        type: 'dispute',
        source: disputeId,
        currency: 'usd',
        amount: -500,
        fee: 0,
        net: -500,
        status: 'available',
        created: Math.floor(Date.now() / 1000),
      },
    ];
    try {
      await scanPass(reconciliationService('sk_test_cash_foreign_reversal'));
    } finally {
      resetServedSources();
    }
    expect([
      ...(await casesFor('refund_unresolved', refundId)),
      ...(await casesFor('dispute_unresolved', disputeId)),
    ]).toEqual([
      expect.objectContaining({ kind: 'refund_unresolved', accountId: null, state: 'open' }),
      expect.objectContaining({ kind: 'dispute_unresolved', accountId: null, state: 'open' }),
    ]);
    await expectCollectionAdmitted(value.accountId);
    await expectCollectionAdmitted(await freshAccount());
  });

  it('should resolve the unattributed dispute row once the dispute read succeeds and attributes it', async () => {
    const value = await fixture();
    serveOwnSources(value.purchase);
    const disputeId = `dp_${value.purchase.proof.chargeId}`;
    // One withdrawal movement, re-read unchanged by the second pass's overlapping window.
    extraBalances = [
      {
        id: `txn_dispute_${value.purchase.proof.chargeId}`,
        object: 'balance_transaction',
        type: 'dispute',
        source: disputeId,
        currency: 'usd',
        amount: -500,
        fee: 0,
        net: -500,
        status: 'available',
        created: Math.floor(Date.now() / 1000),
      },
    ];
    const reconciliation = reconciliationService('sk_test_cash_dispute_retry');
    try {
      failDisputeRead = true;
      await scanPass(reconciliation);
      expect(await casesFor('dispute_unresolved', disputeId)).toEqual([
        expect.objectContaining({ dedupeKey: `dispute_unresolved:${disputeId}`, accountId: null, state: 'open' }),
      ]);
      failDisputeRead = false;
      await scanPass(reconciliation, 1000);
    } finally {
      resetServedSources();
    }
    const rows = await casesFor('dispute_unresolved', disputeId);
    expect(rows.filter((row) => row.state === 'open')).toEqual([
      expect.objectContaining({
        dedupeKey: `dispute_unresolved:${disputeId}:${value.accountId}`,
        accountId: value.accountId,
      }),
    ]);
    expect(rows.find((row) => row.dedupeKey === `dispute_unresolved:${disputeId}`)).toMatchObject({
      state: 'resolved',
      resolutionEvidence: { disposition: 'attributed', sourceId: disputeId, successorAccountId: value.accountId },
    });
  });

  it('should keep a deleted Tau customer attributed', async () => {
    const value = await fixture();
    serveOwnSources(value.purchase);
    const accountId = await freshAccount();
    const customerId = `cus_deleted_${randomUUID()}`;
    // Closure deletes the Stripe Customer but keeps the binding row.
    await database.insert(schema.billingStripeCustomer).values({
      id: `customer-${randomUUID()}`,
      accountId,
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
      stripeCustomerId: customerId,
    });
    const paymentIntentId = `pi_deleted_customer_${randomUUID()}`;
    strangerPayments = [{ paymentIntentId, customerId, deleted: true }];
    try {
      await scanPass(reconciliationService('sk_test_cash_deleted_customer'));
    } finally {
      resetServedSources();
    }
    expect(await casesFor('missing_local_payment', paymentIntentId)).toEqual([
      expect.objectContaining({ accountId, state: 'open' }),
    ]);
  });

  it('should open an attributed missing_local_payment when the scan sees a Tau payment before the local write, and resolve it next pass', async () => {
    const accountId = await freshAccount();
    // A prepared purchase on a bound Customer: Stripe has the payment, the local paid write has not landed.
    const purchase = await seedPaidPurchase({
      database,
      accountId,
      environment: 'development',
      atoms: 1000n,
      prepared: true,
      stripeAccountId: cashStripeAccountId,
    });
    serveOwnSources(purchase);
    const reconciliation = reconciliationService('sk_test_cash_early_scan');
    try {
      await scanPass(reconciliation);
      expect(await casesFor('missing_local_payment', purchase.proof.paymentIntentId)).toEqual([
        expect.objectContaining({ accountId, state: 'open' }),
      ]);
      await expectCollectionAdmitted(await freshAccount());
      await database
        .update(schema.billingPurchase)
        .set({ state: 'paid_unfulfilled', ...purchase.proof })
        .where(eq(schema.billingPurchase.id, purchase.purchaseId));
      const claimId = cashClaimId(purchase.proof.chargeId);
      await database.insert(schema.billingStripeSource).values({
        id: claimId,
        environment: 'development',
        stripeAccountId: cashStripeAccountId,
        livemode: false,
        sourceType: 'cash_charge',
        sourceId: purchase.proof.chargeId,
        state: 'processing',
        generation: 1n,
        leaseUntil: sql`transaction_timestamp() + interval '30 seconds'`,
      });
      const paid = { accountId, purchase, claimId };
      await apply(paid, evidence(paid, '0'));
      await scanPass(reconciliation, 1000);
    } finally {
      resetServedSources();
    }
    const resolved = await casesFor('missing_local_payment', purchase.proof.paymentIntentId);
    expect(resolved).toEqual([expect.objectContaining({ accountId, state: 'resolved' })]);
    expect(resolved[0]?.resolutionEvidence).toMatchObject({ disposition: 'source_qualified' });
  });

  it('reclaims an expired running scan owned by the configured provider account', async () => {
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_reclaim', fixtureUrl: stripeOrigin });
    const reconciliation = new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    listCashSources = false;
    const scanId = await reconciliation.createScan({
      environment: 'development',
      currency: 'usd',
      lookbackStart: new Date('2020-01-01T00:00:00Z'),
      windowStart: new Date('2020-01-02T00:00:00Z'),
      windowEnd: new Date('2020-01-03T00:00:00Z'),
    });
    await database
      .update(schema.billingCashScan)
      .set({ state: 'running', generation: 7n, leaseUntil: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(schema.billingCashScan.id, scanId));
    const [forced] = await database.select().from(schema.billingCashScan).where(eq(schema.billingCashScan.id, scanId));
    expect(forced).toMatchObject({ stripeAccountId: cashStripeAccountId, state: 'running', generation: 7n });
    const foreign = new BillingCashReconciliationService({ database: runtimeDatabase }, stripe, {
      environment: 'development',
      stripeAccountId: 'acct_cash_other',
      livemode: false,
    });
    await expect(foreign.runScan({ scanId, maximumPagesPerStream: 3 })).rejects.toThrow('cash_scan_claimed');
    let [scan] = await database.select().from(schema.billingCashScan).where(eq(schema.billingCashScan.id, scanId));
    expect(scan).toMatchObject({ state: 'running', generation: 7n, attempts: 0 });
    await expect(reconciliation.runScan({ scanId, maximumPagesPerStream: 3 })).resolves.toEqual({
      status: 'complete',
    });
    [scan] = await database.select().from(schema.billingCashScan).where(eq(schema.billingCashScan.id, scanId));
    expect(scan).toMatchObject({ state: 'complete', generation: 8n, attempts: 1 });
  });
});
