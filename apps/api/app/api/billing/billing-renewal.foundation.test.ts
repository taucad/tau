/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixture fields preserve provider names. */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import {
  billingFinancialCase,
  billingProviderLeg,
  billingRecoveryNotice,
  billingStripeCustomer,
  billingSubscriptionOffer,
  creditAccount,
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
const stripeAccountId = 'acct_renewal_native';
const boundary = 1_799_000_000;
const currentStart = boundary - 2_592_000;

type Remote = {
  customer: string;
  livemode: boolean;
  itemId: string;
  priceId: string;
  scheduleId?: string;
};

const remotes = new Map<string, Remote>();
const schedules = new Map<string, { subscriptionId: string; offerId: string; futurePriceId?: string }>();
const deliveries: Array<{ dedupeKey: string; kind: string }> = [];
let payments: BillingPaymentsService;
let policy: BillingPolicyService;
let sequence = 0;
let createPostCount = 0;
let updatePostCount = 0;
let dropCreateResponse = false;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const send = (body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const readForm = (callback: (form: URLSearchParams) => void): void => {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      callback(new URLSearchParams(chunks.join('')));
    });
  };
  const subscriptionId = /^\/v1\/subscriptions\/(?<id>[\w-]+)$/u.exec(url.pathname)?.groups?.['id'];
  if (subscriptionId !== undefined && remotes.has(subscriptionId)) {
    const remote = remotes.get(subscriptionId);
    send({
      id: subscriptionId,
      object: 'subscription',
      customer: remote?.customer,
      livemode: remote?.livemode,
      schedule: remote?.scheduleId ?? null,
      status: 'active',
      items: {
        object: 'list',
        data: [
          {
            id: remote?.itemId,
            price: { id: remote?.priceId, object: 'price' },
            current_period_start: currentStart,
            current_period_end: boundary,
          },
        ],
        has_more: false,
        url: '/v1/subscription_items',
      },
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/subscription_schedules') {
    readForm((form) => {
      createPostCount += 1;
      sequence += 1;
      const owner = form.get('from_subscription') ?? '';
      const id = `sub_sched_${sequence}`;
      schedules.set(id, { subscriptionId: owner, offerId: '' });
      const remote = remotes.get(owner);
      if (remote !== undefined) {
        remote.scheduleId = id;
      }
      if (dropCreateResponse) {
        dropCreateResponse = false;
        response.destroy();
        return;
      }
      send(scheduleObject(id));
    });
    return;
  }
  const updatedId = /^\/v1\/subscription_schedules\/(?<id>sub_sched_\d+)$/u.exec(url.pathname)?.groups?.['id'];
  if (request.method === 'POST' && updatedId !== undefined && schedules.has(updatedId)) {
    readForm((form) => {
      updatePostCount += 1;
      const stored = schedules.get(updatedId);
      if (stored !== undefined) {
        stored.offerId = form.get('metadata[tau_subscription_offer_id]') ?? '';
        stored.futurePriceId = form.get('phases[1][items][0][price]') ?? undefined;
      }
      send(scheduleObject(updatedId));
    });
    return;
  }
  if (updatedId !== undefined && schedules.has(updatedId)) {
    send(scheduleObject(updatedId));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: url.pathname } }));
});

function scheduleObject(id: string) {
  const stored = schedules.get(id);
  const remote = stored === undefined ? undefined : remotes.get(stored.subscriptionId);
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
    items: [{ price: remote?.priceId, quantity: 1 }],
    metadata: { retained: 'yes' },
    on_behalf_of: null,
    proration_behavior: 'none',
    start_date: currentStart,
    transfer_data: null,
    trial_end: null,
  };
  return {
    id,
    object: 'subscription_schedule',
    customer: remote?.customer,
    metadata:
      stored?.offerId === undefined || stored.offerId.length === 0 ? {} : { tau_subscription_offer_id: stored.offerId },
    phases:
      stored?.futurePriceId === undefined
        ? [current]
        : [
            current,
            {
              ...current,
              start_date: boundary,
              end_date: boundary + 2_592_000,
              items: [{ price: stored.futurePriceId, quantity: 1 }],
            },
          ],
    status: 'active',
    subscription: stored?.subscriptionId,
  };
}

