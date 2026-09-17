/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures retain provider field names. */
/* oxlint-disable typescript/consistent-type-assertions, typescript/no-unsafe-assignment -- fixtures intentionally model partial provider responses */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Stripe } from 'stripe';
import * as schema from '#database/schema.js';
import {
  billingProviderLeg,
  billingPurchase,
  billingReloadConsent,
  billingReloadWork,
  creditAccount,
  user,
} from '#database/schema.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';
import {
  qualifyReloadCustomerLocation,
  qualifyReloadSetup,
  qualifyReloadTaxCalculation,
} from '#api/billing/billing-payments.recovery.js';

const address = {
  city: 'Wellington',
  country: 'NZ',
  line1: '1 Willis Street',
  line2: null,
  postal_code: '6011',
  state: null,
};

describe('billing reload source qualification', () => {
  it('binds an owned Customer billing location to a stable revision', () => {
    const location = qualifyReloadCustomerLocation({
      accountId: 'account_reload',
      customerBindingId: 'binding_reload',
      customerId: 'cus_reload',
      livemode: false,
      customer: {
        id: 'cus_reload',
        object: 'customer',
        address,
        livemode: false,
        metadata: { tau_account_id: 'account_reload', tau_customer_binding_id: 'binding_reload' },
      },
    });

    expect(location).toEqual({
      revision: expect.stringMatching(/^[a-f\d]{64}$/u),
      address: { city: 'Wellington', country: 'NZ', line1: '1 Willis Street', postalCode: '6011' },
    });
  });

  it('requires consent metadata on both the hosted Session and SetupIntent', () => {
    const metadata = {
      tau_reload_consent_id: 'consent_reload',
      tau_reload_consent_version: '1',
      tau_provider_leg_id: 'leg_setup',
    };
    const source = {
      session: {
        id: 'cs_setup',
        client_reference_id: 'consent_reload',
        customer: 'cus_reload',
        livemode: false,
        metadata,
        mode: 'setup',
        setup_intent: 'seti_reload',
        status: 'complete',
      },
      setupIntent: {
        id: 'seti_reload',
        customer: 'cus_reload',
        livemode: false,
        metadata,
        payment_method: 'pm_reload',
        status: 'succeeded',
        usage: 'off_session',
      },
      paymentMethod: {
        id: 'pm_reload',
        customer: 'cus_reload',
        type: 'card',
        card: { brand: 'visa', last4: '4242' },
      },
    } as const;

    expect(
      qualifyReloadSetup({
        consentId: 'consent_reload',
        consentVersion: 1,
        customerId: 'cus_reload',
        livemode: false,
        providerLegId: 'leg_setup',
        source,
      }),
    ).toEqual({
      status: 'qualified',
      setupIntentId: 'seti_reload',
      paymentMethodId: 'pm_reload',
      brand: 'visa',
      last4: '4242',
    });
    expect(
      qualifyReloadSetup({
        consentId: 'consent_reload',
        consentVersion: 1,
        customerId: 'cus_reload',
        livemode: false,
        providerLegId: 'foreign_leg',
        source,
      }),
    ).toEqual({ status: 'unsupported', reason: 'setup_source_mismatch' });
  });

  it('accepts only a complete, unexpired, exclusive-tax calculation for the frozen principal', () => {
    const location = {
      revision: 'location_revision',
      address: { city: 'Wellington', country: 'NZ', line1: '1 Willis Street', postalCode: '6011' },
    };
    const calculation = {
      id: 'taxcalc_reload',
      amount_total: 2875,
      currency: 'usd',
      customer: 'cus_reload',
      customer_details: { address, address_source: 'billing' },
      expires_at: 2_000_000_000,
      livemode: false,
      tax_amount_exclusive: 375,
      tax_amount_inclusive: 0,
    } as Stripe.Tax.Calculation;
    const line = {
      amount: 2500,
      amount_tax: 375,
      livemode: false,
      product: 'prod_reload',
      quantity: 1,
      reference: 'reload:consent_reload:1',
      tax_behavior: 'exclusive',
    } as Stripe.Tax.CalculationLineItem;
    const qualified = qualifyReloadTaxCalculation({
      customerId: 'cus_reload',
      livemode: false,
      principalMinor: 2500,
      productId: 'prod_reload',
      reference: 'reload:consent_reload:1',
      location,
      observedAt: new Date('2030-01-01T00:00:00Z'),
      source: { calculation, lines: [line], complete: true },
    });

    expect(qualified).toMatchObject({ status: 'qualified', taxMinor: 375, grossMinor: 2875 });
    expect(
      qualifyReloadTaxCalculation({
        customerId: 'cus_reload',
        livemode: false,
        principalMinor: 2500,
        productId: 'prod_reload',
        reference: 'reload:consent_reload:1',
        location,
        observedAt: new Date('2030-01-01T00:00:00Z'),
        source: { calculation, lines: [line], complete: false },
      }),
    ).toEqual({ status: 'pending', reason: 'tax_lines_incomplete' });
  });
});

const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('BILLING_TEST_DATABASE_URL is required');
}
const adminClient = postgres(databaseUrl, { max: 4, prepare: false });
const runtimeClient = postgres(databaseUrl, {
  max: 4,
  prepare: false,
  connection: { role: 'tau_billing_runtime' },
});
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const stripeAccountId = 'acct_reload_foundation';

/** Each account owns a distinct remote Customer; the remote identity slot is unique per Stripe account. */
const customers = new Map<string, Record<string, string>>();
const sessions = new Map<string, { metadata: Record<string, string>; customerId: string }>();
const calculations = new Map<string, { reference: string; customerId: string }>();
const paymentIntents = new Map<string, Record<string, unknown>>();
let payments: BillingPaymentsService;
let ledger: CreditLedgerService;
let sequence = 0;
let taxPostCount = 0;
let setupPostCount = 0;
let paymentPostCount = 0;
let checkoutPaymentPostCount = 0;
let dropTaxResponse = false;
let taxHook: { readonly customerId: string; readonly run: () => Promise<void> } | undefined;
let paymentStatus: 'requires_action' | 'canceled' = 'requires_action';
/** The next setup Session is created open and already past its expiry; `expire` then closes it. */
let nextSetupOpenAndExpired = false;
const openSetupSessions = new Map<string, { status: 'open' | 'expired'; expiresAt: number }>();
let expirePostCount = 0;
let failExpire = false;

const stripeServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const send = (body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const readForm = (callback: (form: URLSearchParams) => void | Promise<void>): void => {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', async () => {
      await callback(new URLSearchParams(chunks.join('')));
    });
  };
  if (request.method === 'POST' && url.pathname === '/v1/customers') {
    readForm((form) => {
      sequence += 1;
      const id = `cus_reload_${sequence}`;
      const metadata = {
        tau_account_id: form.get('metadata[tau_account_id]') ?? '',
        tau_customer_binding_id: form.get('metadata[tau_customer_binding_id]') ?? '',
      };
      customers.set(id, metadata);
      send({ id, object: 'customer', livemode: false, metadata });
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/tax/calculations') {
    readForm(async (form) => {
      taxPostCount += 1;
      const reference = form.get('line_items[0][reference]') ?? '';
      const id = `taxcalc_${createHash('sha256').update(reference).digest('hex').slice(0, 24)}`;
      const customerId = form.get('customer') ?? '';
      calculations.set(id, { reference, customerId });
      if (dropTaxResponse) {
        dropTaxResponse = false;
        response.destroy();
        return;
      }
      const hook = taxHook;
      if (hook === undefined || hook.customerId !== customerId) {
        send(taxCalculation(id));
        return;
      }
      taxHook = undefined;
      try {
        await hook.run();
      } catch {
        response.destroy();
        return;
      }
      send(taxCalculation(id));
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    readForm((form) => {
      sequence += 1;
      const customerId = form.get('customer') ?? '';
      if (form.get('mode') === 'payment') {
        checkoutPaymentPostCount += 1;
        send({
          id: `cs_replacement_${sequence}`,
          object: 'checkout.session',
          client_reference_id: form.get('client_reference_id'),
          customer: customerId,
          livemode: false,
          metadata: {},
          mode: 'payment',
          status: 'open',
          expires_at: 2_000_000_000,
          url: 'http://127.0.0.1:3000/settings/billing',
        });
        return;
      }
      setupPostCount += 1;
      const id = `cs_reload_${sequence}`;
      if (nextSetupOpenAndExpired) {
        nextSetupOpenAndExpired = false;
        openSetupSessions.set(id, { status: 'open', expiresAt: Math.floor(Date.now() / 1000) - 60 });
      }
      sessions.set(id, {
        customerId,
        metadata: {
          tau_reload_consent_id: form.get('metadata[tau_reload_consent_id]') ?? '',
          tau_reload_consent_version: form.get('metadata[tau_reload_consent_version]') ?? '',
          tau_provider_leg_id: form.get('metadata[tau_provider_leg_id]') ?? '',
        },
      });
      setTimeout(() => {
        send(setupSession(id));
      }, 25);
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/payment_intents') {
    readForm((form) => {
      paymentPostCount += 1;
      const id = `pi_${form.get('metadata[tau_provider_leg_id]') ?? paymentPostCount}`;
      const intent = {
        id,
        object: 'payment_intent',
        amount: Number(form.get('amount')),
        amount_capturable: 0,
        amount_received: 0,
        created: 1_770_336_100,
        currency: 'usd',
        customer: form.get('customer'),
        latest_charge: null,
        livemode: false,
        metadata: {
          tau_purchase_id: form.get('metadata[tau_purchase_id]'),
          tau_customer_binding_id: form.get('metadata[tau_customer_binding_id]'),
          tau_provider_leg_id: form.get('metadata[tau_provider_leg_id]'),
          tau_reload_consent_id: form.get('metadata[tau_reload_consent_id]'),
          tau_reload_consent_version: form.get('metadata[tau_reload_consent_version]'),
        },
        payment_method: form.get('payment_method'),
        status: paymentStatus,
      };
      paymentIntents.set(id, intent);
      send(intent);
    });
    return;
  }
  const cancelled = /^\/v1\/payment_intents\/(?<id>[^/]+)\/cancel$/u.exec(url.pathname)?.groups?.['id'];
  if (request.method === 'POST' && cancelled !== undefined) {
    const intent = paymentIntents.get(cancelled);
    if (intent !== undefined) {
      intent['status'] = 'canceled';
      intent['amount_received'] = 0;
      intent['amount_capturable'] = 0;
    }
    send(intent ?? { error: { type: 'invalid_request_error', message: cancelled } });
    return;
  }
  const expiring = /^\/v1\/checkout\/sessions\/(?<id>cs_reload_\d+)\/expire$/u.exec(url.pathname)?.groups?.['id'];
  if (request.method === 'POST' && expiring !== undefined) {
    expirePostCount += 1;
    const open = openSetupSessions.get(expiring);
    if (failExpire || open === undefined) {
      failExpire = false;
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { type: 'api_error', message: 'expire fixture failure' } }));
      return;
    }
    open.status = 'expired';
    send(setupSession(expiring));
    return;
  }
  const sessionId = /^\/v1\/checkout\/sessions\/(?<id>cs_reload_\d+)$/u.exec(url.pathname)?.groups?.['id'];
  const setupIntentId = /^\/v1\/setup_intents\/(?<id>seti_reload_\d+)$/u.exec(url.pathname)?.groups?.['id'];
  const paymentMethodId = /^\/v1\/payment_methods\/(?<id>pm_reload_\d+)$/u.exec(url.pathname)?.groups?.['id'];
  const customerId = /^\/v1\/customers\/(?<id>cus_reload_\d+)$/u.exec(url.pathname)?.groups?.['id'];
  const calculationId = /^\/v1\/tax\/calculations\/(?<id>taxcalc_[\da-f]+)(?:\/line_items)?$/u.exec(url.pathname)
    ?.groups?.['id'];
  const paymentIntentId = /^\/v1\/payment_intents\/(?<id>pi_[\w-]+)$/u.exec(url.pathname)?.groups?.['id'];
  const body =
    sessionId !== undefined && sessions.has(sessionId)
      ? setupSession(sessionId)
      : setupIntentId !== undefined && sessions.has(setupIntentId.replace('seti_', 'cs_'))
        ? setupIntent(setupIntentId)
        : paymentMethodId !== undefined && sessions.has(paymentMethodId.replace('pm_', 'cs_'))
          ? {
              id: paymentMethodId,
              object: 'payment_method',
              customer: sessions.get(paymentMethodId.replace('pm_', 'cs_'))?.customerId,
              type: 'card',
              card: { brand: 'visa', last4: '4242' },
            }
          : customerId !== undefined && customers.has(customerId)
            ? {
                id: customerId,
                object: 'customer',
                deleted: false,
                livemode: false,
                metadata: customers.get(customerId),
                address,
              }
            : calculationId !== undefined && calculations.has(calculationId)
              ? url.pathname.endsWith('/line_items')
                ? { object: 'list', data: [taxLine(calculationId)], has_more: false, url: url.pathname }
                : taxCalculation(calculationId)
              : paymentIntentId !== undefined && paymentIntents.has(paymentIntentId)
                ? paymentIntents.get(paymentIntentId)
                : { error: { type: 'invalid_request_error', message: `Missing fixture ${url.pathname}` } };
  const missing = typeof body === 'object' && 'error' in body;
  response.writeHead(missing ? 404 : 200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

function taxCalculation(id: string) {
  return {
    id,
    object: 'tax.calculation',
    amount_total: 2875,
    currency: 'usd',
    customer: calculations.get(id)?.customerId,
    customer_details: { address, address_source: 'billing' },
    expires_at: 2_000_000_000,
    livemode: false,
    tax_amount_exclusive: 375,
    tax_amount_inclusive: 0,
  };
}

function taxLine(id: string) {
  return {
    id: 'tax_li_reload_native',
    object: 'tax.calculation_line_item',
    amount: 2500,
    amount_tax: 375,
    livemode: false,
    product: 'prod_reload',
    quantity: 1,
    reference: calculations.get(id)?.reference,
    tax_behavior: 'exclusive',
  };
}

function setupSession(id: string) {
  const stored = sessions.get(id);
  return {
    id,
    object: 'checkout.session',
    client_reference_id: stored?.metadata['tau_reload_consent_id'],
    customer: stored?.customerId,
    livemode: false,
    metadata: stored?.metadata,
    mode: 'setup',
    setup_intent: id.replace('cs_', 'seti_'),
    status: openSetupSessions.get(id)?.status ?? 'complete',
    expires_at: openSetupSessions.get(id)?.expiresAt ?? 2_000_000_000,
    url: 'http://127.0.0.1:3000/settings/billing',
  };
}

function setupIntent(id: string) {
  const stored = sessions.get(id.replace('seti_', 'cs_'));
  return {
    id,
    object: 'setup_intent',
    customer: stored?.customerId,
    livemode: false,
    metadata: stored?.metadata,
    payment_method: id.replace('seti_', 'pm_'),
    status: 'succeeded',
    usage: 'off_session',
  };
}

describe('billing reload native service foundation', { concurrent: false }, () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      stripeServer.listen(0, '127.0.0.1', resolve);
    });
    const bound = stripeServer.address();
    if (bound === null || typeof bound === 'string') {
      throw new Error('Stripe fixture address unavailable');
    }
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_reload_fixture',
      fixtureUrl: `http://127.0.0.1:${(bound satisfies AddressInfo).port}/`,
    });
    const policy = new BillingPolicyService({ database: runtimeDatabase });
    ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
    const cash = new BillingCashService({ database: runtimeDatabase }, stripe, stripe, ledger, {
      environment: 'development',
      stripeAccountId,
      livemode: false,
    });
    payments = new BillingPaymentsService(
      { database: runtimeDatabase },
      stripe,
      stripe,
      {
        environment: 'development',
        stripeAccountId,
        livemode: false,
        uiOrigin: 'http://127.0.0.1:3000',
        webhookSecret: 'whsec_reload_fixture_123456',
        collection: { kind: 'local_fixture', monthlyPriceId: 'price_monthly', topupProductId: 'prod_reload' },
      },
      policy,
      ledger,
      cash,
    );
    // Reload work is claimed globally by due order; retire every foreign wake so this fixture owns the queue.
    await database
      .update(billingReloadWork)
      .set({ state: 'done', leaseUntil: null, nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(ne(billingReloadWork.state, 'done'));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      stripeServer.close((error) => {
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      });
    });
    await Promise.all([adminClient.end(), runtimeClient.end()]);
  });

  it('denies consent while the effective policy has no automatic reload capability', async () => {
    await seedPolicy(undefined);
    const userId = await seedUser();
    await expect(
      payments.prepareReloadConsent(userId, { requestId: randomUUID(), returnPath: '/settings/billing' }),
    ).rejects.toMatchObject({ response: { code: 'automatic_reload_unavailable' } });
    await seedPolicy(controls());
  });

  it('quotes first, then explicitly confirms and enables an owned off-session SetupIntent', async () => {
    const userId = await seedUser();
    const posts = setupPostCount;
    const prepared = await payments.prepareReloadConsent(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
    });
    expect(prepared.state).toBe('prepared');
    const confirmed = await Promise.allSettled([
      payments.confirmAction(userId, prepared.actionId),
      payments.confirmAction(userId, prepared.actionId),
    ]);
    // The loser either overlaps the dispatch (outcome unknown) or arrives after the link and replays it.
    for (const result of confirmed) {
      if (result.status === 'fulfilled') {
        expect(result.value).toMatchObject({ state: 'redirect_required' });
      } else {
        expect(result.reason).toMatchObject({ response: { code: 'reload_setup_outcome_unknown' } });
      }
    }
    expect(confirmed.some((result) => result.status === 'fulfilled')).toBe(true);
    expect(setupPostCount).toBe(posts + 1);

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    await expect(payments.getReloadConsent(userId)).resolves.toMatchObject({
      state: 'enabled',
      paymentMethod: { brand: 'visa', last4: '4242' },
    });
    expect(await consentRow(prepared.actionId)).toMatchObject({
      consentedAt: expect.any(Date),
      setupIntentId: expect.stringMatching(/^seti_reload_\d+$/u),
      paymentMethodId: expect.stringMatching(/^pm_reload_\d+$/u),
      state: 'enabled',
    });
    const setupLeg = await database.query.billingProviderLeg.findFirst({
      where: eq(billingProviderLeg.reloadConsentId, prepared.actionId),
    });
    if (setupLeg?.expiresAt === null || setupLeg?.expiresAt === undefined) {
      throw new Error('Known setup expiry missing');
    }
    await expect(
      runtimeClient`update billing.billing_provider_leg set expires_at=${new Date(setupLeg.expiresAt.getTime() + 1000).toISOString()}::timestamptz where id=${setupLeg.id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('expires an abandoned setup Session once and retries a failed expiry only after its pacing', async () => {
    const userId = await seedUser();
    const prepared = await payments.prepareReloadConsent(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
    });
    nextSetupOpenAndExpired = true;
    await payments.confirmAction(userId, prepared.actionId);
    const legFor = async () =>
      database.query.billingProviderLeg.findFirst({
        where: eq(billingProviderLeg.reloadConsentId, prepared.actionId),
      });
    const leg = await legFor();
    expect(leg).toMatchObject({ state: 'known', kind: 'checkout_setup' });
    if (leg === undefined) {
      throw new Error('Setup leg missing');
    }

    failExpire = true;
    const expirePostsBefore = expirePostCount;
    const first = await payments.expireReloadRecoveries({ environment: 'development', limit: 100 });
    expect(first.failed).toContain(leg.id);
    expect(expirePostCount).toBe(expirePostsBefore + 1);
    const paced = await legFor();
    expect(paced).toMatchObject({ state: 'known', expirationRequestedAt: expect.any(Date) });
    expect(paced?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not yet due: the failed leg is not re-claimed in a busy loop.
    const skipped = await payments.expireReloadRecoveries({ environment: 'development', limit: 100 });
    expect([...skipped.processed, ...skipped.failed, ...skipped.pending]).not.toContain(leg.id);

    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(billingProviderLeg.id, leg.id));
    const retried = await payments.expireReloadRecoveries({ environment: 'development', limit: 100 });
    expect(retried.processed).toContain(leg.id);
    expect(expirePostCount).toBe(expirePostsBefore + 2);
    expect(await legFor()).toMatchObject({
      state: 'expired',
      expirationRequestedAt: paced?.expirationRequestedAt,
      terminalEvidence: expect.objectContaining({ status: 'expired', mode: 'setup' }),
    });
    // The abandoned consent is retired, never offered as a live redirect, and the account can set up again.
    expect(await consentRow(prepared.actionId)).toMatchObject({ state: 'revoked' });
    await expect(payments.getReloadConsent(userId)).resolves.toMatchObject({
      state: 'revoked',
      setupAction: { state: 'canceled', redirectUrl: null },
    });
    await expect(
      payments.prepareReloadConsent(userId, { requestId: randomUUID(), returnPath: '/settings/billing' }),
    ).resolves.toMatchObject({ state: 'prepared' });
  });

  it('never repeats the consent Tax Calculation after a lost response and recovers the known quote', async () => {
    const userId = await seedUser();
    const requestId = randomUUID();
    const posts = taxPostCount;

    // Killed after Stripe accepted the calculation but before the local identity update.
    dropTaxResponse = true;
    await expect(
      payments.prepareReloadConsent(userId, { requestId, returnPath: '/settings/billing' }),
    ).rejects.toBeDefined();
    expect(taxPostCount).toBe(posts + 1);
    const accountId = await accountFor(userId);
    const legs = await database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.accountId, accountId), eq(billingProviderLeg.kind, 'tax_calculation')));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ state: 'dispatched', providerObjectId: null });

    // The same request repeats without a second POST and stays a visible unknown.
    await expect(
      payments.prepareReloadConsent(userId, { requestId, returnPath: '/settings/billing' }),
    ).rejects.toMatchObject({ response: { code: 'reload_tax_outcome_unknown' } });
    expect(taxPostCount).toBe(posts + 1);
    expect(
      await database.select().from(billingReloadConsent).where(eq(billingReloadConsent.accountId, accountId)),
    ).toHaveLength(0);

    // The generic recovery pass has no source query for a Tax Calculation: it must leave the stuck leg
    // alone instead of re-claiming it every batch as `provider_source_unknown`.
    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const [untouched] = await database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.accountId, accountId), eq(billingProviderLeg.kind, 'tax_calculation')));
    expect(untouched).toMatchObject({ state: 'dispatched', providerObjectId: null, errorCode: null });
    expect(taxPostCount).toBe(posts + 1);
  });

  it('reuses a known consent quote when the final consent transaction fails', async () => {
    const blocking = await enableConsent();
    const requestId = randomUUID();
    const posts = taxPostCount;

    // An already active consent fails the final transaction only after the calculation is known.
    await expect(
      payments.prepareReloadConsent(blocking.userId, { requestId, returnPath: '/settings/billing' }),
    ).rejects.toMatchObject({ response: { code: 'reload_consent_already_active' } });
    expect(taxPostCount).toBe(posts + 1);

    await payments.revokeReloadConsent(blocking.userId, blocking.consentId);
    const replay = await payments.prepareReloadConsent(blocking.userId, {
      requestId,
      returnPath: '/settings/billing',
    });
    expect(taxPostCount).toBe(posts + 1);
    expect(await consentRow(replay.actionId)).toMatchObject({ state: 'pending_setup', requestId });
  });

  it('revokes without a new automatic purchase and never repeats a lost setup dispatch', async () => {
    const { userId, consentId, accountId } = await enableConsent();
    await queueReloadWork(accountId);
    await payments.revokeReloadConsent(userId, consentId);
    expect(await reloadOutcome(accountId)).toEqual(declined);
    expect(await automaticPurchases(accountId)).toHaveLength(0);

    const replacement = await payments.prepareReloadConsent(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
    });
    const replacementConsent = await consentRow(replacement.actionId);
    const lostLegId = randomUUID();
    const lostReturnUrl = `http://127.0.0.1:3000/settings/billing?payment_action=${replacementConsent.id}`;
    const lostRequest = {
      kind: 'checkout_setup',
      customerBindingId: replacementConsent.customerBindingId,
      consentId: replacementConsent.id,
      consentVersion: replacementConsent.version,
      successUrl: lostReturnUrl,
      cancelUrl: lostReturnUrl,
    };
    await database.insert(billingProviderLeg).values({
      id: lostLegId,
      accountId: replacementConsent.accountId,
      environment: 'development',
      customerBindingId: replacementConsent.customerBindingId,
      reloadConsentId: replacementConsent.id,
      kind: 'checkout_setup',
      requestId: replacementConsent.requestId,
      requestHash: createHash('sha256').update(JSON.stringify(lostRequest)).digest('hex'),
      request: lostRequest,
      idempotencyKey: `tau:${lostLegId}`,
      state: 'dispatched',
      dispatchStartedAt: new Date(),
    });
    const posts = setupPostCount;
    await expect(payments.confirmAction(userId, replacement.actionId)).rejects.toMatchObject({
      response: { code: 'reload_setup_outcome_unknown' },
    });
    expect(setupPostCount).toBe(posts);
  });

  it('triggers strictly below the frozen threshold and never at it', async () => {
    const { accountId } = await enableConsent();
    await setAvailable(accountId, 100n);
    await queueReloadWork(accountId);
    expect(await reloadOutcome(accountId)).toEqual(declined);
    expect(await automaticPurchases(accountId)).toHaveLength(0);

    await setAvailable(accountId, 99n);
    await queueReloadWork(accountId);
    expect(await reloadOutcome(accountId)).toEqual(created);
    expect(await automaticPurchases(accountId)).toHaveLength(1);
  });

  it('still charges a wake that waited in the queue longer than fifteen minutes', async () => {
    const { accountId } = await enableConsent();
    await queueReloadWork(accountId);
    await database
      .update(billingReloadWork)
      .set({ updatedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(billingReloadWork.accountId, accountId));
    expect(await reloadOutcome(accountId)).toEqual(created);
    expect(await automaticPurchases(accountId)).toHaveLength(1);
  });

  it('queues a funded-work wake only for an account with an enabled consent', async () => {
    const denial = (
      authUserId: string,
    ): { environment: 'development'; authUserId: string; attemptKey: string; requestDigest: string } => ({
      environment: 'development',
      authUserId,
      attemptKey: randomUUID(),
      requestDigest: 'a'.repeat(64),
    });
    const unconsentedUser = await seedUser();
    const unconsentedAccountId = await ledger.ensureAccountBinding({
      authUserId: unconsentedUser,
      environment: 'development',
    });
    await ledger.recordFundedWorkDenial(denial(unconsentedUser));
    await expect(
      database.query.billingReloadWork.findFirst({ where: eq(billingReloadWork.accountId, unconsentedAccountId) }),
    ).resolves.toBeUndefined();

    const consented = await enableConsent();
    await ledger.recordFundedWorkDenial(denial(consented.userId));
    await expect(
      database.query.billingReloadWork.findFirst({ where: eq(billingReloadWork.accountId, consented.accountId) }),
    ).resolves.toMatchObject({ state: 'pending', reasonKind: 'insufficient_funds' });
    await database
      .update(billingReloadWork)
      .set({ state: 'done', leaseUntil: null, nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingReloadWork.accountId, consented.accountId));
  });

  it('revalidates balance, consent and work generation at the locked dispatch boundary', async () => {
    // The hook runs while the quote is in flight: after the pre-lock eligibility read, before the locked dispatch.
    const replenished = await enableConsent();
    await queueReloadWork(replenished.accountId);
    taxHook = {
      customerId: await customerFor(replenished.accountId),
      run: async () => {
        await setAvailable(replenished.accountId, 5000n);
      },
    };
    expect(await reloadOutcome(replenished.accountId)).toEqual(declined);
    expect(taxHook).toBeUndefined();

    const revoked = await enableConsent();
    await queueReloadWork(revoked.accountId);
    taxHook = {
      customerId: await customerFor(revoked.accountId),
      run: async () => {
        await payments.revokeReloadConsent(revoked.userId, revoked.consentId);
      },
    };
    expect(await reloadOutcome(revoked.accountId)).toEqual(declined);
    expect(taxHook).toBeUndefined();

    const expired = await enableConsent();
    await queueReloadWork(expired.accountId);
    const posts = paymentPostCount;
    taxHook = {
      customerId: await customerFor(expired.accountId),
      run: async () => {
        await database
          .update(billingReloadWork)
          .set({ state: 'pending', generation: 99n, leaseUntil: null })
          .where(eq(billingReloadWork.accountId, expired.accountId));
      },
    };
    const wake = await runReloadWork();
    expect(wake.pending).toContain(expired.accountId);
    expect(taxHook).toBeUndefined(); // The bumped generation leaves the wake row for the cleanup below.
    expect(await automaticPurchases(expired.accountId)).toHaveLength(0);
    expect(paymentPostCount).toBe(posts);
    await database
      .update(billingReloadWork)
      .set({ state: 'done', leaseUntil: null, nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingReloadWork.accountId, expired.accountId));
  });

  it('serializes two concurrent workers into one automatic purchase within the remaining cap slot', async () => {
    const { accountId, consent } = await enableConsent();
    await seedAcceptedAutomatic({ accountId, consent, grossMinor: 7000n, acceptedAt: new Date() });
    await queueReloadWork(accountId);
    const posts = paymentPostCount;

    const [first, second] = await Promise.all([runReloadWork(), runReloadWork()]);
    expect(
      [...first.processed, ...second.processed, ...first.failed, ...second.failed].filter((id) => id === accountId),
    ).toEqual([accountId]);
    expect([...first.failed, ...second.failed]).not.toContain(accountId);
    expect(await automaticPurchases(accountId)).toHaveLength(1);
    expect(paymentPostCount).toBe(posts + 1);
  });

  it('counts accepted gross in the source month only and blocks the step that exceeds the cap', async () => {
    const capped = await enableConsent();
    await seedAcceptedAutomatic({
      accountId: capped.accountId,
      consent: capped.consent,
      grossMinor: 7500n,
      acceptedAt: new Date(),
    });
    await queueReloadWork(capped.accountId);
    const taxPosts = taxPostCount;
    expect(await reloadOutcome(capped.accountId)).toEqual(declined);
    expect(await automaticPurchases(capped.accountId)).toHaveLength(0);
    // The cap is decided before any Stripe Tax quote, so a capped wake costs no provider call.
    expect(taxPostCount).toBe(taxPosts);

    const carried = await enableConsent();
    const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 86_400_000);
    await seedAcceptedAutomatic({
      accountId: carried.accountId,
      consent: carried.consent,
      grossMinor: 9000n,
      acceptedAt: lastMonth,
    });
    await queueReloadWork(carried.accountId);
    expect(await reloadOutcome(carried.accountId)).toEqual(created);
    expect(await automaticPurchases(carried.accountId)).toHaveLength(1);
  });

  it('keeps an SCA replacement inside the same automatic purchase and capacity', async () => {
    const { userId, accountId } = await enableConsent();
    await queueReloadWork(accountId);
    expect(await reloadOutcome(accountId)).toEqual(created);
    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const [automatic] = await automaticPurchases(accountId);
    if (automatic === undefined) {
      throw new Error('Automatic purchase fixture missing');
    }
    await expect(payments.getAction(userId, automatic.id)).resolves.toMatchObject({
      state: 'attention_required',
      attention: { reason: 'authentication_required', action: 'continue_hosted' },
    });

    const replacements = checkoutPaymentPostCount;
    const recovered = await payments.recoverAction(userId, automatic.id);
    expect(recovered.actionId).toBe(automatic.id);
    expect(checkoutPaymentPostCount).toBe(replacements + 1);
    expect(await automaticPurchases(accountId)).toHaveLength(1);
    const legs = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, automatic.id));
    expect(legs.filter((leg) => leg.state === 'no_charge')).toHaveLength(1);
    expect(legs.filter((leg) => leg.kind === 'checkout_payment')).toHaveLength(1);
  });

  it('disables the consent after exactly the configured number of conclusive terminal failures', async () => {
    const { accountId, consentId } = await enableConsent();
    paymentStatus = 'canceled';
    try {
      await queueReloadWork(accountId);
      expect(await reloadOutcome(accountId)).toEqual(created);
      await expireLegLeases(accountId);
      expect(await terminalFailure(accountId)).toEqual({
        purchase: 'failed',
        outcome: 'no_charge_failure',
        legs: [['no_charge', null]],
      });
      expect(await consentRow(consentId)).toMatchObject({ state: 'enabled', consecutiveTerminalFailures: 1 });

      await database
        .update(billingReloadConsent)
        .set({ lastAutomaticStartedAt: new Date(Date.now() - 7_200_000) })
        .where(eq(billingReloadConsent.id, consentId));
      await queueReloadWork(accountId);
      expect(await reloadOutcome(accountId)).toEqual(created);
      await expireLegLeases(accountId);
      expect(await terminalFailure(accountId)).toEqual({
        purchase: 'failed',
        outcome: 'no_charge_failure',
        legs: [['no_charge', null]],
      });
      expect(await consentRow(consentId)).toMatchObject({
        state: 'disabled_failures',
        consecutiveTerminalFailures: 2,
      });
    } finally {
      paymentStatus = 'requires_action';
    }
  });

  it('closes a never-dispatched automatic purchase whose wake moved on and returns its monthly capacity', async () => {
    const { accountId, consent } = await enableConsent();
    const startedAt = new Date(Date.now() - 7_200_000);
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt,
      purchaseState: 'prepared',
      legState: 'prepared',
    });
    await seedAcceptedAutomatic({ accountId, consent, grossMinor: 7000n, acceptedAt: new Date() });
    // The account's own wake row has already moved past the generation frozen in the seeded leg.
    await queueReloadWork(accountId);
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const orphan = await database.query.billingPurchase.findFirst({ where: eq(billingPurchase.id, seeded.purchaseId) });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: orphan?.state ?? null,
      outcome: orphan?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      errorCode: leg?.errorCode ?? null,
      dispatched: leg?.dispatchStartedAt ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({
      purchase: 'failed',
      outcome: 'no_charge_failure',
      leg: 'no_charge',
      errorCode: 'automatic_wake_superseded',
      dispatched: null,
      posts: 0,
    });
    expect(leg?.cancellationConfirmedAt).toBeInstanceOf(Date);

    // The released ceiling is what the next wake needs: 7000 accepted this month plus one more ceiling still fits.
    expect(await reloadOutcome(accountId)).toEqual(created);
    expect(await automaticPurchases(accountId)).toHaveLength(1);
  });

  it('closes a prepared automatic purchase whose consent was revoked before its wake confirmed', async () => {
    const { userId, consentId, accountId, consent } = await enableConsent();
    const startedAt = new Date(Date.now() - 7_200_000);
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt,
      purchaseState: 'prepared',
      legState: 'prepared',
    });
    // The wake row still sits at the generation frozen in the leg: only the consent moved, and it never returns.
    await parkReloadWork(accountId);
    await payments.revokeReloadConsent(userId, consentId);
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const orphan = await database.query.billingPurchase.findFirst({ where: eq(billingPurchase.id, seeded.purchaseId) });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: orphan?.state ?? null,
      outcome: orphan?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      errorCode: leg?.errorCode ?? null,
      dispatched: leg?.dispatchStartedAt ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({
      purchase: 'failed',
      outcome: 'no_charge_failure',
      leg: 'no_charge',
      errorCode: 'automatic_consent_revoked',
      dispatched: null,
      posts: 0,
    });
    // The account's single automatic slot is free again for the consent that replaces this one.
    expect(await automaticPurchases(accountId)).toHaveLength(0);
  });

  it('closes a prepared automatic purchase whose frozen request no longer matches the canonical one', async () => {
    const { consentId, accountId, consent } = await enableConsent();
    const startedAt = new Date(Date.now() - 7_200_000);
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt,
      purchaseState: 'prepared',
      legState: 'prepared',
    });
    await parkReloadWork(accountId);
    const posts = paymentPostCount;

    // Every fence clause passes, so the caller's canonical request is the only refusal left; a frozen request
    // that disagrees with it can never agree with it later, which is why this closes instead of retrying.
    await (payments as unknown as AutomaticConfirm).confirmAutomaticPurchase(
      accountId,
      consentId,
      seeded.purchaseId,
      seeded.legId,
      { kind: 'payment_intent', idempotencyKey: `tau:${seeded.legId}`, request: { amount: 1 } },
      99n,
    );

    const orphan = await database.query.billingPurchase.findFirst({ where: eq(billingPurchase.id, seeded.purchaseId) });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: orphan?.state ?? null,
      outcome: orphan?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      errorCode: leg?.errorCode ?? null,
      dispatched: leg?.dispatchStartedAt ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({
      purchase: 'failed',
      outcome: 'no_charge_failure',
      leg: 'no_charge',
      errorCode: 'automatic_request_digest_mismatch',
      dispatched: null,
      posts: 0,
    });
    expect(await automaticPurchases(accountId)).toHaveLength(0);
  });

  it('keeps a prepared automatic purchase retryable when funds arrived before its wake confirmed', async () => {
    const { accountId, consent } = await enableConsent();
    const startedAt = new Date(Date.now() - 7_200_000);
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt,
      purchaseState: 'prepared',
      legState: 'prepared',
    });
    await parkReloadWork(accountId);
    await setAvailable(accountId, 5000n);
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const refused = await database.query.billingPurchase.findFirst({
      where: eq(billingPurchase.id, seeded.purchaseId),
    });
    const waiting = await database.query.billingProviderLeg.findFirst({
      where: eq(billingProviderLeg.id, seeded.legId),
    });
    expect({
      purchase: refused?.state ?? null,
      outcome: refused?.automaticTerminalOutcome ?? null,
      leg: waiting?.state ?? null,
      errorCode: waiting?.errorCode ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({ purchase: 'prepared', outcome: null, leg: 'prepared', errorCode: null, posts: 0 });
    // The claim paced the refusal: the leg is not re-claimable until its lease expires, so no pass busy-loops it.
    expect(waiting?.nextAttemptAt.getTime() ?? 0).toBeGreaterThan(Date.now());

    // The same prepared purchase still dispatches once the balance falls below the frozen threshold again.
    await setAvailable(accountId, 0n);
    await expireLegLeases(accountId);
    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const completed = await database.query.billingPurchase.findFirst({
      where: eq(billingPurchase.id, seeded.purchaseId),
    });
    const dispatched = await database.query.billingProviderLeg.findFirst({
      where: eq(billingProviderLeg.id, seeded.legId),
    });
    expect({
      purchase: completed?.state ?? null,
      leg: dispatched?.state ?? null,
      object: dispatched?.providerObjectId ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({ purchase: 'pending', leg: 'known', object: expect.stringMatching(/^pi_/u), posts: 1 });
  });

  it('closes a prepared automatic purchase whose frozen Tax Calculation expired before it dispatched', async () => {
    const { accountId, consent } = await enableConsent();
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt: new Date(Date.now() - 7_200_000),
      purchaseState: 'prepared',
      legState: 'prepared',
      taxExpiresAt: new Date(Date.now() - 60_000),
    });
    // Every other fence passes, so the frozen quote is the only refusal left.
    await parkReloadWork(accountId);
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const orphan = await database.query.billingPurchase.findFirst({ where: eq(billingPurchase.id, seeded.purchaseId) });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: orphan?.state ?? null,
      outcome: orphan?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      errorCode: leg?.errorCode ?? null,
      dispatched: leg?.dispatchStartedAt ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({
      purchase: 'failed',
      outcome: 'no_charge_failure',
      leg: 'no_charge',
      errorCode: 'automatic_tax_calculation_expired',
      dispatched: null,
      posts: 0,
    });

    // Confirm never re-quotes: the next wake is what re-prepares the purchase against a fresh calculation.
    await queueReloadWork(accountId);
    expect(await reloadOutcome(accountId)).toEqual(created);
  });

  it('dispatches a prepared automatic purchase whose frozen Tax Calculation is still live', async () => {
    const { accountId, consent } = await enableConsent();
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt: new Date(Date.now() - 7_200_000),
      purchaseState: 'prepared',
      legState: 'prepared',
      taxExpiresAt: new Date(Date.now() + 3_600_000),
    });
    await parkReloadWork(accountId);
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const purchase = await database.query.billingPurchase.findFirst({
      where: eq(billingPurchase.id, seeded.purchaseId),
    });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: purchase?.state ?? null,
      leg: leg?.state ?? null,
      object: leg?.providerObjectId ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({ purchase: 'pending', leg: 'known', object: expect.stringMatching(/^pi_/u), posts: 1 });
  });

  it('parks a cap-refused automatic payment leg at the next UTC month boundary', async () => {
    const { accountId, consent } = await enableConsent();
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt: new Date(Date.now() - 7_200_000),
      purchaseState: 'prepared',
      legState: 'prepared',
    });
    await parkReloadWork(accountId);
    // Accepted this month, so the confirm-side sum (this purchase's ceiling plus the accepted gross) exceeds the cap.
    await seedAcceptedAutomatic({
      accountId,
      consent,
      grossMinor: consent.monthlyGrossCapMinor,
      acceptedAt: new Date(),
    });
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const purchase = await database.query.billingPurchase.findFirst({
      where: eq(billingPurchase.id, seeded.purchaseId),
    });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    const now = new Date();
    const boundary = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    expect({
      purchase: purchase?.state ?? null,
      outcome: purchase?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      errorCode: leg?.errorCode ?? null,
      // The refusal cannot change before the accepted purchase rolls off, so the leg waits exactly that long.
      nextAttemptAt: leg?.nextAttemptAt.toISOString() ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({
      purchase: 'prepared',
      outcome: null,
      leg: 'prepared',
      errorCode: 'automatic_monthly_cap_reached',
      nextAttemptAt: boundary.toISOString(),
      posts: 0,
    });
  });

  it('leaves a dispatched automatic payment leg to provider recovery', async () => {
    const { accountId, consent } = await enableConsent();
    const startedAt = new Date(Date.now() - 7_200_000);
    const seeded = await seedSupersededAutomatic({
      accountId,
      consent,
      startedAt,
      purchaseState: 'creating',
      legState: 'dispatched',
    });
    const posts = paymentPostCount;

    await payments.recoverPayments({ environment: 'development', limit: 50 });
    const purchase = await database.query.billingPurchase.findFirst({
      where: eq(billingPurchase.id, seeded.purchaseId),
    });
    const leg = await database.query.billingProviderLeg.findFirst({ where: eq(billingProviderLeg.id, seeded.legId) });
    expect({
      purchase: purchase?.state ?? null,
      outcome: purchase?.automaticTerminalOutcome ?? null,
      leg: leg?.state ?? null,
      cancelled: leg?.cancellationConfirmedAt ?? null,
      posts: paymentPostCount - posts,
    }).toEqual({ purchase: 'creating', outcome: null, leg: 'dispatched', cancelled: null, posts: 0 });
  });
});

