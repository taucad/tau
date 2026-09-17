/* eslint-disable @typescript-eslint/naming-convention -- Loopback fixtures preserve exact Stripe field names. */
import { paymentOfferSnapshotSchema } from '#api/billing/billing-payment-contract.js';
import type { PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { qualifiedMeterContracts, validateCommercialPolicy } from '#api/billing/billing-policy.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { fulfillPaidFixture, seedPaidPurchase } from '#testing/billing-payment.fixture.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl || !process.env['BILLING_TEST_OWNED']) {
  throw new Error('Use the isolated billing launcher');
}
const admin = postgres(databaseUrl, { max: 2 });
const runtime = postgres(databaseUrl, { max: 2, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(admin, { schema });
const runtimeDatabase = drizzle(runtime, { schema });
afterAll(async () => Promise.all([admin.end(), runtime.end()]));

describe('owned Stripe closure and auth deletion', () => {
  it('recovers unknown original creation and a lost cancellation response without a second DELETE', async () => {
    const id = randomUUID();
    const accountId = `closure-account-${id}`;
    const authUserId = `closure-user-${id}`;
    await database
      .insert(schema.user)
      .values({ id: authUserId, name: 'Closure fixture', email: `${id}@example.test`, emailVerified: true });
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
    await database
      .insert(schema.billingOwnerBinding)
      .values({ id: `owner-${id}`, accountId, environment: 'development', authUserId });
    const purchase = await seedPaidPurchase({ database, accountId, environment: 'development', atoms: 100n });
    const [paid] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, purchase.purchaseId));
    if (!paid?.customerBindingId || !paid.offerSnapshot) {
      throw new Error('Missing controlled Customer');
    }
    const bindingId = paid.customerBindingId;
    const { customerId } = purchase.proof.paidEvidence;
    const subscriptionId = `subscription-${id}`;
    const remoteId = `sub_${id}`;
    const sessionId = `cs_${id}`;
    await database.insert(schema.subscription).values({
      id: subscriptionId,
      accountId,
      environment: 'development',
      plan: 'pro',
      referenceId: `financial:${id}`,
      customerBindingId: bindingId,
      requestId: id,
      requestHash: '1'.repeat(64),
      offerSnapshot: {
        ...paymentOfferSnapshotSchema.parse(paid.offerSnapshot),
        term: 'month',
        ceilingCreditAtoms: '200',
      },
      slotState: 'pending',
      status: 'incomplete',
    });
    await database.insert(schema.billingProviderLeg).values({
      id: `creation-${id}`,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      subscriptionId,
      kind: 'checkout_subscription',
      requestId: id,
      requestHash: '2'.repeat(64),
      request: { client_reference_id: subscriptionId },
      idempotencyKey: `create:${id}`,
      state: 'dispatched',
      dispatchStartedAt: new Date(),
      providerObjectId: sessionId,
    });
    await expect(database.delete(schema.user).where(eq(schema.user.id, authUserId))).rejects.toThrow();
    let canceled = false;
    let cancelCount = 0;
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'DELETE' && url.pathname === `/v1/subscriptions/${remoteId}`) {
        cancelCount += 1;
        canceled = true;
        response.destroy();
        return;
      }
      const body =
        url.pathname === `/v1/checkout/sessions/${sessionId}`
          ? {
              id: sessionId,
              object: 'checkout.session',
              mode: 'subscription',
              status: 'complete',
              livemode: false,
              customer: customerId,
              client_reference_id: subscriptionId,
              metadata: { tau_subscription_id: subscriptionId },
              subscription: remoteId,
            }
          : url.pathname === `/v1/subscriptions/${remoteId}`
            ? {
                id: remoteId,
                object: 'subscription',
                livemode: false,
                customer: customerId,
                metadata: { tau_subscription_id: subscriptionId },
                status: canceled ? 'canceled' : 'active',
                canceled_at: canceled ? 1_788_650_000 : null,
              }
            : { error: { type: 'invalid_request_error', message: 'Unexpected closure fixture request' } };
      response.writeHead('error' in body ? 404 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Missing fixture address');
      }
      const stripe = createBillingStripeClient({
        secretKey: 'sk_test_closure_fixture',
        fixtureUrl: `http://127.0.0.1:${address.port}/`,
      });
      const service = new BillingAccountClosureService(
        { database: runtimeDatabase },
        {
          recoverAndCancel: async (input) =>
            recoverAndCancelStripeClosure(
              {
                database: runtimeDatabase,
                sourceStripe: stripe,
                protectedStripe: stripe,
                environment: 'development',
                stripeAccountId: 'acct_fixture',
                livemode: false,
              },
              input,
            ),
        },
        'development',
      );
      const closure = await service.prepare({ authUserId, requestId: `close-${id}` });
      await expect(service.prepareForAuthDeletion({ authUserId })).resolves.toBeUndefined();
      await expect(service.reconcile({ closureId: closure.closureId, accountId })).rejects.toThrow();
      expect(cancelCount).toBe(1);
      await database
        .update(schema.billingAccountClosure)
        .set({ leaseUntil: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(schema.billingAccountClosure.id, closure.closureId));
      await service.reconcile({ closureId: closure.closureId, accountId });
      expect(cancelCount).toBe(1);
      const [owned] = await database
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, subscriptionId));
      expect(owned).toMatchObject({ stripeSubscriptionId: remoteId, slotState: 'ended' });
      await database.delete(schema.user).where(eq(schema.user.id, authUserId));
      const [tombstone] = await database
        .select()
        .from(schema.billingOwnerBinding)
        .where(
          and(eq(schema.billingOwnerBinding.accountId, accountId), eq(schema.billingOwnerBinding.id, `owner-${id}`)),
        );
      expect(tombstone?.authUserId).toBeNull();
      await service.reconcile({ closureId: closure.closureId, accountId });
      const [closed] = await database
        .select()
        .from(schema.billingAccountClosure)
        .where(eq(schema.billingAccountClosure.id, closure.closureId));
      expect(closed?.state).toBe('closed');
      expect(closed?.authDeletedAt).toBeInstanceOf(Date);
      expect(cancelCount).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  });
});

