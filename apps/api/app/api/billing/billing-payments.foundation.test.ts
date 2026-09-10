/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures retain provider field names. */
import { fulfillPaidFixture } from '#testing/billing-payment.fixture.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingOwnerBinding,
  billingPeriod,
  billingProviderLeg,
  billingPurchase,
  billingStripeCustomer,
  billingStripeSource,
  creditAccount,
  creditTransaction,
  stripeEventInbox,
  subscription,
  user,
} from '#database/schema.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import {
  createBillingStripeClient,
  fetchStripeInvoiceEvidence,
  retrieveStripePaymentEvidence,
} from '#api/billing/billing-stripe.js';
import { qualifySubscriptionInvoice } from '#api/billing/billing-payments.recovery.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}

const client = postgres(databaseUrl, { max: 4, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 4, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(client, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const policy = new BillingPolicyService({ database: runtimeDatabase });
const ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
const requests: string[] = [];
const stripeAccountId = 'acct_payments_foundation';
let latestCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
let latestCustomerMetadata: Record<string, string> = {};
let paymentFixture:
  | { purchaseId: string; providerLegId: string; customerBindingId: string; customerId: string }
  | undefined;
let paymentStatus: 'requires_action' | 'succeeded' = 'succeeded';
let paymentIntentFixtureId = 'pi_foundation_paid';
let paymentChargeFixtureId = 'ch_foundation_paid';
let ambiguousCustomerSearch = false;
let invoiceFixture:
  | {
      invoiceId: string;
      subscriptionId: string;
      customerId: string;
      paid: boolean;
      periodStart: number;
      periodEnd: number;
      subscriptionStatus?: 'active' | 'canceled';
    }
  | undefined;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  requests.push(`${request.method ?? ''} ${url.pathname}`);
  if (request.method === 'GET' && ['/v1/refunds', '/v1/disputes'].includes(url.pathname)) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [], has_more: false, url: url.pathname }));
    return;
  }
  if (url.pathname === '/v1/customers' && request.method === 'POST') {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      const form = new URLSearchParams(chunks.join(''));
      latestCustomerId = `cus_${randomUUID().replaceAll('-', '')}`;
      latestCustomerMetadata = {
        tau_account_id: form.get('metadata[tau_account_id]') ?? '',
        tau_customer_binding_id: form.get('metadata[tau_customer_binding_id]') ?? '',
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ id: latestCustomerId, object: 'customer', livemode: false, metadata: latestCustomerMetadata }),
      );
    });
    return;
  }
  const paymentIntent =
    paymentFixture === undefined
      ? undefined
      : {
          id: paymentIntentFixtureId,
          object: 'payment_intent',
          amount: 537,
          amount_capturable: 0,
          amount_received: paymentStatus === 'succeeded' ? 537 : 0,
          created: 1_788_650_000,
          currency: 'usd',
          customer: paymentFixture.customerId,
          latest_charge: paymentStatus === 'succeeded' ? paymentChargeFixtureId : null,
          livemode: false,
          metadata: {
            tau_purchase_id: paymentFixture.purchaseId,
            tau_provider_leg_id: paymentFixture.providerLegId,
            tau_customer_binding_id: paymentFixture.customerBindingId,
          },
          payment_method: 'pm_foundation',
          status: paymentStatus,
        };
  const invoice = invoiceFixture;
  const invoicePaymentIntentId = invoice === undefined ? '' : `pi_${invoice.invoiceId}`;
  const invoiceChargeId = invoice === undefined ? '' : `ch_${invoice.invoiceId}`;
  const invoiceObject =
    invoice === undefined
      ? undefined
      : {
          id: invoice.invoiceId,
          object: 'invoice',
          amount_due: 2000,
          amount_paid: invoice.paid ? 2000 : 0,
          amount_remaining: invoice.paid ? 0 : 2000,
          billing_reason: 'subscription_cycle',
          currency: 'usd',
          customer: invoice.customerId,
          livemode: false,
          parent: { type: 'subscription_details', subscription_details: { subscription: invoice.subscriptionId } },
          status: invoice.paid ? 'paid' : 'open',
          subtotal: 2000,
          total: 2000,
        };
  const invoiceLine =
    invoice === undefined
      ? undefined
      : {
          id: `il_${invoice.invoiceId}`,
          object: 'line_item',
          amount: 2000,
          amount_excluding_tax: 2000,
          currency: 'usd',
          parent: {
            type: 'subscription_item_details',
            subscription_item_details: {
              proration: false,
              subscription: invoice.subscriptionId,
              subscription_item: 'si_foundation',
            },
          },
          period: { start: invoice.periodStart, end: invoice.periodEnd },
          pricing: { type: 'price_details', price_details: { price: 'price_monthly', product: 'prod_monthly' } },
          quantity: 1,
          subtotal: 2000,
        };
  const body =
    url.pathname === '/v1/customers/search'
      ? {
          object: 'search_result',
          data: ambiguousCustomerSearch
            ? [
                { id: 'cus_ambiguous_1', object: 'customer', livemode: false, metadata: {} },
                { id: 'cus_ambiguous_2', object: 'customer', livemode: false, metadata: {} },
              ]
            : [{ id: latestCustomerId, object: 'customer', livemode: false, metadata: latestCustomerMetadata }],
          has_more: false,
        }
      : url.pathname === `/v1/customers/${latestCustomerId}`
        ? {
            id: latestCustomerId,
            object: 'customer',
            deleted: false,
            livemode: false,
            invoice_settings: {
              default_payment_method: {
                id: 'pm_foundation',
                object: 'payment_method',
                customer: latestCustomerId,
                type: 'card',
                card: { brand: 'visa', last4: '4242' },
              },
            },
          }
        : url.pathname === '/v1/payment_intents' && paymentIntent !== undefined
          ? paymentIntent
          : url.pathname === `/v1/payment_intents/${paymentIntentFixtureId}` && paymentIntent !== undefined
            ? paymentIntent
            : invoice !== undefined && url.pathname === `/v1/invoices/${invoice.invoiceId}`
              ? invoiceObject
              : invoice !== undefined && url.pathname === `/v1/invoices/${invoice.invoiceId}/lines`
                ? {
                    object: 'list',
                    data: [invoiceLine],
                    has_more: false,
                    url: `/v1/invoices/${invoice.invoiceId}/lines`,
                  }
                : invoice !== undefined && url.pathname === '/v1/invoice_payments'
                  ? {
                      object: 'list',
                      data: invoice.paid
                        ? [
                            {
                              id: `inpay_${invoice.invoiceId}`,
                              object: 'invoice_payment',
                              amount_paid: 2000,
                              currency: 'usd',
                              payment: { type: 'payment_intent', payment_intent: invoicePaymentIntentId },
                              status: 'paid',
                              status_transitions: { canceled_at: null, paid_at: 1_788_650_100 },
                            },
                          ]
                        : [],
                      has_more: false,
                      url: '/v1/invoice_payments',
                    }
                  : invoice !== undefined && url.pathname === `/v1/subscriptions/${invoice.subscriptionId}`
                    ? {
                        id: invoice.subscriptionId,
                        object: 'subscription',
                        customer: invoice.customerId,
                        livemode: false,
                        status: invoice.subscriptionStatus ?? 'active',
                        cancel_at_period_end: false,
                        canceled_at: invoice.subscriptionStatus === 'canceled' ? 1_788_650_200 : null,
                        ended_at: invoice.subscriptionStatus === 'canceled' ? 1_788_650_200 : null,
                        items: {
                          object: 'list',
                          data: [{ id: 'si_foundation', price: { id: 'price_monthly', product: 'prod_monthly' } }],
                          has_more: false,
                          url: '/v1/subscription_items',
                        },
                      }
                    : url.pathname === `/v1/payment_intents/${invoicePaymentIntentId}` && invoice !== undefined
                      ? {
                          id: invoicePaymentIntentId,
                          object: 'payment_intent',
                          amount: 2000,
                          amount_capturable: 0,
                          amount_received: 2000,
                          created: 1_788_650_000,
                          currency: 'usd',
                          customer: invoice.customerId,
                          latest_charge: invoiceChargeId,
                          livemode: false,
                          metadata: {},
                          payment_method: 'pm_invoice',
                          status: 'succeeded',
                        }
                      : url.pathname === `/v1/charges/${invoiceChargeId}` && invoice !== undefined
                        ? {
                            id: invoiceChargeId,
                            object: 'charge',
                            amount: 2000,
                            amount_captured: 2000,
                            amount_refunded: 0,
                            created: 1_788_650_001,
                            currency: 'usd',
                            customer: invoice.customerId,
                            livemode: false,
                            paid: true,
                            payment_intent: invoicePaymentIntentId,
                            payment_method: 'pm_invoice',
                            payment_method_details: { card: { brand: 'visa', last4: '4242' } },
                            refunded: false,
                            status: 'succeeded',
                          }
                        : url.pathname === `/v1/charges/${paymentChargeFixtureId}`
                          ? {
                              id: paymentChargeFixtureId,
                              object: 'charge',
                              amount: 537,
                              amount_captured: 537,
                              amount_refunded: 0,
                              created: 1_788_650_001,
                              currency: 'usd',
                              customer: paymentFixture?.customerId,
                              livemode: false,
                              paid: true,
                              payment_intent: paymentIntentFixtureId,
                              payment_method: 'pm_foundation',
                              payment_method_details: { card: { brand: 'visa', last4: '4242' } },
                              refunded: false,
                              status: 'succeeded',
                            }
                          : {
                              error: { message: `Missing fixture for ${url.pathname}`, type: 'invalid_request_error' },
                            };
  const responseBody = body ?? {
    error: { message: `Incomplete fixture for ${url.pathname}`, type: 'invalid_request_error' },
  };
  response.writeHead('error' in responseBody ? 404 : 200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(responseBody));
});