/** The private confirm step, called directly where the caller's canonical request is the state under test. */
type AutomaticConfirm = {
  confirmAutomaticPurchase(
    accountId: string,
    consentId: string,
    purchaseId: string,
    legId: string,
    request: Record<string, unknown>,
    workGeneration: bigint,
  ): Promise<void>;
};

type EnabledConsent = {
  readonly userId: string;
  readonly consentId: string;
  readonly accountId: string;
  readonly consent: typeof billingReloadConsent.$inferSelect;
};

async function enableConsent(): Promise<EnabledConsent> {
  const userId = await seedUser();
  const prepared = await payments.prepareReloadConsent(userId, {
    requestId: randomUUID(),
    returnPath: '/settings/billing',
  });
  await payments.confirmAction(userId, prepared.actionId);
  await payments.recoverPayments({ environment: 'development', limit: 50 });
  const consent = await consentRow(prepared.actionId);
  if (consent.state !== 'enabled') {
    throw new Error(`Reload consent did not enable: ${consent.state}`);
  }
  return { userId, consentId: consent.id, accountId: consent.accountId, consent };
}

async function consentRow(consentId: string): Promise<typeof billingReloadConsent.$inferSelect> {
  const row = await database.query.billingReloadConsent.findFirst({
    where: eq(billingReloadConsent.id, consentId),
  });
  if (row === undefined) {
    throw new Error('Reload consent fixture missing');
  }
  return row;
}