/* Late-obligation fixture: one loopback provider for the retained subscription, invoice and refund legs. */
const lateStripeAccountId = 'acct_closure_late';
const lateRequests: string[] = [];
let lateSubscription: { readonly remoteId: string; readonly localId: string; readonly customerId: string } | undefined;
let lateSubscriptionCanceled = false;
let lateCancelCount = 0;
let lateInvoice:
  | {
      readonly invoiceId: string;
      readonly remoteSubscriptionId: string;
      readonly customerId: string;
      readonly periodStart: number;
      readonly periodEnd: number;
    }
  | undefined;
let lateRefund:
  | {
      readonly chargeId: string;
      readonly paymentIntentId: string;
      readonly customerId: string;
      readonly refundId: string;
      readonly intentId: string;
      readonly reversalCaseId: string;
    }
  | undefined;
let lateRefundVisible = false;
let lateRefundPosts = 0;

const lateSubscriptionBody = (): unknown => ({
  id: lateSubscription?.remoteId,
  object: 'subscription',
  customer: lateSubscription?.customerId,
  livemode: false,
  status: lateSubscriptionCanceled ? 'canceled' : 'active',
  canceled_at: lateSubscriptionCanceled ? 1_788_650_200 : null,
  metadata: { tau_subscription_id: lateSubscription?.localId },
  items: {
    object: 'list',
    data: [{ id: 'si_closure_late', price: { id: 'price_monthly', product: 'prod_monthly' } }],
    has_more: false,
    url: '/v1/subscription_items',
  },
});

const lateRefundBody = (): unknown => ({
  id: lateRefund?.refundId,
  object: 'refund',
  amount: 250,
  balance_transaction: 'txn_closure_refund',
  charge: lateRefund?.chargeId,
  currency: 'usd',
  created: Math.floor(Date.now() / 1000),
  customer: lateRefund?.customerId,
  metadata: { tau_refund_intent_id: lateRefund?.intentId, tau_reversal_case_id: lateRefund?.reversalCaseId },
  payment_intent: lateRefund?.paymentIntentId,
  status: 'succeeded',
});

