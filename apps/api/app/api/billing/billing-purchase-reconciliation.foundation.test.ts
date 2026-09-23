/* eslint-disable @typescript-eslint/naming-convention -- Controlled Stripe fixture bodies retain provider field names. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { assertNewCollectionCashScope } from '#api/billing/billing-cash-reconciliation.service.js';
import { BillingPurchaseReconciliationService } from '#api/billing/billing-purchase-reconciliation.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { seedPaidPurchase } from '#testing/billing-payment.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (databaseUrl === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use isolated billing launcher');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const stripeAccountId = 'acct_purchase_reconciliation';
const sourceObjects = new Map<string, Record<string, unknown>>();
let stripeOrigin = '';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const object = sourceObjects.get(`${request.method ?? 'GET'} ${url.pathname}`);
  response.setHeader('Content-Type', 'application/json');
  if (object === undefined) {
    response.writeHead(404).end(JSON.stringify({ error: { message: 'fixture object absent' } }));
    return;
  }
  response.end(JSON.stringify(object));
});

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Purchase fixture address unavailable');
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

function reconciliation(secretKey: string): BillingPurchaseReconciliationService {
  return new BillingPurchaseReconciliationService(
    { database: runtimeDatabase },
    createBillingStripeClient({ secretKey, fixtureUrl: stripeOrigin, requestTimeout: 2000 }),
    { environment: 'development', stripeAccountId, livemode: false },
  );
}

async function seedScan(offsetMilliseconds = 0): Promise<string> {
  const id = randomUUID();
  const now = Date.now() + offsetMilliseconds;
  await database.insert(schema.billingCashScan).values({
    id,
    environment: 'development',
    stripeAccountId,
    livemode: false,
    currency: 'usd',
    lookbackStart: new Date(now - 7_200_000),
    windowStart: new Date(now - 3_600_000),
    windowEnd: new Date(now + 3_600_000),
  });
  return id;
}

async function run(scanId: string, secretKey: string) {
  return reconciliation(secretKey).runScan({
    scanId,
    maximumObligations: 50,
    maximumGrants: 50,
    maximumSubscriptions: 50,
  });
}

async function caseRows(kind: string, sourceId: string) {
  return database
    .select()
    .from(schema.billingFinancialCase)
    .where(and(eq(schema.billingFinancialCase.kind, kind), eq(schema.billingFinancialCase.sourceId, sourceId)));
}

async function seedKnownLeg(input: {
  readonly accountId: string;
  readonly purchaseId: string;
  readonly kind: 'payment_intent' | 'checkout_payment';
  readonly providerObjectId: string;
}): Promise<string> {
  const [purchase] = await database
    .select({ customerBindingId: schema.billingPurchase.customerBindingId })
    .from(schema.billingPurchase)
    .where(eq(schema.billingPurchase.id, input.purchaseId));
  const customerBindingId = purchase?.customerBindingId;
  if (customerBindingId === null || customerBindingId === undefined) {
    throw new Error('Fixture purchase is missing its Customer binding');
  }
  const id = randomUUID();
  await database.insert(schema.billingProviderLeg).values({
    id,
    accountId: input.accountId,
    environment: 'development',
    customerBindingId,
    purchaseId: input.purchaseId,
    kind: input.kind,
    requestId: id,
    requestHash: '0'.repeat(64),
    request: { fixture: true },
    idempotencyKey: `idem-${id}`,
    state: 'known',
    dispatchStartedAt: new Date(),
    providerObjectId: input.providerObjectId,
  });
  return id;
}

/** A subscription slot, its paid period and the single valid period grant the ledger would have written. */
async function seedEntitlement(sourceStatus: string) {
  const accountId = randomUUID();
  const suffix = randomUUID();
  const customerBindingId = `customer-${suffix}`;
  const subscriptionId = `subscription-${suffix}`;
  const periodId = randomUUID();
  const receiptId = randomUUID();
  const customerId = `cus_${suffix}`;
  const invoiceId = `in_${suffix}`;
  const stripeSubscriptionId = `sub_${suffix}`;
  const paymentIntentId = `pi_${suffix}`;
  const chargeId = `ch_${suffix}`;
  const paidAt = new Date();
  const offerSnapshot: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'purchase-reconciliation-policy',
    offerId: 'pro-monthly',
    environment: 'development',
    accountId,
    stripeAccountId,
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '500',
    creditAtoms: '1000',
    ceilingCreditAtoms: '1000',
    stripePriceId: 'price_purchase_reconciliation',
    stripeProductId: null,
    quantity: 1,
    term: 'month',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: null,
  };
  const paidEvidence: PaidPaymentEvidence = {
    version: 'stripe-paid-v1',
    stripeAccountId,
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
    sourceDigest: '1'.repeat(64),
    paidAt: paidAt.toISOString(),
    paymentMethod: null,
  };
  await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development', planAtoms: 1000n });
  await database.insert(schema.billingStripeCustomer).values({
    id: customerBindingId,
    accountId,
    environment: 'development',
    stripeAccountId,
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
    offerSnapshot,
    slotState: 'current',
    status: 'active',
    cancelAtPeriodEnd: false,
  });
  // `require_paid_receipt` is deferred: the period, its journal and the fulfilment commit together.
  await database.transaction(async (tx) => {
    await tx.insert(schema.billingPeriod).values({
      id: periodId,
      accountId,
      sourceIdentity: `period:${periodId}`,
      creditAtoms: 1000n,
      periodStart: new Date(paidAt.getTime() - 1000),
      periodEnd: new Date(paidAt.getTime() + 86_400_000),
      subscriptionId,
      invoiceId,
      offerSnapshot,
      paidEvidence,
      state: 'verified',
      paidAt,
    });
    await tx.insert(schema.creditTransaction).values({
      id: receiptId,
      accountId,
      revision: 1n,
      kind: 'period_grant',
      periodId,
      stripeAccountId,
      livemode: false,
      paymentIntentId,
      chargeId,
      promoDeltaAtoms: 0n,
      planDeltaAtoms: 1000n,
      purchasedDeltaAtoms: 0n,
      debtDeltaAtoms: 0n,
      accountDeltaAtoms: 1000n,
      balanceAfterAtoms: 1000n,
      occurredAt: paidAt,
    });
    await tx
      .update(schema.billingPeriod)
      .set({ state: 'fulfilled', receiptId, grantedAtoms: 1000n, fulfilledRevision: 1n })
      .where(eq(schema.billingPeriod.id, periodId));
    await tx.update(schema.creditAccount).set({ revision: 1n }).where(eq(schema.creditAccount.id, accountId));
  });
  sourceObjects.set(`GET /v1/subscriptions/${stripeSubscriptionId}`, {
    id: stripeSubscriptionId,
    object: 'subscription',
    status: sourceStatus,
    customer: customerId,
    livemode: false,
    cancel_at_period_end: false,
    created: Math.floor(paidAt.getTime() / 1000),
    items: { object: 'list', data: [], has_more: false, url: '/v1/subscription_items' },
  });
  sourceObjects.set(`GET /v1/invoices/${invoiceId}`, {
    id: invoiceId,
    object: 'invoice',
    status: 'paid',
    livemode: false,
    customer: customerId,
    currency: 'usd',
    amount_paid: 500,
    parent: { type: 'subscription_details', subscription_details: { subscription: stripeSubscriptionId } },
  });
  return { accountId, subscriptionId, periodId, receiptId, invoiceId, stripeSubscriptionId };
}