let payments: BillingPaymentsService;
let fixtureStripe: ReturnType<typeof createBillingStripeClient>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Stripe fixture address is unavailable');
  }
  fixtureStripe = createBillingStripeClient({
    secretKey: 'sk_test_fixture',
    fixtureUrl: `http://127.0.0.1:${(address satisfies AddressInfo).port}/`,
  });
  payments = new BillingPaymentsService(
    { database: runtimeDatabase },
    fixtureStripe,
    fixtureStripe,
    {
      environment: 'development',
      stripeAccountId,
      livemode: false,
      uiOrigin: 'http://127.0.0.1:3000',
      webhookSecret: 'whsec_fixture_1234567890',
      collection: { kind: 'local_fixture', monthlyPriceId: 'price_monthly', topupProductId: 'prod_topup' },
    },
    policy,
    ledger,
    new BillingCashService({ database: runtimeDatabase }, fixtureStripe, fixtureStripe, ledger, {
      environment: 'development',
      stripeAccountId,
      livemode: false,
    }),
  );
  await seedBillingFixturePolicy({
    database,
    activationId: `payment-${randomUUID()}`,
    policy: {
      schemaVersion: 1,
      environment: 'development',
      policyVersion: `payments-${randomUUID()}`,
      markupBps: 0,
      fleet: { minimumSchemaVersion: 1, meterContractIds: [] },
      rates: [],
      routes: [],
      offers: [
        {
          offerId: 'pro-monthly',
          kind: 'pro_monthly',
          currency: 'usd',
          principalMinor: '2000',
          grantCreditAtoms: '20000000',
          ceilingCreditAtoms: '40000000',
        },
        {
          offerId: 'top-up',
          kind: 'top_up',
          currency: 'usd',
          minimumPrincipalMinor: '500',
          maximumPrincipalMinor: '50000',
          creditAtomsPerPrincipalMinor: '10000',
        },
      ],
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    },
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  await Promise.all([client.end(), runtimeClient.end()]);
});