// oxlint-disable-next-line eslint/complexity -- one loopback fixture enumerates the distinct retained provider reads
const lateBody = (method: string, url: URL): unknown => {
  const invoice = lateInvoice;
  const refund = lateRefund;
  if (lateSubscription !== undefined && url.pathname === `/v1/subscriptions/${lateSubscription.remoteId}`) {
    if (method === 'DELETE') {
      lateCancelCount += 1;
      lateSubscriptionCanceled = true;
    }
    return lateSubscriptionBody();
  }
  if (invoice !== undefined && url.pathname === `/v1/invoices/${invoice.invoiceId}`) {
    return {
      id: invoice.invoiceId,
      object: 'invoice',
      amount_due: 2000,
      amount_paid: 2000,
      amount_remaining: 0,
      billing_reason: 'subscription_cycle',
      currency: 'usd',
      customer: invoice.customerId,
      customer_address: {
        city: 'Wellington',
        country: 'NZ',
        line1: '1 Willis Street',
        postal_code: '6011',
      },
      livemode: false,
      parent: {
        type: 'subscription_details',
        subscription_details: { subscription: invoice.remoteSubscriptionId },
      },
      status: 'paid',
      subtotal: 2000,
      total: 2000,
      automatic_tax: { status: 'complete' },
      total_taxes: [{ amount: 0 }],
    };
  }
  if (invoice !== undefined && url.pathname === `/v1/invoices/${invoice.invoiceId}/lines`) {
    return {
      object: 'list',
      data: [
        {
          id: `il_${invoice.invoiceId}`,
          object: 'line_item',
          amount: 2000,
          amount_excluding_tax: 2000,
          currency: 'usd',
          parent: {
            type: 'subscription_item_details',
            subscription_item_details: {
              proration: false,
              subscription: invoice.remoteSubscriptionId,
              subscription_item: 'si_closure_late',
            },
          },
          period: { start: invoice.periodStart, end: invoice.periodEnd },
          pricing: { type: 'price_details', price_details: { price: 'price_monthly', product: 'prod_monthly' } },
          quantity: 1,
          subtotal: 2000,
        },
      ],
      has_more: false,
      url: `/v1/invoices/${invoice.invoiceId}/lines`,
    };
  }
  if (invoice !== undefined && url.pathname === '/v1/invoice_payments') {
    return {
      object: 'list',
      data: [
        {
          id: `inpay_${invoice.invoiceId}`,
          object: 'invoice_payment',
          amount_paid: 2000,
          currency: 'usd',
          payment: { type: 'payment_intent', payment_intent: `pi_${invoice.invoiceId}` },
          status: 'paid',
          status_transitions: { canceled_at: null, paid_at: 1_788_650_100 },
        },
      ],
      has_more: false,
      url: '/v1/invoice_payments',
    };
  }
  if (invoice !== undefined && url.pathname === `/v1/payment_intents/pi_${invoice.invoiceId}`) {
    return {
      id: `pi_${invoice.invoiceId}`,
      object: 'payment_intent',
      amount: 2000,
      amount_capturable: 0,
      amount_received: 2000,
      created: 1_788_650_000,
      currency: 'usd',
      customer: invoice.customerId,
      latest_charge: `ch_${invoice.invoiceId}`,
      livemode: false,
      metadata: {},
      payment_method: 'pm_closure_late',
      status: 'succeeded',
    };
  }
  if (invoice !== undefined && url.pathname === `/v1/charges/ch_${invoice.invoiceId}`) {
    return {
      id: `ch_${invoice.invoiceId}`,
      object: 'charge',
      amount: 2000,
      amount_captured: 2000,
      amount_refunded: 0,
      created: 1_788_650_001,
      currency: 'usd',
      customer: invoice.customerId,
      livemode: false,
      paid: true,
      payment_intent: `pi_${invoice.invoiceId}`,
      payment_method: 'pm_closure_late',
      payment_method_details: { card: { brand: 'visa', last4: '4242' } },
      refunded: false,
      status: 'succeeded',
    };
  }
  if (refund !== undefined && url.pathname === `/v1/payment_intents/${refund.paymentIntentId}`) {
    return {
      id: refund.paymentIntentId,
      object: 'payment_intent',
      amount: 500,
      amount_received: 500,
      created: Math.floor(Date.now() / 1000),
      currency: 'usd',
      customer: refund.customerId,
      latest_charge: refund.chargeId,
      livemode: false,
      status: 'succeeded',
    };
  }
  if (refund !== undefined && url.pathname === `/v1/charges/${refund.chargeId}`) {
    return {
      id: refund.chargeId,
      object: 'charge',
      amount: 500,
      amount_captured: 500,
      created: Math.floor(Date.now() / 1000),
      currency: 'usd',
      customer: refund.customerId,
      livemode: false,
      paid: true,
      payment_intent: refund.paymentIntentId,
      status: 'succeeded',
    };
  }
  if (refund !== undefined && url.pathname === `/v1/refunds/${refund.refundId}`) {
    return lateRefundBody();
  }
  if (url.pathname === '/v1/refunds') {
    const visible = lateRefundVisible && url.searchParams.get('charge') === refund?.chargeId;
    return { object: 'list', data: visible ? [lateRefundBody()] : [], has_more: false, url: '/v1/refunds' };
  }
  if (url.pathname === '/v1/disputes') {
    return { object: 'list', data: [], has_more: false, url: '/v1/disputes' };
  }
  return { error: { type: 'invalid_request_error', message: `Missing late closure fixture for ${url.pathname}` } };
};

const lateServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const method = request.method ?? '';
  lateRequests.push(`${method} ${url.pathname}`);
  if (method === 'POST' && url.pathname === '/v1/refunds') {
    lateRefundPosts += 1;
    request.resume();
    request.on('end', () => request.socket.destroy());
    return;
  }
  const body = lateBody(method, url);
  response.writeHead(typeof body === 'object' && body !== null && 'error' in body ? 404 : 200, {
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
});

