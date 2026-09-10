/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures retain provider field names. */
/* oxlint-disable typescript/consistent-type-assertions, typescript/no-unsafe-assignment -- fixtures intentionally model partial provider responses */
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, {
  max: 2,
  prepare: false,
  connection: { role: 'tau_billing_runtime' },
});
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const stripeAccountId = 'acct_reload_foundation';
let customerMetadata: Record<string, string> = {};
let setupMetadata: Record<string, string> = {};
let taxReference = '';
let taxCalculationId = 'taxcalc_reload_initial';
let setupPostCount = 0;
let automaticPaymentPostCount = 0;
let automaticPaymentIntentId = 'pi_reload_sca';
let automaticPaymentIntent: Record<string, unknown> | undefined;
let enabledUserId: string | undefined;
let enabledConsentId: string | undefined;

const stripeServer = createServer((request, response) => {
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
  if (request.method === 'POST' && url.pathname === '/v1/customers') {
    readForm((form) => {
      customerMetadata = {
        tau_account_id: form.get('metadata[tau_account_id]') ?? '',
        tau_customer_binding_id: form.get('metadata[tau_customer_binding_id]') ?? '',
      };
      send({ id: 'cus_reload_native', object: 'customer', livemode: false, metadata: customerMetadata });
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/tax/calculations') {
    readForm((form) => {
      taxReference = form.get('line_items[0][reference]') ?? '';
      taxCalculationId = `taxcalc_${createHash('sha256').update(taxReference).digest('hex').slice(0, 24)}`;
      send(taxCalculation());
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    readForm((form) => {
      setupPostCount += 1;
      setupMetadata = {
        tau_reload_consent_id: form.get('metadata[tau_reload_consent_id]') ?? '',
        tau_reload_consent_version: form.get('metadata[tau_reload_consent_version]') ?? '',
        tau_provider_leg_id: form.get('metadata[tau_provider_leg_id]') ?? '',
      };
      setTimeout(() => {
        send(setupSession());
      }, 25);
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/payment_intents') {
    readForm((form) => {
      automaticPaymentPostCount += 1;
      automaticPaymentIntentId = `pi_${form.get('metadata[tau_provider_leg_id]') ?? automaticPaymentPostCount}`;
      automaticPaymentIntent = {
        id: automaticPaymentIntentId,
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
        status: 'requires_action',
      };
      send(automaticPaymentIntent);
    });
    return;
  }
  const body =
    automaticPaymentIntent !== undefined && url.pathname === `/v1/payment_intents/${automaticPaymentIntentId}`
      ? automaticPaymentIntent
      : url.pathname === '/v1/customers/cus_reload_native'
        ? {
            id: 'cus_reload_native',
            object: 'customer',
            deleted: false,
            livemode: false,
            metadata: customerMetadata,
            address,
          }
        : url.pathname === `/v1/tax/calculations/${taxCalculationId}`
          ? taxCalculation()
          : url.pathname === `/v1/tax/calculations/${taxCalculationId}/line_items`
            ? { object: 'list', data: [taxLine()], has_more: false, url: url.pathname }
            : url.pathname === '/v1/checkout/sessions/cs_reload_native'
              ? setupSession()
              : url.pathname === '/v1/setup_intents/seti_reload_native'
                ? {
                    id: 'seti_reload_native',
                    object: 'setup_intent',
                    customer: 'cus_reload_native',
                    livemode: false,
                    metadata: setupMetadata,
                    payment_method: 'pm_reload_native',
                    status: 'succeeded',
                    usage: 'off_session',
                  }
                : url.pathname === '/v1/payment_methods/pm_reload_native'
                  ? {
                      id: 'pm_reload_native',
                      object: 'payment_method',
                      customer: 'cus_reload_native',
                      type: 'card',
                      card: { brand: 'visa', last4: '4242' },
                    }
                  : { error: { type: 'invalid_request_error', message: `Missing fixture ${url.pathname}` } };
  response.writeHead('error' in body ? 404 : 200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
});

function taxCalculation() {
  return {
    id: taxCalculationId,
    object: 'tax.calculation',
    amount_total: 2875,
    currency: 'usd',
    customer: 'cus_reload_native',
    customer_details: { address, address_source: 'billing' },
    expires_at: 2_000_000_000,
    livemode: false,
    tax_amount_exclusive: 375,
    tax_amount_inclusive: 0,
  };
}

function taxLine() {
  return {
    id: 'tax_li_reload_native',
    object: 'tax.calculation_line_item',
    amount: 2500,
    amount_tax: 375,
    livemode: false,
    product: 'prod_reload',
    quantity: 1,
    reference: taxReference,
    tax_behavior: 'exclusive',
  };
}

function setupSession() {
  return {
    id: 'cs_reload_native',
    object: 'checkout.session',
    client_reference_id: setupMetadata['tau_reload_consent_id'],
    customer: 'cus_reload_native',
    livemode: false,
    metadata: setupMetadata,
    mode: 'setup',
    setup_intent: 'seti_reload_native',
    status: 'complete',
    expires_at: 2_000_000_000,
    url: 'http://127.0.0.1:3000/settings/billing',
  };
}

describe('billing reload native service foundation', { concurrent: false }, () => {
  let payments: BillingPaymentsService;

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
    const ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
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
  });

  it('quotes first, then explicitly confirms and enables an owned off-session SetupIntent', async () => {
    await seedPolicy({
      enabled: true,
      thresholdAtoms: '100',
      principalMinor: '2500',
      monthlyGrossCapMinor: '10000',
      minimumCadenceSeconds: 3600,
      terminalFailureLimit: 2,
    });
    const userId = await seedUser();
    const prepared = await payments.prepareReloadConsent(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
    });
    expect(prepared.state).toBe('prepared');
    const actionId: unknown = prepared.actionId;
    if (typeof actionId !== 'string') {
      throw new TypeError('Prepared reload action identity missing');
    }
    const confirmed = await Promise.allSettled([
      payments.confirmAction(userId, actionId),
      payments.confirmAction(userId, actionId),
    ]);
    expect(confirmed).toHaveLength(2);
    expect(confirmed.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(confirmed.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(confirmed.find((result) => result.status === 'fulfilled')).toMatchObject({
      value: { state: 'redirect_required' },
    });
    expect(confirmed.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'reload_setup_outcome_unknown' } },
    });
    expect(setupPostCount).toBe(1);
    await payments.recoverPayments({ environment: 'development', limit: 10 });
    const enabled = await payments.getReloadConsent(userId);
    expect(enabled).toMatchObject({ state: 'enabled', paymentMethod: { brand: 'visa', last4: '4242' } });
    const rows = await database.select().from(billingReloadConsent);
    expect(rows.find((row) => row.id === actionId)).toMatchObject({
      consentedAt: expect.any(Date),
      setupIntentId: 'seti_reload_native',
      paymentMethodId: 'pm_reload_native',
      state: 'enabled',
    });
    const setupLeg = await database.query.billingProviderLeg.findFirst({
      where: eq(billingProviderLeg.reloadConsentId, actionId),
    });
    if (setupLeg?.expiresAt === null || setupLeg?.expiresAt === undefined) {
      throw new Error('Known setup expiry missing');
    }
    await expect(
      runtimeClient`update billing.billing_provider_leg set expires_at=${new Date(setupLeg.expiresAt.getTime() + 1000).toISOString()}::timestamptz where id=${setupLeg.id}`,
    ).rejects.toMatchObject({ code: '23514' });
    const consent = rows.find((row) => row.id === actionId);
    if (consent === undefined) {
      throw new Error('Enabled reload fixture missing');
    }
    enabledUserId = userId;
    enabledConsentId = consent.id;
    await database
      .update(billingReloadConsent)
      .set({ lastAutomaticStartedAt: new Date() })
      .where(eq(billingReloadConsent.id, consent.id));
    await database.insert(billingReloadWork).values({
      accountId: consent.accountId,
      environment: 'development',
      reasonKind: 'insufficient_funds',
      observedAccountRevision: 0n,
    });

    await expect(payments.processReloadWork({ environment: 'development', limit: 1 })).resolves.toEqual({
      processed: [],
      pending: [consent.accountId],
      failed: [],
    });
    expect(
      await database.select().from(billingPurchase).where(eq(billingPurchase.reloadConsentId, consent.id)),
    ).toHaveLength(0);

    const cappedPurchaseId = randomUUID();
    await database.insert(billingPurchase).values({
      id: cappedPurchaseId,
      accountId: consent.accountId,
      sourceIdentity: `purchase:${cappedPurchaseId}`,
      offerSnapshot: { ...consent.offerSnapshot, grossMinor: '8000' },
      creditAtoms: 1n,
      state: 'paid',
      customerBindingId: consent.customerBindingId,
      requestId: cappedPurchaseId,
      requestHash: 'cap-fixture',
      purpose: 'automatic',
      reloadConsentId: consent.id,
      reloadConsentVersion: consent.version,
      automaticStartedAt: new Date(),
      automaticGrossCeilingMinor: 8000n,
      stripeAccountId,
      livemode: false,
    });
    await database
      .update(billingReloadConsent)
      .set({ lastAutomaticStartedAt: null })
      .where(eq(billingReloadConsent.id, consent.id));
    await database
      .update(billingReloadWork)
      .set({ state: 'pending', nextAttemptAt: new Date(), leaseUntil: null })
      .where(eq(billingReloadWork.accountId, consent.accountId));
    await expect(payments.processReloadWork({ environment: 'development', limit: 1 })).resolves.toEqual({
      processed: [],
      pending: [consent.accountId],
      failed: [],
    });
    expect(
      await database.select().from(billingPurchase).where(eq(billingPurchase.reloadConsentId, consent.id)),
    ).toHaveLength(1);
    await database
      .update(billingPurchase)
      .set({ state: 'failed', automaticTerminalOutcome: 'no_charge_failure', automaticTerminalAt: new Date() })
      .where(eq(billingPurchase.id, cappedPurchaseId));

    await database
      .update(billingReloadConsent)
      .set({ lastAutomaticStartedAt: null })
      .where(eq(billingReloadConsent.id, consent.id));
    await database.update(creditAccount).set({ debtAtoms: 1n }).where(eq(creditAccount.id, consent.accountId));
    await database
      .update(billingReloadWork)
      .set({ state: 'pending', nextAttemptAt: new Date(), leaseUntil: null })
      .where(eq(billingReloadWork.accountId, consent.accountId));
    await expect(payments.processReloadWork({ environment: 'development', limit: 1 })).resolves.toEqual({
      processed: [],
      pending: [consent.accountId],
      failed: [],
    });
    expect(
      await database.select().from(billingPurchase).where(eq(billingPurchase.reloadConsentId, consent.id)),
    ).toHaveLength(1);

    await database.update(creditAccount).set({ debtAtoms: 0n }).where(eq(creditAccount.id, consent.accountId));
    await database
      .update(billingReloadWork)
      .set({ state: 'pending', nextAttemptAt: new Date(), leaseUntil: null })
      .where(eq(billingReloadWork.accountId, consent.accountId));
    await expect(payments.processReloadWork({ environment: 'development', limit: 1 })).resolves.toEqual({
      processed: [consent.accountId],
      pending: [],
      failed: [],
    });
    await payments.recoverPayments({ environment: 'development', limit: 10 });
    const automatic = await database.query.billingPurchase.findFirst({
      where: (table, operators) =>
        operators.and(operators.eq(table.reloadConsentId, consent.id), operators.eq(table.state, 'attention')),
    });
    if (automatic === undefined) {
      throw new Error('Automatic SCA purchase fixture missing');
    }
    await expect(payments.getAction(userId, automatic.id)).resolves.toMatchObject({
      state: 'attention_required',
      attention: { reason: 'authentication_required', action: 'continue_hosted' },
    });

    await database
      .update(billingPurchase)
      .set({ state: 'failed', automaticTerminalOutcome: 'no_charge_failure', automaticTerminalAt: new Date() })
      .where(eq(billingPurchase.id, automatic.id));
  });

  it('recovers one seeded prepared automatic payment without a duplicate dispatch', async () => {
    if (enabledUserId === undefined || enabledConsentId === undefined) {
      throw new Error('Enabled reload scenario did not run');
    }
    const consent = await database.query.billingReloadConsent.findFirst({
      where: eq(billingReloadConsent.id, enabledConsentId),
    });
    const work = await database.query.billingReloadWork.findFirst({
      where: eq(billingReloadWork.accountId, consent?.accountId ?? ''),
    });
    if (consent === undefined || work === undefined || consent.paymentMethodId === null) {
      throw new Error('Prepared automatic recovery fixture missing');
    }
    const startedAt = new Date();
    const purchaseId = randomUUID();
    const legId = randomUUID();
    const request = {
      kind: 'payment_intent',
      idempotencyKey: `tau:${legId}`,
      automaticReload: true,
      request: {
        amount: Number(consent.grossCeilingMinor),
        currency: 'usd',
        customer: 'cus_reload_native',
        payment_method: consent.paymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          tau_purchase_id: purchaseId,
          tau_customer_binding_id: consent.customerBindingId,
          tau_provider_leg_id: legId,
          tau_reload_consent_id: consent.id,
          tau_reload_consent_version: String(consent.version),
          tau_reload_work_generation: String(work.generation),
        },
      },
    };
    await database
      .update(billingReloadConsent)
      .set({ lastAutomaticStartedAt: startedAt })
      .where(eq(billingReloadConsent.id, consent.id));
    await database
      .update(billingReloadWork)
      .set({ state: 'done', leaseUntil: null, nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingReloadWork.accountId, consent.accountId));
    await database.insert(billingPurchase).values({
      id: purchaseId,
      accountId: consent.accountId,
      sourceIdentity: `purchase:${purchaseId}`,
      offerSnapshot: consent.offerSnapshot,
      creditAtoms: BigInt(consent.offerSnapshot.creditAtoms),
      state: 'prepared',
      customerBindingId: consent.customerBindingId,
      requestId: purchaseId,
      requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      purpose: 'automatic',
      reloadConsentId: consent.id,
      reloadConsentVersion: consent.version,
      automaticStartedAt: startedAt,
      automaticGrossCeilingMinor: consent.grossCeilingMinor,
      stripeAccountId,
      livemode: false,
    });
    await database.insert(billingProviderLeg).values({
      id: legId,
      accountId: consent.accountId,
      environment: 'development',
      customerBindingId: consent.customerBindingId,
      purchaseId,
      reloadConsentId: consent.id,
      kind: 'payment_intent',
      requestId: purchaseId,
      requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
      request,
      idempotencyKey: `tau:${legId}`,
    });
    const postsBeforeRecovery = automaticPaymentPostCount;

    await expect(payments.recoverPayments({ environment: 'development', limit: 10 })).resolves.toMatchObject({
      processed: expect.arrayContaining([legId]),
    });
    await payments.recoverPayments({ environment: 'development', limit: 10 });

    expect(automaticPaymentPostCount).toBe(postsBeforeRecovery + 1);
    await expect(payments.getAction(enabledUserId, purchaseId)).resolves.toMatchObject({
      actionId: purchaseId,
      state: 'attention_required',
      attention: { reason: 'authentication_required', action: 'continue_hosted' },
    });
  });

  it('revokes without a new automatic purchase and never repeats a lost setup dispatch', async () => {
    if (enabledUserId === undefined || enabledConsentId === undefined) {
      throw new Error('Enabled reload scenario did not run');
    }
    const userId = enabledUserId;
    const consent = await database.query.billingReloadConsent.findFirst({
      where: eq(billingReloadConsent.id, enabledConsentId),
    });
    if (consent === undefined) {
      throw new Error('Enabled reload consent missing');
    }
    const purchases = await database
      .select()
      .from(billingPurchase)
      .where(eq(billingPurchase.reloadConsentId, consent.id));
    const purchaseCount = purchases.length;

    await database
      .update(billingReloadWork)
      .set({ state: 'pending', nextAttemptAt: new Date(), leaseUntil: null })
      .where(eq(billingReloadWork.accountId, consent.accountId));
    await payments.revokeReloadConsent(userId, consent.id);
    await expect(payments.processReloadWork({ environment: 'development', limit: 1 })).resolves.toEqual({
      processed: [],
      pending: [consent.accountId],
      failed: [],
    });
    expect(
      await database.select().from(billingPurchase).where(eq(billingPurchase.reloadConsentId, consent.id)),
    ).toHaveLength(purchaseCount);

    const replacement = await payments.prepareReloadConsent(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
    });
    const replacementConsent = await database.query.billingReloadConsent.findFirst({
      where: eq(billingReloadConsent.id, replacement.actionId),
    });
    if (replacementConsent === undefined) {
      throw new Error('Replacement reload consent fixture missing');
    }
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
    const postsBeforeLostReplay = setupPostCount;
    await expect(payments.confirmAction(userId, replacement.actionId)).rejects.toMatchObject({
      response: { code: 'reload_setup_outcome_unknown' },
    });
    expect(setupPostCount).toBe(postsBeforeLostReplay);
  });
});

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await database
    .insert(user)
    .values({ id, name: 'Reload Foundation', email: `${id}@test.invalid`, emailVerified: true });
  return id;
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
          maximumPrincipalMinor: '50000',
          creditAtomsPerPrincipalMinor: '10000',
        },
      ],
      ...(autoReload === undefined ? {} : { autoReload }),
      promotionalIssuance: { enabled: false, budgetCreditAtoms: '0', offer: null },
    },
  });
}