describe('billing renewal native foundation', { concurrent: false }, () => {
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
        stripeAccountId,
        livemode: false,
        uiOrigin: 'http://127.0.0.1:3000',
        webhookSecret: 'whsec_renewal_native_12345',
        collection: { kind: 'local_fixture', monthlyPriceId: 'price_new', topupProductId: 'prod_topup' },
      },
      policy,
      ledger,
      new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
        environment: 'development',
        stripeAccountId,
        livemode: false,
      }),
      notice,
    );
    await seedBillingFixturePolicy({ database, activationId: `renewal-${randomUUID()}`, policy: policyDocument() });
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
    const owned = await seedSubscription();
    dropCreateResponse = true;
    const creates = createPostCount;
    await prepare(owned);
    const interrupted = await payments.recoverRenewalOffers({ environment: 'development', limit: 10 });
    expect(interrupted.failed).toContain(await offerIdFor(owned.subscriptionId));
    await database
      .update(billingProviderLeg)
      .set({ leaseUntil: sql`clock_timestamp() - interval '1 second'` })
      .where(eq(billingProviderLeg.kind, 'subscription_schedule'));
    const recovered = await payments.recoverRenewalOffers({ environment: 'development', limit: 10 });
    expect(recovered.processed).toContain(await offerIdFor(owned.subscriptionId));
    expect(createPostCount).toBe(creates + 1);
    const [offer] = await database
      .select()
      .from(billingSubscriptionOffer)
      .where(eq(billingSubscriptionOffer.subscriptionId, owned.subscriptionId));
    expect(offer).toMatchObject({
      state: 'confirmed',
      sourceEvidence: {
        disclosureEvidence: { receipt: 'disclosure-1' },
        source: { subscriptionItemId: owned.itemId, currentPriceId: 'price_old', customerId: owned.customerId },
      },
    });
    const scheduleId = offer?.stripeScheduleId ?? '';
    expect(scheduleObject(scheduleId).phases[0]).toMatchObject({
      description: 'Retained plan',
      metadata: { retained: 'yes' },
      collection_method: 'charge_automatically',
    });

    await database.insert(billingRecoveryNotice).values({
      id: randomUUID(),
      accountId: owned.accountId,
      environment: 'development',
      kind: 'renewal_failed',
      dedupeKey: 'renewal:1',
      payload: { subscriptionId: owned.subscriptionId },
    });
    await payments.deliverRecoveryNotices({ environment: 'development', limit: 10 });
    expect(deliveries.filter((delivery) => delivery.dedupeKey === 'renewal:1')).toEqual([
      { dedupeKey: 'renewal:1', kind: 'renewal_failed' },
    ]);
  });

  it('refuses preparation for a closed account or a blocking cash case', async () => {
    const closed = await seedSubscription();
    await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, closed.accountId));
    const posts = createPostCount + updatePostCount;
    await expect(prepare(closed)).rejects.toMatchObject({ response: { code: 'payment_account_not_open' } });

    const paused = await seedSubscription();
    await seedCashCase(paused.accountId);
    await expect(prepare(paused)).rejects.toMatchObject({ response: { message: 'cash_scope_attention' } });
    expect(
      await database
        .select()
        .from(billingSubscriptionOffer)
        .where(eq(billingSubscriptionOffer.subscriptionId, paused.subscriptionId)),
    ).toHaveLength(0);
    expect(createPostCount + updatePostCount).toBe(posts);
  });

  it('blocks a prepared renewal dispatch after closure and after a cash pause', async () => {
    const closed = await seedSubscription();
    await prepare(closed);
    await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, closed.accountId));
    const posts = createPostCount + updatePostCount;
    const blocked = await payments.recoverRenewalOffers({ environment: 'development', limit: 20 });
    expect(blocked.failed).toContain(await offerIdFor(closed.subscriptionId));
    expect(createPostCount + updatePostCount).toBe(posts);

    const paused = await seedSubscription();
    await prepare(paused);
    await seedCashCase(paused.accountId);
    const pausedOutcome = await payments.recoverRenewalOffers({ environment: 'development', limit: 20 });
    expect(pausedOutcome.failed).toContain(await offerIdFor(paused.subscriptionId));
    expect(createPostCount + updatePostCount).toBe(posts);
    expect(await offerStateFor(paused.subscriptionId)).not.toBe('confirmed');
  });

  it('still qualifies an already dispatched schedule against a closed account without a new POST', async () => {
    const owned = await seedSubscription();
    await prepare(owned);
    const offer = await offerRow(owned.subscriptionId);
    const scheduleId = seedRemoteSchedule(owned, offer.id, offer.stripePriceId);
    await seedKnownLeg({
      owned,
      offer,
      kind: 'subscription_schedule',
      request: { subscriptionId: owned.remoteSubscriptionId },
      providerObjectId: scheduleId,
    });
    await seedKnownLeg({
      owned,
      offer,
      kind: 'subscription_update',
      request: {
        scheduleId,
        subscriptionOfferId: offer.id,
        currentStart,
        effectivePeriodStart: Math.floor(offer.effectivePeriodStart.getTime() / 1000),
        currentPriceId: 'price_old',
        futurePriceId: offer.stripePriceId,
      },
      providerObjectId: scheduleId,
    });
    await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, owned.accountId));

    const posts = createPostCount + updatePostCount;
    const outcome = await payments.recoverRenewalOffers({ environment: 'development', limit: 20 });
    expect(outcome.processed).toContain(offer.id);
    expect(createPostCount + updatePostCount).toBe(posts);
    expect(await offerStateFor(owned.subscriptionId)).toBe('confirmed');
  });

  it.each([{ itemId: 'si_foreign' }, { priceId: 'price_foreign' }, { customer: 'cus_foreign' }, { livemode: true }])(
    'rejects a correct boundary paired with %j',
    async (mutation) => {
      const owned = await seedSubscription();
      await prepare(owned);
      const remote = remotes.get(owned.remoteSubscriptionId);
      if (remote === undefined) {
        throw new Error('Renewal remote fixture missing');
      }
      Object.assign(remote, mutation);
      const posts = createPostCount + updatePostCount;
      await expect(prepare(owned)).rejects.toMatchObject({
        response: { code: 'renewal_source_tuple_mismatch' },
      });
      expect(createPostCount + updatePostCount).toBe(posts);
      // Retire the fixture account so its unconfirmed offer never dispatches in a later recovery.
      await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, owned.accountId));
    },
  );

  it.each(['subscription_schedule', 'subscription_update'] as const)(
    'refuses a reused %s leg whose frozen request no longer matches',
    async (kind) => {
      const owned = await seedSubscription();
      await prepare(owned);
      const offer = await offerRow(owned.subscriptionId);
      const staleRequest =
        kind === 'subscription_schedule'
          ? { subscriptionId: 'sub_foreign' }
          : {
              scheduleId: seedRemoteSchedule(owned, '', undefined),
              subscriptionOfferId: offer.id,
              currentStart,
              effectivePeriodStart: Math.floor(offer.effectivePeriodStart.getTime() / 1000) + 60,
              currentPriceId: 'price_old',
              futurePriceId: offer.stripePriceId,
            };
      const legId = randomUUID();
      await database.insert(billingProviderLeg).values({
        id: legId,
        accountId: owned.accountId,
        environment: 'development',
        customerBindingId: owned.bindingId,
        subscriptionId: owned.subscriptionId,
        subscriptionOfferId: offer.id,
        kind,
        requestId: offer.id,
        requestHash: createHash('sha256').update(JSON.stringify(staleRequest)).digest('hex'),
        request: staleRequest,
        idempotencyKey: `tau:${legId}`,
      });
      const posts = createPostCount + updatePostCount;
      const outcome = await payments.recoverRenewalOffers({ environment: 'development', limit: 20 });
      expect(outcome.failed).toContain(offer.id);
      expect(createPostCount + updatePostCount).toBe(posts);
      expect(await offerStateFor(owned.subscriptionId)).not.toBe('confirmed');
      await database.update(creditAccount).set({ status: 'closed' }).where(eq(creditAccount.id, owned.accountId));
    },
  );
});