let lateStripe: ReturnType<typeof createBillingStripeClient>;
let lateClosure: BillingAccountClosureService;
let lateLedger: CreditLedgerService;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    lateServer.listen(0, '127.0.0.1', resolve);
  });
  const address = lateServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Late closure fixture address is unavailable');
  }
  lateStripe = createBillingStripeClient({
    secretKey: 'sk_test_closure_late',
    fixtureUrl: `http://127.0.0.1:${address.port}/`,
  });
  lateLedger = new CreditLedgerService(
    { database: runtimeDatabase },
    new BillingPolicyService({ database: runtimeDatabase }),
  );
  lateClosure = new BillingAccountClosureService(
    { database: runtimeDatabase },
    {
      recoverAndCancel: async (input) =>
        recoverAndCancelStripeClosure(
          {
            database: runtimeDatabase,
            sourceStripe: lateStripe,
            protectedStripe: lateStripe,
            environment: 'development',
            stripeAccountId: lateStripeAccountId,
            livemode: false,
          },
          input,
        ),
    },
    'development',
  );
});

afterAll(
  async () =>
    new Promise<void>((resolve, reject) => {
      lateServer.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    }),
);

/** Drives the real closure flow to a closed tombstone through an actual `public.user` deletion. */
async function closeAndDeleteOwner(input: {
  readonly authUserId: string;
  readonly accountId: string;
  readonly expectedCancellations: number;
}): Promise<{ readonly closureId: string; readonly closedAt: Date }> {
  const cancelsBefore = lateCancelCount;
  const prepared = await lateClosure.prepare({ authUserId: input.authUserId, requestId: `close-${input.authUserId}` });
  expect(prepared.state).toBe('ready_for_auth_deletion');
  await lateClosure.reconcile({ closureId: prepared.closureId, accountId: input.accountId });
  expect(lateCancelCount - cancelsBefore).toBe(input.expectedCancellations);
  await expect(lateClosure.prepareForAuthDeletion({ authUserId: input.authUserId })).resolves.toBeUndefined();
  await database.delete(schema.user).where(eq(schema.user.id, input.authUserId));
  expect(await lateClosure.reconcile({ closureId: prepared.closureId, accountId: input.accountId })).toBe('processed');
  const [closed] = await database
    .select()
    .from(schema.billingAccountClosure)
    .where(eq(schema.billingAccountClosure.id, prepared.closureId));
  const [account] = await database
    .select()
    .from(schema.creditAccount)
    .where(eq(schema.creditAccount.id, input.accountId));
  const bindings = await database
    .select()
    .from(schema.billingOwnerBinding)
    .where(eq(schema.billingOwnerBinding.accountId, input.accountId));
  expect(closed).toMatchObject({ state: 'closed' });
  expect(closed?.authDeletedAt).toBeInstanceOf(Date);
  expect(account?.status).toBe('closed');
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.authUserId).toBeNull();
  expect(bindings[0]?.revokedAt).toBeInstanceOf(Date);
  if (!(closed?.closedAt instanceof Date)) {
    throw new Error('Closed tombstone is missing its immutable closure time');
  }
  return { closureId: prepared.closureId, closedAt: closed.closedAt };
}

/** Re-reads the tombstone and proves no later obligation reopened it or recreated an owner. */
async function expectTombstoneUnchanged(input: {
  readonly closureId: string;
  readonly accountId: string;
  readonly closedAt: Date;
}): Promise<void> {
  const [closure] = await database
    .select()
    .from(schema.billingAccountClosure)
    .where(eq(schema.billingAccountClosure.id, input.closureId));
  const [account] = await database
    .select()
    .from(schema.creditAccount)
    .where(eq(schema.creditAccount.id, input.accountId));
  const bindings = await database
    .select()
    .from(schema.billingOwnerBinding)
    .where(eq(schema.billingOwnerBinding.accountId, input.accountId));
  expect(closure).toMatchObject({ state: 'closed', closedAt: input.closedAt });
  expect(account?.status).toBe('closed');
  expect(bindings).toHaveLength(1);
  expect(bindings[0]?.authUserId).toBeNull();
}

