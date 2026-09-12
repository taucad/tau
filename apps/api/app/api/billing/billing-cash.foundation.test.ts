/* oxlint-disable eslint/complexity -- The controlled HTTP fixture enumerates distinct provider endpoints. */
/* eslint-disable @typescript-eslint/naming-convention -- Controlled Stripe fixture bodies retain provider field names. */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { cashOccurredAt, cashProjectionDigest } from '#api/billing/billing-payment-contract.js';
import type {
  CashProjectionEvidence,
  PaidPaymentEvidence,
  PaymentOfferSnapshot,
} from '#api/billing/billing-payment-contract.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import type { QualifiedCashSource } from '#api/billing/billing-cash.service.js';
import { BillingTaxService } from '#api/billing/billing-tax.service.js';
import { BillingCashReconciliationService } from '#api/billing/billing-cash-reconciliation.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
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
let refundPosts = 0;
let serveRefund = false;
let refundStatus: 'succeeded' | 'failed' = 'succeeded';
let refundCreated: number | undefined;
let serveDispute = false;
let disputeReturned = false;
let disputeCreated = 1;
let listCashSources = false;
let invalidBalance = false;
let failPaymentIntentRead = false;
let lostPaymentIntentId = '';

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
    metadata: { tau_refund_intent_id: value.intentId, tau_reversal_case_id: value.reversalCaseId },
    payment_intent: value.paymentIntentId,
    status: refundStatus,
  };
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'POST' && url.pathname === '/v1/refunds') {
    refundPosts += 1;
    request.resume();
    request.on('end', () => request.socket.destroy());
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/refunds') {
    response.end(
      JSON.stringify({ object: 'list', data: serveRefund ? [refund] : [], has_more: false, url: '/v1/refunds' }),
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
        data: listCashSources ? [paymentIntent, ...(lostPaymentIntentId === '' ? [] : [lostPaymentIntent])] : [],
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
      currency: 'usd',
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
        data: listCashSources ? [balance, ...(lostPaymentIntentId === '' ? [] : canceling)] : [],
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
  if (request.method === 'GET' && url.pathname === `/v1/disputes/dp_${value.chargeId}`) {
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
    referenceId: `financial:${subscriptionId}`,
    stripeCustomerId: customerId,
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
  return new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
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
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
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

  it('recovers accepted refund and returned dispute cash after a retained financial tombstone', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    const [cashCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, value.purchase.purchaseId));
    if (cashCase === undefined) {
      throw new Error('Cash reversal case was not created');
    }
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_cash_fixture',
      fixtureUrl: stripeOrigin,
      requestTimeout: 500,
    });
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    const reviewedAt = new Date();
    const prepared = await cash.prepareReviewedRefund({
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      requestedPrincipalMinor: '250',
      requestedTaxMinor: '0',
      approvedMaximumGrossMinor: '250',
      reviewActorId: 'operator_fixture',
      reviewedAt,
      reason: 'requested refund',
      requestId: randomUUID(),
    });
    const activeRefund = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: prepared.intentId,
      reversalCaseId: cashCase.id,
    };
    refundFixture = activeRefund;
    refundPosts = 0;
    serveRefund = true;
    serveDispute = true;
    disputeReturned = true;
    disputeCreated = Math.floor(Date.now() / 1000);
    await expect(
      cash.executeReviewedRefund({
        environment: 'development',
        intentId: prepared.intentId,
        reviewActorId: 'operator_fixture',
        capability: {
          qualification: 'controlled-local-protected-refund',
          environment: 'development',
          stripeAccountId: cashStripeAccountId,
          livemode: false,
        },
      }),
    ).rejects.toThrow();
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
    const recovered = await cash.recoverRefundIntent({
      environment: 'development',
      intentId: prepared.intentId,
      maximumPages: 3,
    });
    expect(recovered).toMatchObject({ status: 'applied', refundId: activeRefund.refundId });
    serveDispute = false;
    disputeReturned = false;
    const [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    const [intent] = await database
      .select()
      .from(schema.billingRefundIntent)
      .where(eq(schema.billingRefundIntent.id, prepared.intentId));
    expect(refundPosts).toBe(1);
    expect(account).toMatchObject({ purchasedAtoms: 500n, purchasedHeldAtoms: 0n });
    expect(intent).toMatchObject({ state: 'succeeded', holdState: 'applied' });
  });

  it('should date a zero-loss reviewed refund at the provider refund time', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    await database
      .update(schema.billingStripeSource)
      .set({ state: 'done', leaseUntil: null })
      .where(eq(schema.billingStripeSource.id, value.claimId));
    const cashCase = await reversalCaseOf(value);
    const cash = cashService('sk_test_cash_zero_loss');
    const prepared = await cash.prepareReviewedRefund({
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      requestedPrincipalMinor: '250',
      requestedTaxMinor: '0',
      approvedMaximumGrossMinor: '250',
      reviewActorId: 'operator_fixture',
      reviewedAt: new Date('2020-01-02T03:04:05.000Z'),
      reason: 'refund the provider never moved',
      requestId: randomUUID(),
    });
    const failedRefund = {
      customerId: value.purchase.proof.paidEvidence.customerId,
      paymentIntentId: value.purchase.proof.paymentIntentId,
      chargeId: value.purchase.proof.chargeId,
      refundId: `re_${randomUUID()}`,
      intentId: prepared.intentId,
      reversalCaseId: cashCase.id,
    };
    refundFixture = failedRefund;
    serveRefund = true;
    refundStatus = 'failed';
    refundCreated = Math.floor(Date.now() / 1000) - 600;
    try {
      await expect(
        cash.executeReviewedRefund({
          environment: 'development',
          intentId: prepared.intentId,
          reviewActorId: 'operator_fixture',
          capability: {
            qualification: 'controlled-local-protected-refund',
            environment: 'development',
            stripeAccountId: cashStripeAccountId,
            livemode: false,
          },
        }),
      ).rejects.toThrow();
      const recovered = await cash.recoverRefundIntent({
        environment: 'development',
        intentId: prepared.intentId,
        maximumPages: 3,
      });
      expect(recovered).toMatchObject({ status: 'applied', refundId: failedRefund.refundId });
      const [applied] = await database
        .select()
        .from(schema.billingReversalCase)
        .where(eq(schema.billingReversalCase.id, cashCase.id));
      expect(applied?.projectionObservedAt).toEqual(new Date(refundCreated * 1000));
      const [intent] = await database
        .select()
        .from(schema.billingRefundIntent)
        .where(eq(schema.billingRefundIntent.id, prepared.intentId));
      expect(intent).toMatchObject({ state: 'failed', holdState: 'released' });
      const [account] = await database
        .select()
        .from(schema.creditAccount)
        .where(eq(schema.creditAccount.id, value.accountId));
      expect(account).toMatchObject({ purchasedAtoms: 1000n, purchasedHeldAtoms: 0n, debtAtoms: 0n });
    } finally {
      serveRefund = false;
      refundStatus = 'succeeded';
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
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
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
    const stripe = createBillingStripeClient({ secretKey: 'sk_test_cash_scan', fixtureUrl: stripeOrigin });
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
    expect(cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'paid_unfulfilled_recovery', accountId: value.accountId, state: 'open' }),
        expect.objectContaining({ kind: 'gross_fee_net_mismatch', accountId: null, state: 'open' }),
      ]),
    );
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
      environment: 'development',
      stripeAccountId: cashStripeAccountId,
      livemode: false,
    });
    await expect(cash.assertNewCollectionScope(value.accountId)).rejects.toThrow('cash_scope_attention');
    const independentAccountId = randomUUID();
    await database.insert(schema.creditAccount).values({ id: independentAccountId, environment: 'development' });
    const independentCash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
      environment: 'development',
      stripeAccountId: 'acct_cash_independent',
      livemode: false,
    });
    await expect(independentCash.assertNewCollectionScope(independentAccountId)).resolves.toBeUndefined();
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

  it('freezes one reviewed refund intent per request and reserves only unheld refundable value', async () => {
    const value = await fixture();
    await apply(value, evidence(value, '0'));
    const cashCase = await reversalCaseOf(value);
    const cash = cashService('sk_test_cash_prepare');
    const request = {
      environment: 'development',
      accountId: value.accountId,
      reversalCaseId: cashCase.id,
      requestedPrincipalMinor: '250',
      requestedTaxMinor: '0',
      approvedMaximumGrossMinor: '250',
      reviewActorId: 'operator_prepare',
      reviewedAt: new Date(),
      reason: 'reviewed refund',
      requestId: randomUUID(),
    } as const;
    const first = await cash.prepareReviewedRefund(request);
    expect(await cash.prepareReviewedRefund(request)).toEqual(first);
    await expect(
      cash.prepareReviewedRefund({ ...request, requestedPrincipalMinor: '200', approvedMaximumGrossMinor: '200' }),
    ).rejects.toThrow('refund_replay_mismatch');
    const second = await cash.prepareReviewedRefund({
      ...request,
      requestId: randomUUID(),
      requestedPrincipalMinor: '150',
      approvedMaximumGrossMinor: '150',
    });
    const intents = await database
      .select()
      .from(schema.billingRefundIntent)
      .where(eq(schema.billingRefundIntent.reversalCaseId, cashCase.id));
    expect(intents).toHaveLength(2);
    expect(intents.find((intent) => intent.id === first.intentId)).toMatchObject({ holdAtoms: 500n });
    expect(intents.find((intent) => intent.id === second.intentId)).toMatchObject({ holdAtoms: 300n });
    let [account] = await database
      .select()
      .from(schema.creditAccount)
      .where(eq(schema.creditAccount.id, value.accountId));
    expect(account).toMatchObject({ purchasedAtoms: 1000n, purchasedHeldAtoms: 800n });
    await expect(cash.prepareReviewedRefund({ ...request, requestId: randomUUID() })).rejects.toThrow(
      'refund_principal_exceeds_source',
    );
    const spent = await fixture();
    await apply(spent, evidence(spent, '0'));
    const spentCase = await reversalCaseOf(spent);
    await database
      .update(schema.creditAccount)
      .set({ purchasedAtoms: 100n })
      .where(eq(schema.creditAccount.id, spent.accountId));
    await expect(
      cash.prepareReviewedRefund({
        ...request,
        accountId: spent.accountId,
        reversalCaseId: spentCase.id,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow('refund_hold_insufficient');
    [account] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, spent.accountId));
    expect(account).toMatchObject({ purchasedAtoms: 100n, purchasedHeldAtoms: 0n });
    const unreserved = await database
      .select()
      .from(schema.billingRefundIntent)
      .where(eq(schema.billingRefundIntent.reversalCaseId, spentCase.id));
    expect(unreserved).toHaveLength(0);
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
    const foreign = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
      environment: 'development',
      stripeAccountId: 'acct_cash_other',
      livemode: false,
    });
    await expect(foreign.qualifyChargeSource(input)).rejects.toThrow('cash_source_scope');
    const live = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
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
