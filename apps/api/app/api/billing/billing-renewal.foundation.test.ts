/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixture fields preserve provider names. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingRecoveryNotice,
  billingProviderLeg,
  billingStripeCustomer,
  billingSubscriptionOffer,
  subscription,
  user,
} from '#database/schema.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import type { BillingRecoveryNoticeTransport } from '#api/billing/billing-payments.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
let accountId = '';
const bindingId = randomUUID();
const localSubscriptionId = randomUUID();
const remoteSubscriptionId = 'sub_renewal_native';
const boundary = 1_799_000_000;
let scheduleId: string | undefined;
let scheduleOfferId = '';
let createCount = 0;
let dropCreateResponse = true;
let updatedSchedule = schedule(false);
const deliveries: Array<{ dedupeKey: string; kind: string }> = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const send = (body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === `/v1/subscriptions/${remoteSubscriptionId}`) {
    send({
      id: remoteSubscriptionId,
      object: 'subscription',
      customer: 'cus_renewal_native',
      livemode: false,
      schedule: scheduleId ?? null,
      status: 'active',
      items: {
        object: 'list',
        data: [{ id: 'si_renewal', current_period_start: boundary - 2_592_000, current_period_end: boundary }],
        has_more: false,
        url: '/v1/subscription_items',
      },
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/subscription_schedules') {
    createCount += 1;
    scheduleId = 'sub_sched_renewal';
    updatedSchedule = schedule(false);
    if (dropCreateResponse) {
      dropCreateResponse = false;
      response.destroy();
      return;
    }
    send(updatedSchedule);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/subscription_schedules/sub_sched_renewal') {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      scheduleOfferId = new URLSearchParams(chunks.join('')).get('metadata[tau_subscription_offer_id]') ?? '';
      updatedSchedule = schedule(true);
      send(updatedSchedule);
    });
    return;
  }
  if (url.pathname === '/v1/subscription_schedules/sub_sched_renewal') {
    send(updatedSchedule);
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: url.pathname } }));
});

function schedule(updated: boolean) {
  const current = {
    add_invoice_items: [],
    application_fee_percent: null,
    billing_cycle_anchor: 'automatic',
    billing_thresholds: null,
    collection_method: 'charge_automatically',
    currency: 'usd',
    default_payment_method: null,
    default_tax_rates: [],
    description: 'Retained plan',
    discounts: [],
    end_date: boundary,
    invoice_settings: null,
    items: [{ price: 'price_old', quantity: 1 }],
    metadata: { retained: 'yes' },
    on_behalf_of: null,
    proration_behavior: 'none',
    start_date: boundary - 2_592_000,
    transfer_data: null,
    trial_end: null,
  };
  return {
    id: 'sub_sched_renewal',
    object: 'subscription_schedule',
    customer: 'cus_renewal_native',
    metadata: updated ? { tau_subscription_offer_id: scheduleOfferId } : {},
    phases: updated
      ? [
          current,
          {
            ...current,
            start_date: boundary,
            end_date: boundary + 2_592_000,
            items: [{ price: 'price_new', quantity: 1 }],
          },
        ]
      : [current],
    status: 'active',
    subscription: remoteSubscriptionId,
  };
}