describe('retained obligations after closure and auth deletion', () => {
  it('settles a usage hold admitted before closure and admits no new funded work', async () => {
    const id = randomUUID();
    const authUserId = `closure-usage-${id}`;
    const sku = `closure-sku-${id}`;
    const meterContractId = `closure-meter-${id}`;
    const spendBudgetId = `closure-spend-${id}`;
    const riskBudgetId = `closure-risk-${id}`;
    qualifiedMeterContracts.set(meterContractId, new Set(['uncached_input:']));
    const validated = validateCommercialPolicy({
      schemaVersion: 1,
      environment: 'development',
      policyVersion: `closure-${id}`,
      markupBps: 0,
      fleet: { minimumSchemaVersion: 1, meterContractIds: [meterContractId] },
      rates: [
        {
          rateId: `closure-rate-${id}`,
          meterContractId,
          dimension: 'uncached_input',
          tier: null,
          unit: 'token',
          referenceNumeratorPicoUsd: '1',
          denominatorUnits: '1',
          retailOverride: { numeratorCreditAtoms: '1', denominatorUnits: '1' },
        },
      ],
      routes: [
        {
          routeId: `closure-route-${id}`,
          sku,
          meterContractId,
          rateIds: [`closure-rate-${id}`],
          enabled: true,
          spendBudgetId,
          riskBudgetId,
        },
      ],
      offers: [
        {
          offerId: `closure-pro-${id}`,
          kind: 'pro_monthly',
          currency: 'usd',
          principalMinor: '1',
          grantCreditAtoms: '1',
          ceilingCreditAtoms: '1',
        },
        {
          offerId: `closure-top-${id}`,
          kind: 'top_up',
          currency: 'usd',
          minimumPrincipalMinor: '1',
          maximumPrincipalMinor: '1',
          creditAtomsPerPrincipalMinor: '1',
        },
      ],
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    });
    await database.insert(schema.billingBudgetFunding).values([
      {
        id: `closure-spend-funding-${id}`,
        environment: 'development',
        kind: 'spend',
        scope: id,
        fundedLifetime: 1_000_000n,
      },
      {
        id: `closure-risk-funding-${id}`,
        environment: 'development',
        kind: 'risk',
        scope: id,
        fundedLifetime: 1_000_000n,
      },
    ]);
    await database.insert(schema.billingBudget).values([
      {
        id: spendBudgetId,
        environment: 'development',
        fundingId: `closure-spend-funding-${id}`,
        kind: 'spend',
        scope: id,
        periodStart: new Date('2020-01-01T00:00:00.000Z'),
        periodEnd: new Date('2030-01-01T00:00:00.000Z'),
        quantum: 'pico_usd',
        approvedCap: 1_000_000n,
      },
      {
        id: riskBudgetId,
        environment: 'development',
        fundingId: `closure-risk-funding-${id}`,
        kind: 'risk',
        scope: id,
        periodStart: new Date('2020-01-01T00:00:00.000Z'),
        periodEnd: new Date('2030-01-01T00:00:00.000Z'),
        quantum: 'pico_usd',
        approvedCap: 1_000_000n,
      },
    ]);
    await seedBillingFixturePolicy({
      database,
      policy: validated.canonicalContent,
      activationId: `closure-activation-${id}`,
    });
    await database
      .insert(schema.user)
      .values({ id: authUserId, name: 'Closure usage', email: `${authUserId}@example.test`, emailVerified: true });
    const accountId = await lateLedger.ensureAccountBinding({ environment: 'development', authUserId });
    await database
      .update(schema.creditAccount)
      .set({ purchasedAtoms: 100_000n })
      .where(eq(schema.creditAccount.id, accountId));
    const admissionInput = {
      environment: 'development',
      authUserId,
      surface: 'chat',
      attemptKey: `closure-attempt-${id}`,
      requestDigest: `sha256:closure-attempt-${id}`,
      requestKeyVersion: 1,
      category: 'llm',
      modelId: 'closure-model',
      activity: 'test',
      sku,
      maximumQuantities: [{ dimension: 'uncached_input', tier: null, quantity: 100_000n }],
      supplierMaximumPicoUsd: 100_000n,
      replica: { schemaVersion: 1, meterContractIds: [meterContractId] },
      executionDeadline: new Date(Date.now() + 300_000),
    } as const;
    const admitted = await lateLedger.admitOperation(admissionInput);
    if (admitted.status !== 'admitted') {
      throw new Error(`Usage hold was not admitted: ${JSON.stringify(admitted)}`);
    }
    const [held] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, accountId));
    expect(held?.purchasedHeldAtoms).toBe(100_000n);
    const tombstone = await closeAndDeleteOwner({ authUserId, accountId, expectedCancellations: 0 });
    const receipt = await lateLedger.terminalizeOperation({
      operationId: admitted.operationId,
      accountId,
      requestDigest: admissionInput.requestDigest,
      expectedGeneration: admitted.generation,
      evidence: {
        kind: 'final_usage',
        usageOccurredAt: new Date(),
        meterItems: [{ dimension: 'uncached_input', tier: null, quantity: 60_000n }],
      },
      resolvedAt: new Date(),
    });
    expect(receipt).toMatchObject({ customerState: 'settled', chargedAtoms: 60_000n });
    const [settled] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, accountId));
    expect(settled).toMatchObject({ purchasedAtoms: 40_000n, purchasedHeldAtoms: 0n });
    const journals = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.operationId, admitted.operationId));
    expect(journals).toHaveLength(1);
    await expect(
      lateLedger.admitOperation({
        ...admissionInput,
        attemptKey: `closure-after-${id}`,
        requestDigest: `sha256:closure-after-${id}`,
      }),
    ).rejects.toThrow();
    await expectTombstoneUnchanged({ ...tombstone, accountId });
  });

  it('grants an already-processing renewal invoice exactly once after the owner is deleted', async () => {
    const id = randomUUID();
    const authUserId = `closure-renewal-${id}`;
    const bindingId = `closure-renewal-binding-${id}`;
    const localSubscriptionId = `closure-renewal-subscription-${id}`;
    const remoteSubscriptionId = `sub_${id}`;
    const remoteCustomerId = `cus_${id}`;
    const invoiceId = `in_${id}`;
    await database
      .insert(schema.user)
      .values({ id: authUserId, name: 'Closure renewal', email: `${authUserId}@example.test`, emailVerified: true });
    const accountId = await lateLedger.ensureAccountBinding({ environment: 'development', authUserId });
    const offer: PaymentOfferSnapshot = {
      version: 'payment-offer-v1',
      policyId: `closure-policy-${id}`,
      offerId: 'pro-monthly',
      environment: 'development',
      accountId,
      stripeAccountId: lateStripeAccountId,
      livemode: false,
      currency: 'usd',
      principalMinor: '2000',
      taxMinor: '0',
      grossMinor: '2000',
      maximumGrossMinor: '2000',
      creditAtoms: '20000000',
      ceilingCreditAtoms: '40000000',
      stripePriceId: 'price_monthly',
      stripeProductId: null,
      quantity: 1,
      term: 'month',
      taxBasis: 'synthetic_local_zero_tax',
      paymentMethod: null,
    };
    await database.insert(schema.billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId: lateStripeAccountId,
      livemode: false,
      stripeCustomerId: remoteCustomerId,
    });
    await database.insert(schema.subscription).values({
      id: localSubscriptionId,
      plan: 'pro',
      referenceId: `financial:${id}`,
      stripeCustomerId: remoteCustomerId,
      stripeSubscriptionId: remoteSubscriptionId,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      requestId: id,
      requestHash: '3'.repeat(64),
      offerSnapshot: offer,
      slotState: 'current',
      status: 'active',
    });
    // The renewal source was already claimed by a worker that died before applying it.
    const sourceId = randomUUID();
    await database.insert(schema.billingStripeSource).values({
      id: sourceId,
      environment: 'development',
      stripeAccountId: lateStripeAccountId,
      livemode: false,
      sourceType: 'invoice',
      sourceId: invoiceId,
      state: 'processing',
      generation: 1n,
      leaseUntil: sql`clock_timestamp() - interval '1 minute'`,
    });
    await database.insert(schema.stripeEventInbox).values({
      id: randomUUID(),
      eventId: `evt_${id}`,
      environment: 'development',
      stripeAccountId: lateStripeAccountId,
      livemode: false,
      apiVersion: '2026-07-29.dahlia',
      eventType: 'invoice.paid',
      sourceType: 'invoice',
      sourceId: invoiceId,
      eventCreatedAt: new Date(),
      payloadDigest: '4'.repeat(64),
      evidence: {},
    });
    lateSubscription = { remoteId: remoteSubscriptionId, localId: localSubscriptionId, customerId: remoteCustomerId };
    lateSubscriptionCanceled = false;
    lateCancelCount = 0;
    lateInvoice = {
      invoiceId,
      remoteSubscriptionId,
      customerId: remoteCustomerId,
      periodStart: 1_780_272_000,
      periodEnd: 1_782_950_400,
    };
    const tombstone = await closeAndDeleteOwner({ authUserId, accountId, expectedCancellations: 1 });
    const [canceled] = await database
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, localSubscriptionId));
    expect(canceled).toMatchObject({ slotState: 'ended', status: 'canceled' });
    const payments = new BillingPaymentsService(
      { database: runtimeDatabase },
      lateStripe,
      lateStripe,
      {
        environment: 'development',
        stripeAccountId: lateStripeAccountId,
        livemode: false,
        uiOrigin: 'http://127.0.0.1:3000',
        webhookSecret: 'whsec_closure_late_1234567890',
        collection: null,
      },
      new BillingPolicyService({ database: runtimeDatabase }),
      lateLedger,
      new BillingCashService({ database: runtimeDatabase }, lateStripe, lateStripe, lateLedger, {
        environment: 'development',
        stripeAccountId: lateStripeAccountId,
        livemode: false,
      }),
    );
    const postsBefore = lateRequests.filter((entry) => entry.startsWith('POST ')).length;
    const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [claimed] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, sourceId));
    expect(recovery, JSON.stringify({ error: claimed?.errorCode, requests: lateRequests.slice(-12) })).toMatchObject({
      processed: [sourceId],
      pending: [],
      failed: [],
    });
    const [period] = await database
      .select()
      .from(schema.billingPeriod)
      .where(eq(schema.billingPeriod.invoiceId, invoiceId));
    expect(period).toMatchObject({ state: 'fulfilled', accountId, grantedAtoms: 20_000_000n });
    const grants = await database
      .select()
      .from(schema.creditTransaction)
      .where(eq(schema.creditTransaction.periodId, period?.id ?? invoiceId));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ kind: 'period_grant', accountDeltaAtoms: 20_000_000n });
    expect(lateRequests.filter((entry) => entry.startsWith('POST ')).length).toBe(postsBefore);
    expect(lateCancelCount).toBe(1);
    await expectTombstoneUnchanged({ ...tombstone, accountId });
    lateInvoice = undefined;
    lateSubscription = undefined;
  });

  it('releases and reverses a reviewed refund prepared before closure after the owner is deleted', async () => {
    const id = randomUUID();
    const authUserId = `closure-refund-${id}`;
    await database
      .insert(schema.user)
      .values({ id: authUserId, name: 'Closure refund', email: `${authUserId}@example.test`, emailVerified: true });
    const accountId = await lateLedger.ensureAccountBinding({ environment: 'development', authUserId });
    const purchase = await seedPaidPurchase({
      database,
      accountId,
      environment: 'development',
      atoms: 1000n,
      stripeAccountId: lateStripeAccountId,
    });
    await fulfillPaidFixture({
      database,
      ledger: lateLedger,
      accountId,
      causeId: purchase.purchaseId,
      source: 'purchased',
    });
    const [reversalCase] = await database
      .select()
      .from(schema.billingReversalCase)
      .where(eq(schema.billingReversalCase.purchaseId, purchase.purchaseId));
    if (reversalCase === undefined) {
      throw new Error('Paid cash did not open a reversal case');
    }
    const cash = new BillingCashService({ database: runtimeDatabase }, lateStripe, lateStripe, lateLedger, {
      environment: 'development',
      stripeAccountId: lateStripeAccountId,
      livemode: false,
    });
    const prepared = await cash.prepareReviewedRefund({
      environment: 'development',
      accountId,
      reversalCaseId: reversalCase.id,
      requestedPrincipalMinor: '250',
      requestedTaxMinor: '0',
      approvedMaximumGrossMinor: '250',
      reviewActorId: 'operator_fixture',
      reviewedAt: new Date(),
      reason: 'requested refund',
      requestId: randomUUID(),
    });
    lateRefund = {
      chargeId: purchase.proof.chargeId,
      paymentIntentId: purchase.proof.paymentIntentId,
      customerId: purchase.proof.paidEvidence.customerId,
      refundId: `re_${id}`,
      intentId: prepared.intentId,
      reversalCaseId: reversalCase.id,
    };
    lateRefundVisible = false;
    lateRefundPosts = 0;
    // The operator's approved dispatch loses its response; the hold must survive closure.
    await expect(
      cash.executeReviewedRefund({
        environment: 'development',
        intentId: prepared.intentId,
        reviewActorId: 'operator_fixture',
        capability: {
          qualification: 'protected-refund',
          environment: 'development',
          stripeAccountId: lateStripeAccountId,
          livemode: false,
        },
      }),
    ).rejects.toThrow();
    const [reserved] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, accountId));
    expect(reserved).toMatchObject({ purchasedAtoms: 1000n, purchasedHeldAtoms: 500n });
    const tombstone = await closeAndDeleteOwner({ authUserId, accountId, expectedCancellations: 0 });
    lateRefundVisible = true;
    await expect(
      cash.recoverRefundIntent({ environment: 'development', intentId: prepared.intentId, maximumPages: 3 }),
    ).resolves.toMatchObject({ status: 'applied', refundId: `re_${id}` });
    expect(lateRefundPosts).toBe(1);
    const [reversed] = await database.select().from(schema.creditAccount).where(eq(schema.creditAccount.id, accountId));
    expect(reversed).toMatchObject({ purchasedAtoms: 500n, purchasedHeldAtoms: 0n });
    const [intent] = await database
      .select()
      .from(schema.billingRefundIntent)
      .where(eq(schema.billingRefundIntent.id, prepared.intentId));
    expect(intent).toMatchObject({ state: 'succeeded', holdState: 'applied' });
    await expectTombstoneUnchanged({ ...tombstone, accountId });
    lateRefund = undefined;
    lateRefundVisible = false;
  });
});