describe('billing payments PostgreSQL foundation', () => {
  it('creates the first financial owner and converges a concurrent Customer and purchase request', async () => {
    const userId = randomUUID();
    const requestId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Payment Foundation', email: `${userId}@test.invalid`, emailVerified: true });
    const input: Parameters<BillingPaymentsService['prepareTopup']>[1] = {
      requestId,
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'checkout',
    };
    const settled = await Promise.allSettled([
      payments.prepareTopup(userId, input),
      payments.prepareTopup(userId, input),
    ]);
    const fulfilled = settled.filter((result) => result.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const [owner] = await database
      .select()
      .from(billingOwnerBinding)
      .where(and(eq(billingOwnerBinding.authUserId, userId), eq(billingOwnerBinding.environment, 'development')));
    expect(owner).toBeDefined();
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.accountId, owner!.accountId));
    expect(binding?.stripeCustomerId).toBe(latestCustomerId);
    const purchases = await database
      .select()
      .from(billingPurchase)
      .where(and(eq(billingPurchase.accountId, owner!.accountId), eq(billingPurchase.requestId, requestId)));
    expect(purchases).toHaveLength(1);
    expect(requests.filter((request) => request === 'POST /v1/customers')).toHaveLength(1);
  });

  it('reclaims expired source and inbox leases with a new generation and rejects a stale claimant write', async () => {
    const sourceId = randomUUID();
    const inboxId = randomUUID();
    await database.insert(billingStripeSource).values({
      id: sourceId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      sourceType: 'future.source',
      sourceId: `src_${sourceId}`,
      state: 'processing',
      generation: 7n,
      leaseUntil: sql`transaction_timestamp() - interval '1 second'`,
      nextAttemptAt: sql`transaction_timestamp() - interval '1 second'`,
    });
    await database.insert(stripeEventInbox).values({
      id: inboxId,
      eventId: `evt_${inboxId}`,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      apiVersion: '2026-07-29.dahlia',
      eventType: 'future.event',
      sourceType: 'future.source',
      sourceId: `src_${sourceId}`,
      eventCreatedAt: new Date(),
      payloadDigest: 'a'.repeat(64),
      evidence: {},
      state: 'processing',
      claimGeneration: 4n,
      leaseUntil: sql`transaction_timestamp() - interval '1 second'`,
      nextAttemptAt: sql`transaction_timestamp() - interval '1 second'`,
    });
    await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [source] = await database.select().from(billingStripeSource).where(eq(billingStripeSource.id, sourceId));
    const [inbox] = await database.select().from(stripeEventInbox).where(eq(stripeEventInbox.id, inboxId));
    expect(source).toMatchObject({ generation: 8n, state: 'pending', errorCode: 'source_pending' });
    expect(inbox).toMatchObject({ claimGeneration: 5n, state: 'pending', errorCode: 'source_pending' });
    const stale = await database
      .update(billingStripeSource)
      .set({ state: 'done' })
      .where(
        and(
          eq(billingStripeSource.id, sourceId),
          eq(billingStripeSource.generation, 7n),
          eq(billingStripeSource.state, 'processing'),
        ),
      )
      .returning({ id: billingStripeSource.id });
    expect(stale).toHaveLength(0);
  });

  it('retains an ambiguous Customer intent for attention without another provider POST', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Ambiguous Customer', email: `${userId}@test.invalid`, emailVerified: true });
    const accountId = await ledger.ensureAccountBinding({ environment: 'development', authUserId: userId });
    const bindingId = randomUUID();
    const legId = randomUUID();
    await database.insert(billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
    });
    await database.insert(billingProviderLeg).values({
      id: legId,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      kind: 'customer',
      requestId: `customer:${bindingId}`,
      requestHash: 'c'.repeat(64),
      request: { metadata: { tau_account_id: accountId, tau_customer_binding_id: bindingId } },
      idempotencyKey: `tau:${legId}`,
      state: 'dispatched',
      dispatchStartedAt: new Date(),
    });
    const postsBefore = requests.filter((request) => request === 'POST /v1/customers').length;
    ambiguousCustomerSearch = true;
    try {
      const outcome = await payments
        .prepareTopup(userId, {
          requestId: randomUUID(),
          returnPath: '/settings/billing',
          amountMinor: '537',
          method: 'checkout',
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(ConflictException);
      expect((outcome as ConflictException).getResponse()).toEqual({ code: 'customer_creation_outcome_unknown' });
    } finally {
      ambiguousCustomerSearch = false;
    }
    expect(requests.filter((request) => request === 'POST /v1/customers')).toHaveLength(postsBefore);
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, bindingId));
    expect(binding?.stripeCustomerId).toBeNull();
    expect(await database.select().from(billingPurchase).where(eq(billingPurchase.accountId, accountId))).toHaveLength(
      0,
    );
  });

  it('retains verified cash as paid_unfulfilled when its grant fails and grants it once on recovery', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Payment Recovery', email: `${userId}@test.invalid`, emailVerified: true });
    const prepared = await payments.prepareTopup(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'saved_card',
    });
    const [owner] = await database
      .select()
      .from(billingOwnerBinding)
      .where(and(eq(billingOwnerBinding.authUserId, userId), eq(billingOwnerBinding.environment, 'development')));
    const [purchase] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, prepared.actionId));
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    if (owner === undefined || purchase === undefined || leg === undefined) {
      throw new Error('Prepared payment fixture is incomplete');
    }
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, leg.customerBindingId));
    if (binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
      throw new Error('Prepared customer fixture is incomplete');
    }
    paymentFixture = {
      purchaseId: purchase.id,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: binding.stripeCustomerId,
    };
    paymentStatus = 'succeeded';
    await payments.confirmAction(userId, purchase.id);
    const sourceId = randomUUID();
    const inboxId = randomUUID();
    await database.insert(billingStripeSource).values({
      id: sourceId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      sourceType: 'payment_intent',
      sourceId: 'pi_foundation_paid',
    });
    await database.insert(stripeEventInbox).values({
      id: inboxId,
      eventId: `evt_${inboxId}`,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      apiVersion: '2026-07-29.dahlia',
      eventType: 'payment_intent.succeeded',
      sourceType: 'payment_intent',
      sourceId: 'pi_foundation_paid',
      eventCreatedAt: new Date('2026-09-06T00:00:00.000Z'),
      payloadDigest: 'b'.repeat(64),
      evidence: {},
    });
    await database
      .update(creditAccount)
      .set({ purchasedAtoms: 9_223_372_036_854_775_807n })
      .where(eq(creditAccount.id, owner.accountId));
    await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [retained] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, purchase.id));
    expect(retained).toMatchObject({
      state: 'paid_unfulfilled',
      paymentIntentId: 'pi_foundation_paid',
      chargeId: 'ch_foundation_paid',
    });
    expect(retained?.receiptId).toBeNull();
    await database
      .update(creditAccount)
      .set({ purchasedAtoms: 9_223_372_036_854_775_807n - purchase.creditAtoms })
      .where(eq(creditAccount.id, owner.accountId));
    await database
      .update(billingStripeSource)
      .set({ state: 'pending', nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
      .where(eq(billingStripeSource.id, sourceId));
    await database
      .update(stripeEventInbox)
      .set({ state: 'pending', nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
      .where(eq(stripeEventInbox.id, inboxId));
    const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [fulfilled] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, purchase.id));
    const cashClaims = await database.execute(sql`select state, generation::text, error_code,
      lease_until > clock_timestamp() as lease_live from billing.billing_stripe_source
      where environment = 'development' and stripe_account_id = ${stripeAccountId} and livemode = false
        and source_type = 'cash_charge' and source_id = 'ch_foundation_paid'`);
    expect(fulfilled?.state, JSON.stringify({ recovery, cashClaims, requests: requests.slice(-20) })).toBe('fulfilled');
    expect(fulfilled?.receiptId).not.toBeNull();
    const receipts = await database.execute(
      sql`select count(*)::int as count from billing.credit_transaction where purchase_id = ${purchase.id}`,
    );
    expect(receipts[0]?.['count']).toBe(1);

    paymentIntentFixtureId = 'pi_foundation_excess';
    paymentChargeFixtureId = 'ch_foundation_excess';
    const excessSourceId = randomUUID();
    const excessInboxId = randomUUID();
    await database.insert(billingStripeSource).values({
      id: excessSourceId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      sourceType: 'payment_intent',
      sourceId: paymentIntentFixtureId,
    });
    await database.insert(stripeEventInbox).values({
      id: excessInboxId,
      eventId: `evt_${excessInboxId}`,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      apiVersion: '2026-07-29.dahlia',
      eventType: 'payment_intent.succeeded',
      sourceType: 'payment_intent',
      sourceId: paymentIntentFixtureId,
      eventCreatedAt: new Date('2026-09-06T00:01:00.000Z'),
      payloadDigest: 'c'.repeat(64),
      evidence: {},
    });
    expect(await payments.recoverPayments({ environment: 'development', limit: 1 })).toMatchObject({
      processed: [],
      pending: [excessSourceId],
      failed: [],
    });
    expect(
      await database.select().from(creditTransaction).where(eq(creditTransaction.purchaseId, purchase.id)),
    ).toHaveLength(1);
    paymentIntentFixtureId = 'pi_foundation_paid';
    paymentChargeFixtureId = 'ch_foundation_paid';
  });

  it('offers hosted continuation only for a source-qualified saved-card authentication requirement', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'SCA Payment', email: `${userId}@test.invalid`, emailVerified: true });
    const prepared = await payments.prepareTopup(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'saved_card',
    });
    const [purchase] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, prepared.actionId));
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
    if (
      purchase === undefined ||
      leg === undefined ||
      binding?.stripeCustomerId === null ||
      binding?.stripeCustomerId === undefined
    ) {
      throw new Error('SCA fixture is incomplete');
    }
    paymentFixture = {
      purchaseId: purchase.id,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: binding.stripeCustomerId,
    };
    paymentStatus = 'requires_action';
    const action = await payments.confirmAction(userId, purchase.id);
    expect(action).toMatchObject({
      state: 'attention_required',
      attention: { reason: 'authentication_required', action: 'continue_hosted' },
    });
    paymentFixture = {
      purchaseId: purchase.id,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: 'cus_foreign',
    };
    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
      .where(eq(billingProviderLeg.id, leg.id));
    expect(await payments.recoverPayments({ environment: 'development', limit: 1 })).toMatchObject({
      processed: [leg.id],
      pending: [],
      failed: [],
    });
    expect(await payments.getAction(userId, purchase.id)).toMatchObject({
      state: 'attention_required',
      attention: { reason: 'provider_outcome_unknown', action: 'wait' },
    });
    paymentStatus = 'succeeded';
  });

  it('permanently receipts a verified period whose frozen ceiling leaves zero issuance', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Zero Period', email: `${userId}@test.invalid`, emailVerified: true });
    const accountId = await ledger.ensureAccountBinding({ environment: 'development', authUserId: userId });
    await database.update(creditAccount).set({ planAtoms: 40_000_000n }).where(eq(creditAccount.id, accountId));
    const bindingId = randomUUID();
    const subscriptionId = randomUUID();
    const periodId = randomUUID();
    const invoiceId = `in_${randomUUID()}`;
    const offer: PaymentOfferSnapshot = {
      version: 'payment-offer-v1',
      policyId: 'policy-zero',
      offerId: 'pro-monthly',
      environment: 'development',
      accountId,
      stripeAccountId,
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
    const paidAt = new Date('2026-09-06T00:00:00.000Z');
    const evidence: PaidPaymentEvidence = {
      version: 'stripe-paid-v1',
      stripeAccountId,
      livemode: false,
      customerId: `cus_${bindingId}`,
      currency: 'usd',
      principalMinor: '2000',
      taxMinor: '0',
      grossMinor: '2000',
      paymentIntentIds: ['pi_period'],
      chargeIds: ['ch_period'],
      invoiceId,
      subscriptionId: 'sub_remote_zero',
      subscriptionItemId: 'si_zero',
      sourceDigest: 'd'.repeat(64),
      paidAt: paidAt.toISOString(),
      paymentMethod: null,
    };
    await database.insert(billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      stripeCustomerId: evidence.customerId,
    });
    await database.insert(subscription).values({
      id: subscriptionId,
      plan: 'pro',
      referenceId: `financial:${subscriptionId}`,
      stripeCustomerId: evidence.customerId,
      stripeSubscriptionId: evidence.subscriptionId,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      requestId: randomUUID(),
      requestHash: 'e'.repeat(64),
      offerSnapshot: offer,
      slotState: 'current',
      status: 'active',
    });
    await database.insert(billingPeriod).values({
      id: periodId,
      accountId,
      sourceIdentity: `period:${periodId}`,
      creditAtoms: 20_000_000n,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      subscriptionId,
      invoiceId,
      offerSnapshot: offer,
      paidEvidence: evidence,
      state: 'verified',
      paidAt,
    });
    const first = await fulfillPaidFixture({
      database,
      ledger,
      source: 'plan',
      accountId,
      causeId: periodId,
    });
    const replay = await fulfillPaidFixture({
      database,
      ledger,
      source: 'plan',
      accountId,
      causeId: periodId,
    });
    expect(first).toEqual(replay);
    expect(first.grantedAtoms).toBe(0n);
    const [period] = await database.select().from(billingPeriod).where(eq(billingPeriod.id, periodId));
    expect(period).toMatchObject({ state: 'fulfilled', grantedAtoms: 0n, receiptId: first.receiptId });
    const journals = await database.select().from(creditTransaction).where(eq(creditTransaction.periodId, periodId));
    expect(journals).toHaveLength(1);
    expect(journals[0]?.accountDeltaAtoms).toBe(0n);
  });

  it('receipts a historical invoice without reducing paidThrough and anchors grace only to a current qualified failure', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Historical Invoice', email: `${userId}@test.invalid`, emailVerified: true });
    const accountId = await ledger.ensureAccountBinding({ environment: 'development', authUserId: userId });
    const bindingId = randomUUID();
    const subscriptionId = randomUUID();
    const remoteSubscriptionId = `sub_${randomUUID()}`;
    const remoteCustomerId = `cus_${randomUUID()}`;
    const offer: PaymentOfferSnapshot = {
      version: 'payment-offer-v1',
      policyId: 'policy-history',
      offerId: 'pro-monthly',
      environment: 'development',
      accountId,
      stripeAccountId,
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
    const newerPaidThrough = new Date('2026-11-01T00:00:00.000Z');
    await database.insert(billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      stripeCustomerId: remoteCustomerId,
    });
    await database.insert(subscription).values({
      id: subscriptionId,
      plan: 'pro',
      referenceId: `financial:${subscriptionId}`,
      stripeCustomerId: remoteCustomerId,
      stripeSubscriptionId: remoteSubscriptionId,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      requestId: randomUUID(),
      requestHash: 'f'.repeat(64),
      offerSnapshot: offer,
      slotState: 'current',
      status: 'active',
      paidThrough: newerPaidThrough,
    });
    const enqueueInvoice = async (invoiceId: string, eventType: 'invoice.paid' | 'invoice.payment_failed') => {
      const sourceId = randomUUID();
      const inboxId = randomUUID();
      await database.insert(billingStripeSource).values({
        id: sourceId,
        environment: 'development',
        stripeAccountId,
        livemode: false,
        sourceType: 'invoice',
        sourceId: invoiceId,
      });
      await database.insert(stripeEventInbox).values({
        id: inboxId,
        eventId: `evt_${inboxId}`,
        environment: 'development',
        stripeAccountId,
        livemode: false,
        apiVersion: '2026-07-29.dahlia',
        eventType,
        sourceType: 'invoice',
        sourceId: invoiceId,
        eventCreatedAt: new Date(),
        payloadDigest: randomUUID().replaceAll('-', '').repeat(2),
        evidence: {},
      });
      return sourceId;
    };
    const historicalInvoiceId = `in_${randomUUID()}`;
    invoiceFixture = {
      invoiceId: historicalInvoiceId,
      subscriptionId: remoteSubscriptionId,
      customerId: remoteCustomerId,
      paid: true,
      periodStart: 1_780_272_000,
      periodEnd: 1_782_950_400,
      subscriptionStatus: 'canceled',
    };
    await enqueueInvoice(historicalInvoiceId, 'invoice.paid');
    const sourceInvoice = await fetchStripeInvoiceEvidence(fixtureStripe, {
      invoiceId: historicalInvoiceId,
      maximumLinePages: 10,
      maximumPaymentPages: 10,
    });
    const sourceSubscription = await fixtureStripe.subscriptions.retrieve(remoteSubscriptionId);
    const sourcePayment = await retrieveStripePaymentEvidence(fixtureStripe, `pi_${historicalInvoiceId}`);
    expect(
      qualifySubscriptionInvoice({
        offer,
        customerId: remoteCustomerId,
        subscriptionId: remoteSubscriptionId,
        subscription: sourceSubscription,
        invoice: sourceInvoice,
        payment: sourcePayment,
      }).status,
    ).toBe('verified');
    const getsBefore = requests.length;
    const paidRecovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [recoverySource] = await database
      .select()
      .from(billingStripeSource)
      .where(eq(billingStripeSource.sourceId, historicalInvoiceId));
    expect(requests.slice(getsBefore)).toEqual([
      `GET /v1/invoices/${historicalInvoiceId}`,
      `GET /v1/invoices/${historicalInvoiceId}/lines`,
      'GET /v1/invoice_payments',
      `GET /v1/subscriptions/${remoteSubscriptionId}`,
      `GET /v1/payment_intents/pi_${historicalInvoiceId}`,
      `GET /v1/charges/ch_${historicalInvoiceId}`,
      `GET /v1/payment_intents/pi_${historicalInvoiceId}`,
      `GET /v1/charges/ch_${historicalInvoiceId}`,
      'GET /v1/refunds',
      'GET /v1/disputes',
    ]);
    expect({ paidRecovery, recoveryError: recoverySource?.errorCode }).toMatchObject({
      paidRecovery: { processed: [expect.any(String)], pending: [], failed: [] },
      recoveryError: null,
    });
    const [period] = await database
      .select()
      .from(billingPeriod)
      .where(eq(billingPeriod.invoiceId, historicalInvoiceId));
    expect(period).toMatchObject({
      state: 'fulfilled',
      periodStart: new Date(1_780_272_000_000),
      periodEnd: new Date(1_782_950_400_000),
    });
    const [afterHistorical] = await database.select().from(subscription).where(eq(subscription.id, subscriptionId));
    expect(afterHistorical?.paidThrough).toEqual(newerPaidThrough);
    expect(afterHistorical?.graceEndsAt).toBeNull();
    expect(afterHistorical).toMatchObject({ slotState: 'ended', status: 'canceled' });
    expect(requests.slice(getsBefore).every((request) => request.startsWith('GET '))).toBe(true);

    const overlapInvoiceId = `in_${randomUUID()}`;
    invoiceFixture = {
      invoiceId: overlapInvoiceId,
      subscriptionId: remoteSubscriptionId,
      customerId: remoteCustomerId,
      paid: true,
      periodStart: 1_782_000_000,
      periodEnd: 1_784_000_000,
      subscriptionStatus: 'active',
    };
    const overlapSourceId = await enqueueInvoice(overlapInvoiceId, 'invoice.paid');
    expect(await payments.recoverPayments({ environment: 'development', limit: 1 })).toMatchObject({
      processed: [],
      pending: [overlapSourceId],
      failed: [],
    });
    expect(await database.select().from(billingPeriod).where(eq(billingPeriod.invoiceId, overlapInvoiceId))).toEqual(
      [],
    );
    await database
      .update(billingStripeSource)
      .set({ nextAttemptAt: new Date('2099-01-01T00:00:00.000Z') })
      .where(eq(billingStripeSource.id, overlapSourceId));

    const adjacentInvoiceId = `in_${randomUUID()}`;
    invoiceFixture = {
      invoiceId: adjacentInvoiceId,
      subscriptionId: remoteSubscriptionId,
      customerId: remoteCustomerId,
      paid: true,
      periodStart: 1_782_950_400,
      periodEnd: 1_785_628_800,
      subscriptionStatus: 'active',
    };
    await enqueueInvoice(adjacentInvoiceId, 'invoice.paid');
    expect(await payments.recoverPayments({ environment: 'development', limit: 1 })).toMatchObject({
      processed: [expect.any(String)],
      pending: [],
      failed: [],
    });
    const [adjacentPeriod] = await database
      .select()
      .from(billingPeriod)
      .where(eq(billingPeriod.invoiceId, adjacentInvoiceId));
    expect(adjacentPeriod).toMatchObject({
      state: 'fulfilled',
      periodStart: new Date(1_782_950_400_000),
      periodEnd: new Date(1_785_628_800_000),
    });

    await database
      .update(subscription)
      .set({ slotState: 'current', status: 'active' })
      .where(eq(subscription.id, subscriptionId));
    const staleFailureId = `in_${randomUUID()}`;
    invoiceFixture = {
      invoiceId: staleFailureId,
      subscriptionId: remoteSubscriptionId,
      customerId: remoteCustomerId,
      paid: false,
      periodStart: 1_780_272_000,
      periodEnd: 1_782_950_400,
    };
    await enqueueInvoice(staleFailureId, 'invoice.payment_failed');
    await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [afterStale] = await database.select().from(subscription).where(eq(subscription.id, subscriptionId));
    expect(afterStale?.graceEndsAt).toBeNull();

    const currentBoundary = new Date('2026-12-01T00:00:00.000Z');
    await database
      .update(subscription)
      .set({ paidThrough: new Date('2026-11-01T00:00:00.000Z') })
      .where(eq(subscription.id, subscriptionId));
    const currentFailureId = `in_${randomUUID()}`;
    invoiceFixture = {
      invoiceId: currentFailureId,
      subscriptionId: remoteSubscriptionId,
      customerId: remoteCustomerId,
      paid: false,
      periodStart: Math.floor(currentBoundary.getTime() / 1000),
      periodEnd: Math.floor(new Date('2027-01-01T00:00:00.000Z').getTime() / 1000),
    };
    await enqueueInvoice(currentFailureId, 'invoice.payment_failed');
    await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [afterCurrent] = await database.select().from(subscription).where(eq(subscription.id, subscriptionId));
    expect(afterCurrent?.dunningStartedAt).toEqual(currentBoundary);
    expect(afterCurrent?.graceEndsAt).toEqual(new Date('2026-12-08T00:00:00.000Z'));
  });
});