type OwnedSubscription = {
  readonly accountId: string;
  readonly bindingId: string;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly remoteSubscriptionId: string;
  readonly itemId: string;
};

async function seedSubscription(): Promise<OwnedSubscription> {
  sequence += 1;
  const userId = randomUUID();
  await database
    .insert(user)
    .values({ id: userId, name: 'Renewal', email: `${userId}@test.invalid`, emailVerified: true });
  const ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
  await ledger.ensureAccountBinding({ authUserId: userId, environment: 'development' });
  const binding = await database.query.billingOwnerBinding.findFirst({
    where: (table, operators) => operators.eq(table.authUserId, userId),
  });
  const accountId = binding?.accountId ?? '';
  const bindingId = randomUUID();
  const customerId = `cus_renewal_${sequence}`;
  const subscriptionId = randomUUID();
  const remoteSubscriptionId = `sub_renewal_${sequence}`;
  const itemId = `si_renewal_${sequence}`;
  await database.insert(billingStripeCustomer).values({
    id: bindingId,
    accountId,
    environment: 'development',
    stripeAccountId,
    livemode: false,
    stripeCustomerId: customerId,
  });
  await database.insert(subscription).values({
    id: subscriptionId,
    plan: 'pro',
    referenceId: `financial:${subscriptionId}`,
    accountId,
    environment: 'development',
    customerBindingId: bindingId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: remoteSubscriptionId,
    requestId: randomUUID(),
    requestHash: 'a'.repeat(64),
    offerSnapshot: currentOffer(accountId),
    slotState: 'current',
    status: 'active',
  });
  remotes.set(remoteSubscriptionId, { customer: customerId, livemode: false, itemId, priceId: 'price_old' });
  return { accountId, bindingId, customerId, subscriptionId, remoteSubscriptionId, itemId };
}