describe('closure expiry of an unpaid subscription Checkout', () => {
  it('expires an open unpaid Checkout on exact evidence and never claims closed before deletion', async () => {
    const id = randomUUID();
    const accountId = `expire-account-${id}`;
    const authUserId = `expire-user-${id}`;
    const bindingId = `expire-customer-${id}`;
    const subscriptionId = `expire-subscription-${id}`;
    const sessionId = `cs_${id}`;
    const customerId = `cus_${id}`;
    await database
      .insert(schema.user)
      .values({ id: authUserId, name: 'Expire fixture', email: `${id}@example.test`, emailVerified: true });
    await database.insert(schema.creditAccount).values({ id: accountId, environment: 'development' });
    await database
      .insert(schema.billingOwnerBinding)
      .values({ id: `expire-owner-${id}`, accountId, environment: 'development', authUserId });
    await database.insert(schema.billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId: 'acct_expire_fixture',
      livemode: false,
      stripeCustomerId: customerId,
    });
    await database.insert(schema.subscription).values({
      id: subscriptionId,
      accountId,
      environment: 'development',
      plan: 'pro',
      referenceId: `financial:${id}`,
      customerBindingId: bindingId,
      requestId: id,
      requestHash: '5'.repeat(64),
      offerSnapshot: {
        version: 'payment-offer-v1',
        policyId: `expire-policy-${id}`,
        offerId: 'pro-monthly',
        environment: 'development',
        accountId,
        stripeAccountId: 'acct_expire_fixture',
        livemode: false,
        currency: 'usd',
        principalMinor: '2000',
        taxMinor: '0',
        grossMinor: '2000',
        maximumGrossMinor: '2000',
        creditAtoms: '20000000',
        ceilingCreditAtoms: '40000000',
        stripePriceId: 'price_monthly',
        stripeProductId: null,
        quantity: 1,
        term: 'month',
        taxBasis: 'synthetic_local_zero_tax',
        paymentMethod: null,
      },
      slotState: 'pending',
      status: 'incomplete',
    });
    await database.insert(schema.billingProviderLeg).values({
      id: `expire-creation-${id}`,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      subscriptionId,
      kind: 'checkout_subscription',
      requestId: id,
      requestHash: '6'.repeat(64),
      request: { client_reference_id: subscriptionId },
      idempotencyKey: `expire-create:${id}`,
      state: 'dispatched',
      dispatchStartedAt: new Date(),
      providerObjectId: sessionId,
    });
    let expired = false;
    let expirePosts = 0;
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'POST' && url.pathname === `/v1/checkout/sessions/${sessionId}/expire`) {
        expirePosts += 1;
        expired = true;
      }
      const body =
        url.pathname === `/v1/checkout/sessions/${sessionId}` ||
        url.pathname === `/v1/checkout/sessions/${sessionId}/expire`
          ? {
              id: sessionId,
              object: 'checkout.session',
              mode: 'subscription',
              status: expired ? 'expired' : 'open',
              livemode: false,
              customer: customerId,
              client_reference_id: subscriptionId,
              metadata: { tau_subscription_id: subscriptionId },
              payment_status: 'unpaid',
              payment_intent: null,
              subscription: null,
            }
          : { error: { type: 'invalid_request_error', message: `Missing expiry fixture for ${url.pathname}` } };
      response.writeHead('error' in body ? 404 : 200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('Missing expiry fixture address');
      }
      const stripe = createBillingStripeClient({
        secretKey: 'sk_test_closure_expire',
        fixtureUrl: `http://127.0.0.1:${address.port}/`,
      });
      const service = new BillingAccountClosureService(
        { database: runtimeDatabase },
        {
          recoverAndCancel: async (input) =>
            recoverAndCancelStripeClosure(
              {
                database: runtimeDatabase,
                sourceStripe: stripe,
                protectedStripe: stripe,
                environment: 'development',
                stripeAccountId: 'acct_expire_fixture',
                livemode: false,
              },
              input,
            ),
        },
        'development',
      );
      const closure = await service.prepare({ authUserId, requestId: `expire-${id}` });
      expect(await service.reconcile({ closureId: closure.closureId, accountId })).toBe('processed');
      expect(expirePosts).toBe(1);
      const legs = await database
        .select()
        .from(schema.billingProviderLeg)
        .where(eq(schema.billingProviderLeg.subscriptionId, subscriptionId));
      const creation = legs.find((leg) => leg.kind === 'checkout_subscription');
      expect(creation).toMatchObject({ state: 'expired', providerObjectId: sessionId });
      expect(creation?.terminalEvidence).toMatchObject({
        version: 'stripe-subscription-checkout-expired-v1',
        status: 'expired',
        subscriptionId: null,
        paymentIntentId: null,
        paymentStatus: 'unpaid',
      });
      expect(legs.find((leg) => leg.kind === 'subscription_cancel')).toMatchObject({ state: 'no_charge' });
      const [ended] = await database
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, subscriptionId));
      expect(ended).toMatchObject({ slotState: 'ended', status: 'canceled', stripeSubscriptionId: null });
      const [pendingClosure] = await database
        .select()
        .from(schema.billingAccountClosure)
        .where(eq(schema.billingAccountClosure.id, closure.closureId));
      expect(pendingClosure).toMatchObject({ state: 'ready_for_auth_deletion', closedAt: null, authDeletedAt: null });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
    }
  });
});