async function automaticPurchases(accountId: string) {
  return database
    .select()
    .from(billingPurchase)
    .where(
      and(
        eq(billingPurchase.accountId, accountId),
        eq(billingPurchase.purpose, 'automatic'),
        isNull(billingPurchase.automaticTerminalOutcome),
      ),
    );
}

/** A wake-up row is claimed globally, so every assertion scopes itself to the account under test. */
async function runReloadWork() {
  return payments.processReloadWork({ environment: 'development', limit: 100 });
}

/** Reports the worker outcome together with the durable state it left, so a failure names its own cause. */
async function reloadOutcome(accountId: string): Promise<Record<string, unknown>> {
  const before = paymentPostCount;
  const outcome = await runReloadWork();
  const work = await database.query.billingReloadWork.findFirst({
    where: eq(billingReloadWork.accountId, accountId),
  });
  const [purchase] = await automaticPurchases(accountId);
  const leg =
    purchase === undefined
      ? undefined
      : await database.query.billingProviderLeg.findFirst({
          where: and(eq(billingProviderLeg.purchaseId, purchase.id), eq(billingProviderLeg.kind, 'payment_intent')),
        });
  return {
    processed: outcome.processed.includes(accountId),
    pending: outcome.pending.includes(accountId),
    failed: outcome.failed.includes(accountId),
    errorCode: work?.errorCode ?? null,
    purchase: purchase?.state ?? null,
    leg: leg === undefined ? null : { state: leg.state, object: leg.providerObjectId, errorCode: leg.errorCode },
    posts: paymentPostCount - before,
  };
}