async function prepare(owned: OwnedSubscription): Promise<unknown> {
  const effective = await policy.selectEffectivePolicy({
    environment: 'development',
    replica: { schemaVersion: 1, meterContractIds: [] },
  });
  return payments.prepareRenewalOffer({
    environment: 'development',
    accountId: owned.accountId,
    subscriptionId: owned.subscriptionId,
    policyId: effective.policyId,
    effectivePeriodStart: new Date(boundary * 1000),
    disclosedAt: new Date((boundary - 3600) * 1000),
    disclosureEvidence: { kind: 'local_fixture', receipt: 'disclosure-1' },
    requestId: randomUUID(),
  });
}

/** Registers an owned schedule the service can retrieve without creating one. */
function seedRemoteSchedule(owned: OwnedSubscription, offerId: string, futurePriceId: string | undefined): string {
  sequence += 1;
  const id = `sub_sched_${sequence}`;
  schedules.set(id, { subscriptionId: owned.remoteSubscriptionId, offerId, futurePriceId });
  const remote = remotes.get(owned.remoteSubscriptionId);
  if (remote !== undefined) {
    remote.scheduleId = id;
  }
  return id;
}

async function seedKnownLeg(input: {
  readonly owned: OwnedSubscription;
  readonly offer: typeof billingSubscriptionOffer.$inferSelect;
  readonly kind: 'subscription_schedule' | 'subscription_update';
  readonly request: Record<string, unknown>;
  readonly providerObjectId: string;
}): Promise<void> {
  const { owned, offer, kind, request, providerObjectId } = input;
  const id = randomUUID();
  await database.insert(billingProviderLeg).values({
    id,
    accountId: owned.accountId,
    environment: 'development',
    customerBindingId: owned.bindingId,
    subscriptionId: owned.subscriptionId,
    subscriptionOfferId: offer.id,
    kind,
    requestId: offer.id,
    requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
    request,
    idempotencyKey: `tau:${id}`,
    state: 'known',
    dispatchStartedAt: new Date(),
    providerObjectId,
  });
}

async function offerRow(subscriptionId: string): Promise<typeof billingSubscriptionOffer.$inferSelect> {
  const row = await database.query.billingSubscriptionOffer.findFirst({
    where: eq(billingSubscriptionOffer.subscriptionId, subscriptionId),
  });
  if (row === undefined) {
    throw new Error('Renewal offer fixture missing');
  }
  return row;
}

async function offerIdFor(subscriptionId: string): Promise<string> {
  const row = await offerRow(subscriptionId);
  return row.id;
}

async function offerStateFor(subscriptionId: string): Promise<string> {
  const row = await offerRow(subscriptionId);
  return row.state;
}

async function seedCashCase(accountId: string): Promise<void> {
  await database.insert(billingFinancialCase).values({
    id: randomUUID(),
    environment: 'development',
    stripeAccountId,
    livemode: false,
    kind: 'gross_fee_net_mismatch',
    dedupeKey: `renewal-pause:${accountId}`,
    accountId,
    evidence: { kind: 'local_fixture' },
    owner: 'finance',
    nextStep: 'reconcile the merchant balance',
    firstEffectiveAt: new Date(),
  });
}

function currentOffer(accountId: string): PaymentOfferSnapshot {
  return {
    version: 'payment-offer-v1',
    policyId: 'historical',
    offerId: 'pro-old',
    environment: 'development',
    accountId,
    stripeAccountId,
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
        maximumPrincipalMinor: '500000',
        creditAtomsPerPrincipalMinor: '10000',
      },
    ],
    promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
  };
}