describe('billing renewal native foundation', { concurrent: false }, () => {
  let payments: BillingPaymentsService;
  let policy: BillingPolicyService;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const bound = server.address();
    if (bound === null || typeof bound === 'string') {
      throw new Error('Stripe fixture address unavailable');
    }
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_renewal',
      fixtureUrl: `http://127.0.0.1:${(bound satisfies AddressInfo).port}/`,
    });
    policy = new BillingPolicyService({ database: runtimeDatabase });
    const ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
    const notice: BillingRecoveryNoticeTransport = {
      deliver: async ({ dedupeKey, kind }) => {
        deliveries.push({ dedupeKey, kind });
        return { receipt: `receipt:${dedupeKey}` };
      },
    };
    payments = new BillingPaymentsService(
      { database: runtimeDatabase },
      stripe,
      stripe,
      {
        environment: 'development',
        stripeAccountId: 'acct_renewal_native',
        livemode: false,
        uiOrigin: 'http://127.0.0.1:3000',
        webhookSecret: 'whsec_renewal_native_12345',
        collection: { kind: 'local_fixture', monthlyPriceId: 'price_new', topupProductId: 'prod_topup' },
      },
      policy,
      ledger,
      new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
        environment: 'development',
        stripeAccountId: 'acct_renewal_native',
        livemode: false,
      }),
      notice,
    );
    await seedBillingFixturePolicy({ database, activationId: `renewal-${randomUUID()}`, policy: policyDocument() });
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Renewal', email: `${userId}@test.invalid`, emailVerified: true });
    await ledger.ensureAccountBinding({ authUserId: userId, environment: 'development' });
    const owners = await database.query.billingOwnerBinding.findMany({
      where: (row, { eq: equal }) => equal(row.authUserId, userId),
    });
    accountId = owners[0]?.accountId ?? '';
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    await Promise.all([adminClient.end(), runtimeClient.end()]);
  });

  it('persists disclosure, recovers one schedule creation, preserves the current phase, and delivers a notice once', async () => {
    await database.insert(billingStripeCustomer).values({
      id: bindingId,
      accountId,
      environment: 'development',
      stripeAccountId: 'acct_renewal_native',
      livemode: false,
      stripeCustomerId: 'cus_renewal_native',
    });
    await database.insert(subscription).values({
      id: localSubscriptionId,
      plan: 'pro',
      referenceId: `financial:${localSubscriptionId}`,
      accountId,
      environment: 'development',
      customerBindingId: bindingId,
      stripeCustomerId: 'cus_renewal_native',
      stripeSubscriptionId: remoteSubscriptionId,
      requestId: randomUUID(),
      requestHash: 'a'.repeat(64),
      offerSnapshot: currentOffer(),
      slotState: 'current',
      status: 'active',
    });
    const effective = await policy.selectEffectivePolicy({
      environment: 'development',
      replica: { schemaVersion: 1, meterContractIds: [] },
    });
    await payments.prepareRenewalOffer({
      environment: 'development',
      accountId,
      subscriptionId: localSubscriptionId,
      policyId: effective.policyId,
      effectivePeriodStart: new Date(boundary * 1000),
      disclosedAt: new Date((boundary - 3600) * 1000),
      disclosureEvidence: { kind: 'local_fixture', receipt: 'disclosure-1' },
      requestId: randomUUID(),
    });
    const interrupted = await payments.recoverRenewalOffers({ environment: 'development', limit: 10 });
    expect(interrupted.failed).toHaveLength(1);
    await database
      .update(billingProviderLeg)
      .set({ leaseUntil: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(billingProviderLeg.kind, 'subscription_schedule'));
    const recovered = await payments.recoverRenewalOffers({ environment: 'development', limit: 10 });
    expect(recovered.processed).toHaveLength(1);
    expect(createCount).toBe(1);
    const [offer] = await database
      .select()
      .from(billingSubscriptionOffer)
      .where(eq(billingSubscriptionOffer.subscriptionId, localSubscriptionId));
    expect(offer).toMatchObject({
      state: 'confirmed',
      sourceEvidence: { disclosureEvidence: { receipt: 'disclosure-1' } },
      stripeScheduleId: 'sub_sched_renewal',
    });
    expect(updatedSchedule.phases[0]).toMatchObject({
      description: 'Retained plan',
      metadata: { retained: 'yes' },
      collection_method: 'charge_automatically',
    });
    await database.insert(billingRecoveryNotice).values({
      id: randomUUID(),
      accountId,
      environment: 'development',
      kind: 'renewal_failed',
      dedupeKey: 'renewal:1',
      payload: { subscriptionId: localSubscriptionId },
    });
    await payments.deliverRecoveryNotices({ environment: 'development', limit: 10 });
    expect(deliveries.filter((delivery) => delivery.dedupeKey === 'renewal:1')).toEqual([
      { dedupeKey: 'renewal:1', kind: 'renewal_failed' },
    ]);
  });
});

function currentOffer(): PaymentOfferSnapshot {
  return {
    version: 'payment-offer-v1',
    policyId: 'historical',
    offerId: 'pro-old',
    environment: 'development',
    accountId,
    stripeAccountId: 'acct_renewal_native',
    livemode: false,
    currency: 'usd',
    principalMinor: '1800',
    taxMinor: '0',
    grossMinor: '1800',
    maximumGrossMinor: '1800',
    creditAtoms: '18000000',
    ceilingCreditAtoms: '36000000',
    stripePriceId: 'price_old',
    stripeProductId: null,
    quantity: 1,
    term: 'month',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: null,
  };
}

function policyDocument() {
  return {
    schemaVersion: 1,
    environment: 'development',
    policyVersion: `renewal-${randomUUID()}`,
    markupBps: 0,
    fleet: { minimumSchemaVersion: 1, meterContractIds: [] },
    rates: [],
    routes: [],
    offers: [
      {
        offerId: 'pro-new',
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
  };
}