const created = {
  processed: true,
  pending: false,
  failed: false,
  errorCode: null,
  purchase: 'pending',
  leg: { state: 'known', object: expect.stringMatching(/^pi_/u), errorCode: null },
  posts: 1,
};
const declined = {
  processed: false,
  pending: true,
  failed: false,
  errorCode: null,
  purchase: null,
  leg: null,
  posts: 0,
};

async function queueReloadWork(accountId: string): Promise<void> {
  await database
    .insert(billingReloadWork)
    .values({
      accountId,
      environment: 'development',
      reasonKind: 'insufficient_funds',
      observedAccountRevision: 0n,
    })
    .onConflictDoUpdate({
      target: billingReloadWork.accountId,
      set: { state: 'pending', leaseUntil: null, nextAttemptAt: new Date(), errorCode: null },
    });
}

/** Parks the wake row `done` at the generation frozen in a seeded leg, leaving only the reason under test. */
async function parkReloadWork(accountId: string): Promise<void> {
  await database
    .insert(billingReloadWork)
    .values({
      accountId,
      environment: 'development',
      reasonKind: 'insufficient_funds',
      observedAccountRevision: 0n,
      state: 'done',
      generation: 99n,
    })
    .onConflictDoUpdate({
      target: billingReloadWork.accountId,
      set: { state: 'done', generation: 99n, leaseUntil: null },
    });
}