describe('purchase and entitlement reconciliation foundation', () => {
  it('cases an acknowledged obligation that never became a grant and pauses only that account', async () => {
    const accountId = randomUUID();
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
    const purchase = await seedPaidPurchase({
      database,
      accountId,
      environment: 'development',
      atoms: 1000n,
      stripeAccountId,
    });
    const legId = await seedKnownLeg({
      accountId,
      purchaseId: purchase.purchaseId,
      kind: 'payment_intent',
      providerObjectId: purchase.proof.paymentIntentId,
    });
    sourceObjects.set(`GET /v1/payment_intents/${purchase.proof.paymentIntentId}`, {
      id: purchase.proof.paymentIntentId,
      object: 'payment_intent',
      status: 'succeeded',
      livemode: false,
      currency: 'usd',
      amount: 500,
      amount_received: 500,
      customer: `cus_${purchase.purchaseId}`,
      latest_charge: purchase.proof.chargeId,
      created: Math.floor(Date.now() / 1000),
    });
    const independentAccountId = randomUUID();
    await database.insert(schema.creditAccount).values({ id: independentAccountId, environment: 'development' });

    const result = await run(await seedScan(), 'sk_test_purchase_obligation');

    expect(result.status).toBe('complete');
    expect(await caseRows('unfulfilled_purchase_obligation', legId)).toEqual([
      expect.objectContaining({
        accountId,
        state: 'open',
        owner: 'billing-operations',
        nextStep: 'qualify_obligation_and_fulfil_or_refund',
        currency: 'usd',
        sourceType: 'billing_provider_leg',
      }),
    ]);
    const scope = { environment: 'development', stripeAccountId, livemode: false } as const;
    await expect(assertNewCollectionCashScope({ database: runtimeDatabase }, scope, accountId)).rejects.toThrow(
      'cash_scope_attention',
    );
    await expect(
      assertNewCollectionCashScope({ database: runtimeDatabase }, scope, independentAccountId),
    ).resolves.toBeUndefined();
  });

  it('cases a paid Checkout obligation whose local purchase never left its pending state', async () => {
    const accountId = randomUUID();
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
    const purchase = await seedPaidPurchase({
      database,
      accountId,
      environment: 'development',
      atoms: 1000n,
      prepared: true,
      stripeAccountId,
    });
    const sessionId = `cs_${purchase.purchaseId}`;
    const legId = await seedKnownLeg({
      accountId,
      purchaseId: purchase.purchaseId,
      kind: 'checkout_payment',
      providerObjectId: sessionId,
    });
    sourceObjects.set(`GET /v1/checkout/sessions/${sessionId}`, {
      id: sessionId,
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      livemode: false,
      payment_intent: purchase.proof.paymentIntentId,
      created: Math.floor(Date.now() / 1000),
    });

    const result = await run(await seedScan(), 'sk_test_purchase_checkout');

    expect(result.status).toBe('complete');
    const [obligation] = await caseRows('unfulfilled_purchase_obligation', legId);
    expect(obligation).toEqual(expect.objectContaining({ accountId, state: 'open' }));
    expect(obligation?.evidence).toMatchObject({
      purchaseState: 'prepared',
      settledPaymentIntentId: purchase.proof.paymentIntentId,
    });
  });

  it('cases a promotion grant whose issuance the database never reconciles against its journal', async () => {
    const accountId = randomUUID();
    const scope = `promotion-${accountId}`;
    const fundingId = randomUUID();
    const budgetId = randomUUID();
    const issuanceId = randomUUID();
    const grantId = randomUUID();
    const periodStart = new Date(Date.now() - 86_400_000);
    const periodEnd = new Date(Date.now() + 86_400_000);
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
    await database.insert(schema.billingBudgetFunding).values({
      id: fundingId,
      environment: 'development',
      kind: 'promotion',
      scope,
      fundedLifetime: 10_000n,
    });
    await database.insert(schema.billingBudget).values({
      id: budgetId,
      environment: 'development',
      fundingId,
      kind: 'promotion',
      scope,
      periodStart,
      periodEnd,
      quantum: 'atoms',
      approvedCap: 10_000n,
    });
    await database.insert(schema.billingPromotionIssuance).values({
      id: issuanceId,
      environment: 'development',
      accountId,
      promotionProgramId: 'launch',
      periodStart,
      periodEnd,
      budgetId,
      atoms: 500n,
    });
    await database.insert(schema.creditTransaction).values({
      id: grantId,
      accountId,
      revision: 1n,
      kind: 'promotion_grant',
      promotionIssuanceId: issuanceId,
      promoDeltaAtoms: 1000n,
      planDeltaAtoms: 0n,
      purchasedDeltaAtoms: 0n,
      debtDeltaAtoms: 0n,
      accountDeltaAtoms: 1000n,
      balanceAfterAtoms: 1000n,
      occurredAt: new Date(),
    });

    const result = await run(await seedScan(), 'sk_test_purchase_grant_cause');

    expect(result.status).toBe('complete');
    const [invalidCause] = await caseRows('invalid_grant_cause', grantId);
    expect(invalidCause).toEqual(
      expect.objectContaining({ accountId, state: 'open', nextStep: 'qualify_grant_cause_and_correct' }),
    );
    expect(invalidCause?.evidence).toMatchObject({
      reason: 'promotion_cause_atoms_mismatch',
      grantKind: 'promotion_grant',
    });
  });

  it('keeps one grant per period when a duplicate issuance is attempted and opens no case for the survivor', async () => {
    const entitlement = await seedEntitlement('active');
    const duplicate = await database
      .insert(schema.creditTransaction)
      .values({
        id: randomUUID(),
        accountId: entitlement.accountId,
        revision: 2n,
        kind: 'period_grant',
        periodId: entitlement.periodId,
        stripeAccountId,
        livemode: false,
        paymentIntentId: `pi_duplicate_${entitlement.periodId}`,
        chargeId: `ch_duplicate_${entitlement.periodId}`,
        promoDeltaAtoms: 0n,
        planDeltaAtoms: 1000n,
        purchasedDeltaAtoms: 0n,
        debtDeltaAtoms: 0n,
        accountDeltaAtoms: 1000n,
        balanceAfterAtoms: 2000n,
        occurredAt: new Date(),
      })
      .then(
        () => 'accepted',
        (error: unknown) => String(error instanceof Error ? (error.cause ?? error) : error),
      );
    expect(duplicate).toContain('credit_transaction_period');

    const result = await run(await seedScan(), 'sk_test_purchase_duplicate');

    expect(result.status).toBe('complete');
    const grants = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.periodId, entitlement.periodId));
    expect(grants).toHaveLength(1);
    expect(await caseRows('invalid_grant_cause', entitlement.receiptId)).toEqual([]);
    expect(await caseRows('entitlement_source_disagreement', entitlement.periodId)).toEqual([]);
  });

  it('cases an entitled local slot the source reports as cancelled and repeats without duplicating it', async () => {
    const entitlement = await seedEntitlement('canceled');

    const first = await run(await seedScan(), 'sk_test_purchase_entitlement');
    const opened = await caseRows('entitlement_source_disagreement', entitlement.subscriptionId);
    const replay = await run(await seedScan(1_800_000), 'sk_test_purchase_entitlement_replay');
    const repeated = await caseRows('entitlement_source_disagreement', entitlement.subscriptionId);

    expect([first.status, replay.status]).toEqual(['complete', 'complete']);
    expect(opened).toEqual([
      expect.objectContaining({
        accountId: entitlement.accountId,
        state: 'open',
        sourceType: 'subscription',
        nextStep: 'qualify_source_entitlement_and_realign',
      }),
    ]);
    expect(opened[0]?.evidence).toMatchObject({ sourceStatus: 'canceled', localStatus: 'active' });
    expect(opened[0]?.evidence['reasons']).toEqual(
      expect.arrayContaining(['subscription_status_mismatch', 'entitled_slot_without_collecting_source']),
    );
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.id).toBe(opened[0]?.id);
    expect(repeated[0]?.firstSeenAt).toEqual(opened[0]?.firstSeenAt);
    expect(await caseRows('entitlement_source_disagreement', entitlement.periodId)).toEqual([]);
  });
});