async function accountFor(userId: string): Promise<string> {
  const binding = await database.query.billingOwnerBinding.findFirst({
    where: (table, operators) => operators.eq(table.authUserId, userId),
  });
  if (binding === undefined) {
    throw new Error('Reload owner binding missing');
  }
  return binding.accountId;
}

async function customerFor(accountId: string): Promise<string> {
  const binding = await database.query.billingStripeCustomer.findFirst({
    where: (table, operators) => operators.eq(table.accountId, accountId),
  });
  if (binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
    throw new Error('Reload Customer binding missing');
  }
  return binding.stripeCustomerId;
}

/** Runs one recovery pass and reports how the pending automatic purchase and its payment leg concluded. */
async function terminalFailure(accountId: string): Promise<Record<string, unknown>> {
  const [target] = await automaticPurchases(accountId);
  if (target === undefined) {
    throw new Error('Automatic purchase fixture missing');
  }
  await payments.recoverPayments({ environment: 'development', limit: 50 });
  const purchase = await database.query.billingPurchase.findFirst({ where: eq(billingPurchase.id, target.id) });
  const legs = await database
    .select()
    .from(billingProviderLeg)
    .where(and(eq(billingProviderLeg.purchaseId, target.id), eq(billingProviderLeg.kind, 'payment_intent')));
  return {
    purchase: purchase?.state ?? null,
    outcome: purchase?.automaticTerminalOutcome ?? null,
    legs: legs.map((leg) => [leg.state, leg.errorCode]),
  };
}

/** Retires the lease a dispatch just took so the next recovery pass claims the leg without waiting it out. */
async function expireLegLeases(accountId: string): Promise<void> {
  await database
    .update(billingProviderLeg)
    .set({ nextAttemptAt: new Date(Date.now() - 1000) })
    .where(and(eq(billingProviderLeg.accountId, accountId), ne(billingProviderLeg.state, 'no_charge')));
}

async function setAvailable(accountId: string, atoms: bigint): Promise<void> {
  await database.update(creditAccount).set({ purchasedAtoms: atoms }).where(eq(creditAccount.id, accountId));
}

/** A terminal accepted automatic purchase consumes capacity in the UTC month of its source acceptance. */
async function seedAcceptedAutomatic(input: {
  readonly accountId: string;
  readonly consent: typeof billingReloadConsent.$inferSelect;
  readonly grossMinor: bigint;
  readonly acceptedAt: Date;
}): Promise<void> {
  const { accountId, consent, grossMinor, acceptedAt } = input;
  const id = randomUUID();
  await database.insert(billingPurchase).values({
    id,
    accountId,
    sourceIdentity: `purchase:${id}`,
    offerSnapshot: { ...consent.offerSnapshot, grossMinor: grossMinor.toString() },
    creditAtoms: 1n,
    state: 'paid',
    customerBindingId: consent.customerBindingId,
    requestId: id,
    requestHash: 'accepted-capacity-fixture',
    purpose: 'automatic',
    reloadConsentId: consent.id,
    reloadConsentVersion: consent.version,
    automaticStartedAt: acceptedAt,
    automaticGrossCeilingMinor: grossMinor,
    automaticSourceAcceptedAt: acceptedAt,
    automaticTerminalOutcome: 'paid',
    automaticTerminalAt: acceptedAt,
    stripeAccountId,
    livemode: false,
  });
}

/**
 * Reproduces the durable state a worker leaves between the prepared automatic commit and its provider dispatch,
 * with a wake generation the account's work row has already moved past.
 */
async function seedSupersededAutomatic(input: {
  readonly accountId: string;
  readonly consent: typeof billingReloadConsent.$inferSelect;
  readonly startedAt: Date;
  readonly purchaseState: 'prepared' | 'creating';
  readonly legState: 'prepared' | 'dispatched';
  /** The Tax Calculation the purchase was prepared against; live an hour from now unless a case expires it. */
  readonly taxExpiresAt?: Date;
}): Promise<{ purchaseId: string; legId: string }> {
  const { accountId, consent, startedAt, purchaseState, legState, taxExpiresAt } = input;
  const purchaseId = randomUUID();
  const legId = randomUUID();
  await database.insert(billingPurchase).values({
    id: purchaseId,
    accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: { ...consent.offerSnapshot, grossMinor: consent.grossCeilingMinor.toString() },
    creditAtoms: 1n,
    state: purchaseState,
    customerBindingId: consent.customerBindingId,
    requestId: purchaseId,
    requestHash: 'superseded-wake-fixture',
    purpose: 'automatic',
    returnPath: consent.returnPath,
    reloadConsentId: consent.id,
    reloadConsentVersion: consent.version,
    automaticStartedAt: startedAt,
    automaticGrossCeilingMinor: consent.grossCeilingMinor,
    taxEvidence: {
      version: 'stripe-reload-tax-v1',
      calculationId: `taxcalc_${purchaseId}`,
      locationRevision: consent.taxEvidence['locationRevision'],
      sourceDigest: 'superseded-wake-fixture',
      expiresAt: (taxExpiresAt ?? new Date(Date.now() + 3_600_000)).toISOString(),
    },
    stripeAccountId,
    livemode: false,
  });
  await database.insert(billingProviderLeg).values({
    id: legId,
    accountId,
    environment: 'development',
    customerBindingId: consent.customerBindingId,
    purchaseId,
    reloadConsentId: consent.id,
    kind: 'payment_intent',
    requestId: purchaseId,
    requestHash: 'superseded-wake-fixture',
    request: {
      kind: 'payment_intent',
      idempotencyKey: `tau:${legId}`,
      automaticReload: true,
      request: {
        amount: Number(consent.grossCeilingMinor),
        currency: 'usd',
        customer: await customerFor(accountId),
        payment_method: consent.paymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          tau_purchase_id: purchaseId,
          tau_customer_binding_id: consent.customerBindingId,
          tau_provider_leg_id: legId,
          tau_reload_consent_id: consent.id,
          tau_reload_consent_version: String(consent.version),
          tau_reload_work_generation: '99',
        },
      },
    },
    idempotencyKey: `tau:${legId}`,
    state: legState,
    dispatchStartedAt: legState === 'dispatched' ? startedAt : null,
    nextAttemptAt: new Date(Date.now() - 1000),
  });
  await database
    .update(billingReloadConsent)
    .set({ lastAutomaticStartedAt: startedAt })
    .where(eq(billingReloadConsent.id, consent.id));
  return { purchaseId, legId };
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await database
    .insert(user)
    .values({ id, name: 'Reload Foundation', email: `${id}@test.invalid`, emailVerified: true });
  return id;
}

function controls() {
  return {
    enabled: true,
    thresholdAtoms: '100',
    principalMinor: '2500',
    monthlyGrossCapMinor: '10000',
    minimumCadenceSeconds: 3600,
    terminalFailureLimit: 2,
  };
}

async function seedPolicy(
  autoReload:
    | {
        enabled: boolean;
        thresholdAtoms: string;
        principalMinor: string;
        monthlyGrossCapMinor: string;
        minimumCadenceSeconds: number;
        terminalFailureLimit: number;
      }
    | undefined,
) {
  await seedBillingFixturePolicy({
    database,
    activationId: `reload-${randomUUID()}`,
    policy: {
      schemaVersion: 1,
      environment: 'development',
      policyVersion: `reload-${randomUUID()}`,
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
          maximumPrincipalMinor: '500000',
          creditAtomsPerPrincipalMinor: '10000',
        },
      ],
      ...(autoReload === undefined ? {} : { autoReload }),
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    },
  });
}
