/* eslint-disable @typescript-eslint/naming-convention -- Stripe wire fixtures use provider field names. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Stripe } from 'stripe';
import { afterEach, describe, expect, it } from 'vitest';
import {
  stripeApiVersion,
  cancelStripePaymentIntent,
  cancelStripeSubscription,
  createBillingStripeClient,
  createStripeReloadTaxCalculationOnce,
  createStripeSetupCheckoutOnce,
  createStripeSubscriptionScheduleOnce,
  createStripeTaxTransactionOnce,
  dispatchStripeLegOnce,
  expireStripeCheckoutSession,
  fetchStripeTaxCalculationEvidence,
  fetchStripeTaxTransactionEvidence,
  fetchStripeCheckoutSource,
  fetchStripeInvoiceEvidence,
  isLoopbackBillingStripeClient,
  parseStripeCreateLeg,
  parseVerifiedStripeEvent,
  recoverStripeLegSource,
  retrieveStripePaymentEvidence,
  retrieveStripeSetupEvidence,
  retrieveStripeSubscriptionSchedule,
  updateStripeSubscriptionScheduleOnce,
} from '#api/billing/billing-stripe.js';

const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      async (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );
});

async function createFixture(
  responses: Readonly<Record<string, unknown>>,
): Promise<{ readonly stripe: ReturnType<typeof createBillingStripeClient>; readonly requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const { url: requestUrl } = request;
    const url = requestUrl ?? '/';
    requests.push(`${request.method ?? ''} ${url}`);
    const { pathname } = new URL(url, 'http://localhost');
    const body = responses[pathname] ?? {
      error: { message: `No fixture for ${pathname}`, type: 'invalid_request_error' },
    };
    response.writeHead(pathname in responses ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  openServers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Fixture server has no TCP address');
  }
  const { port } = address satisfies AddressInfo;
  return {
    stripe: createBillingStripeClient({ secretKey: 'sk_test_fixture', fixtureUrl: `http://127.0.0.1:${port}/` }),
    requests,
  };
}

describe('billing Stripe transport', () => {
  it('rejects non-loopback fixture origins', () => {
    expect(() =>
      createBillingStripeClient({ secretKey: 'sk_test_fixture', fixtureUrl: 'https://stripe.example/' }),
    ).toThrow('loopback');
    expect(isLoopbackBillingStripeClient(createBillingStripeClient({ secretKey: 'sk_test_fixture' }))).toBe(false);
  });

  it.each([
    ['Customer', async (stripe: Stripe) => stripe.customers.create({})],
    ['Checkout', async (stripe: Stripe) => stripe.checkout.sessions.create({ mode: 'setup' })],
    ['PaymentIntent', async (stripe: Stripe) => stripe.paymentIntents.create({ amount: 1, currency: 'usd' })],
    ['SetupIntent', async (stripe: Stripe) => stripe.setupIntents.create({})],
    ['Schedule', async (stripe: Stripe) => stripe.subscriptionSchedules.create({ from_subscription: 'sub_once' })],
    ['TaxCalculation', async (stripe: Stripe) => stripe.tax.calculations.create({ currency: 'usd', line_items: [] })],
    ['Refund', async (stripe: Stripe) => stripe.refunds.create({ charge: 'ch_once' })],
    ['Cancellation', async (stripe: Stripe) => stripe.paymentIntents.cancel('pi_once')],
    ['SubscriptionCancellation', async (stripe: Stripe) => stripe.subscriptions.cancel('sub_once')],
  ] as const)('does not resend %s when the socket closes after one request', async (_name, invoke) => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      response.destroy();
    });
    openServers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new TypeError('Fixture server has no TCP address');
    }
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_fixture',
      fixtureUrl: `http://127.0.0.1:${(address satisfies AddressInfo).port}/`,
    });
    await expect(invoke(stripe)).rejects.toThrow('connection to Stripe');
    expect(requests).toBe(1);
  });

  it.each(['partial-close', 'stalled-body'] as const)(
    'bounds a %s after response headers without resending',
    async (mode) => {
      let requests = 0;
      const server = createServer((_request, response) => {
        requests += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.flushHeaders();
        response.write('{"id":"cus_partial"');
        if (mode === 'partial-close') {
          setTimeout(() => {
            response.destroy();
          }, 10);
        } else {
          const trickle = setInterval(() => response.write(' '), 10);
          response.once('close', () => {
            clearInterval(trickle);
          });
        }
      });
      openServers.push(server);
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (address === null || typeof address === 'string') {
        throw new TypeError('Fixture server has no TCP address');
      }
      const stripe = createBillingStripeClient({
        secretKey: 'sk_test_fixture',
        requestTimeout: 50,
        fixtureUrl: `http://127.0.0.1:${(address satisfies AddressInfo).port}/`,
      });
      const startedAt = performance.now();
      await expect(stripe.customers.create({})).rejects.toThrow();
      expect(performance.now() - startedAt).toBeLessThan(200);
      expect(requests).toBe(1);
    },
  );

  it('bounds trickled incomplete response headers without resending or retaining the socket', async () => {
    let requests = 0;
    let socketClosed = false;
    const server = createServer((_request, response) => {
      requests += 1;
      const { socket } = response;
      if (socket === null) {
        throw new Error('Fixture response socket unavailable');
      }
      socket.write('HTTP/1.1 200 OK\r\nX-Stripe-Trickle: ');
      const trickle = setInterval(() => socket.write(' '), 10);
      socket.once('close', () => {
        clearInterval(trickle);
        socketClosed = true;
      });
    });
    openServers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new TypeError('Fixture server has no TCP address');
    }
    const stripe = createBillingStripeClient({
      secretKey: 'sk_test_fixture',
      requestTimeout: 50,
      fixtureUrl: `http://127.0.0.1:${(address satisfies AddressInfo).port}/`,
    });
    const startedAt = performance.now();
    await expect(stripe.customers.create({})).rejects.toThrow();
    expect(performance.now() - startedAt).toBeLessThan(200);
    expect(requests).toBe(1);
    await expect.poll(() => socketClosed).toBe(true);
  });

  it('dispatches one on-session PaymentIntent and rejects off-session requests', async () => {
    const fixture = await createFixture({
      '/v1/payment_intents': { id: 'pi_1', object: 'payment_intent', status: 'succeeded', latest_charge: null },
    });
    await expect(
      dispatchStripeLegOnce(fixture.stripe, {
        kind: 'payment_intent',
        idempotencyKey: 'leg_1',
        onSessionSaveConsent: true,
        request: {
          amount: 500,
          currency: 'usd',
          customer: 'cus_1',
          payment_method: 'pm_1',
          confirm: true,
          setup_future_usage: 'on_session',
        },
      }),
    ).resolves.toMatchObject({ kind: 'payment_intent', object: { id: 'pi_1' } });
    await expect(
      dispatchStripeLegOnce(
        fixture.stripe,
        parseStripeCreateLeg({
          kind: 'payment_intent',
          idempotencyKey: 'leg_reload',
          automaticReload: true,
          request: {
            amount: 500,
            currency: 'usd',
            customer: 'cus_1',
            payment_method: 'pm_1',
            confirm: true,
            off_session: true,
          },
        }),
      ),
    ).resolves.toMatchObject({ kind: 'payment_intent', object: { id: 'pi_1' } });
    await expect(
      dispatchStripeLegOnce(fixture.stripe, {
        kind: 'payment_intent',
        idempotencyKey: 'leg_2',
        request: { amount: 500, currency: 'usd', confirm: true, off_session: true },
      }),
    ).rejects.toThrow('on-session');
    expect(fixture.requests).toHaveLength(2);
  });

  it('dispatches the automatic reload metadata the service writes and rejects an unknown key', async () => {
    const fixture = await createFixture({
      '/v1/payment_intents': { id: 'pi_reload', object: 'payment_intent', status: 'succeeded', latest_charge: null },
    });
    const metadata = {
      tau_purchase_id: 'purchase_1',
      tau_customer_binding_id: 'binding_1',
      tau_provider_leg_id: 'leg_1',
      tau_reload_consent_id: 'consent_1',
      tau_reload_consent_version: '3',
      tau_reload_work_generation: '7',
    };
    const leg = {
      kind: 'payment_intent',
      idempotencyKey: 'tau:leg_1',
      automaticReload: true,
      request: {
        amount: 2500,
        currency: 'usd',
        customer: 'cus_1',
        payment_method: 'pm_1',
        confirm: true,
        off_session: true,
        metadata,
      },
    } as const;
    await expect(dispatchStripeLegOnce(fixture.stripe, parseStripeCreateLeg(leg))).resolves.toMatchObject({
      object: { id: 'pi_reload' },
    });
    await expect(
      dispatchStripeLegOnce(
        fixture.stripe,
        parseStripeCreateLeg({
          ...leg,
          request: { ...leg.request, metadata: { ...metadata, tau_unknown_key: 'x' } },
        }),
      ),
    ).rejects.toThrow('metadata');
    expect(fixture.requests).toHaveLength(1);
  });

  it('parses persisted create JSON without a type assertion', () => {
    expect(
      parseStripeCreateLeg({
        kind: 'payment_intent',
        idempotencyKey: 'leg_1',
        request: { amount: 500, currency: 'usd', customer: 'cus_1', payment_method: 'pm_1', confirm: true },
      }),
    ).toMatchObject({ kind: 'payment_intent', request: { amount: 500, currency: 'usd' } });
    expect(() =>
      parseStripeCreateLeg({
        kind: 'payment_intent',
        idempotencyKey: 'leg_1',
        request: { amount: 500, currency: 'usd', confirm: true, description: 'foreign' },
      }),
    ).toThrow();
  });

  it('returns unknown or ambiguous for bounded correlation lookup', async () => {
    const unknown = await createFixture({
      '/v1/payment_intents/search': { object: 'search_result', data: [], has_more: false },
    });
    await expect(
      recoverStripeLegSource(unknown.stripe, {
        kind: 'payment_intent',
        metadataKey: 'tau_leg_id',
        metadataValue: 'leg_1',
      }),
    ).resolves.toStrictEqual({ status: 'unknown' });

    const ambiguous = await createFixture({
      '/v1/payment_intents/search': {
        object: 'search_result',
        data: [{ id: 'pi_1' }, { id: 'pi_2' }],
        has_more: false,
      },
    });
    await expect(
      recoverStripeLegSource(ambiguous.stripe, {
        kind: 'payment_intent',
        metadataKey: 'tau_leg_id',
        metadataValue: 'leg_1',
      }),
    ).resolves.toStrictEqual({ status: 'ambiguous' });
  });

  it('accepts one bounded custom top-up as inline price data and rejects a mismatched amount', async () => {
    const fixture = await createFixture({
      '/v1/checkout/sessions': { id: 'cs_1', object: 'checkout.session', mode: 'payment' },
    });
    const request = {
      mode: 'payment',
      customer: 'cus_1',
      client_reference_id: 'purchase_1',
      success_url: 'https://tau.example/return',
      cancel_url: 'https://tau.example/return',
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'usd', product: 'prod_topup', tax_behavior: 'exclusive', unit_amount: 1234 },
        },
      ],
      metadata: { tau_purchase_id: 'purchase_1' },
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      tax_id_collection: { enabled: true },
    } satisfies Stripe.Checkout.SessionCreateParams;
    await expect(
      dispatchStripeLegOnce(fixture.stripe, {
        kind: 'checkout',
        idempotencyKey: 'checkout_1',
        checkoutContract: { kind: 'top_up', productId: 'prod_topup', principalMinor: 1234 },
        request,
      }),
    ).resolves.toMatchObject({ kind: 'checkout', object: { id: 'cs_1' } });
    await expect(
      dispatchStripeLegOnce(fixture.stripe, {
        kind: 'checkout',
        idempotencyKey: 'checkout_2',
        checkoutContract: { kind: 'top_up', productId: 'prod_topup', principalMinor: 1235 },
        request,
      }),
    ).rejects.toThrow('top-up');
    expect(fixture.requests).toHaveLength(1);
  });

  it('cancels through a distinct persisted intent and retrieves PI plus Charge', async () => {
    const fixture = await createFixture({
      '/v1/payment_intents/pi_1/cancel': {
        id: 'pi_1',
        object: 'payment_intent',
        status: 'canceled',
        amount_received: 0,
        amount_capturable: 0,
      },
      '/v1/payment_intents/pi_1': { id: 'pi_1', object: 'payment_intent', status: 'succeeded', latest_charge: 'ch_1' },
      '/v1/charges/ch_1': { id: 'ch_1', object: 'charge', paid: true, captured: true, status: 'succeeded' },
    });
    await expect(
      cancelStripePaymentIntent(fixture.stripe, { paymentIntentId: 'pi_1', idempotencyKey: 'cancel_1' }),
    ).resolves.toMatchObject({ status: 'canceled' });
    await expect(retrieveStripePaymentEvidence(fixture.stripe, 'pi_1')).resolves.toMatchObject({
      paymentIntent: { id: 'pi_1' },
      latestCharge: { id: 'ch_1' },
    });
  });

  it('cancels one persisted subscription identity with its idempotency key', async () => {
    const fixture = await createFixture({
      '/v1/subscriptions/sub_1': { id: 'sub_1', object: 'subscription', status: 'canceled' },
    });
    await expect(
      cancelStripeSubscription(fixture.stripe, {
        stripeSubscriptionId: 'sub_1',
        idempotencyKey: 'cancel_subscription_1',
      }),
    ).resolves.toMatchObject({ id: 'sub_1', status: 'canceled' });
    expect(fixture.requests).toEqual(['DELETE /v1/subscriptions/sub_1']);
  });

  it('creates and retrieves the explicit hosted setup lineage', async () => {
    const fixture = await createFixture({
      '/v1/checkout/sessions': { id: 'cs_setup', object: 'checkout.session', mode: 'setup' },
      '/v1/checkout/sessions/cs_setup': {
        id: 'cs_setup',
        object: 'checkout.session',
        mode: 'setup',
        setup_intent: 'seti_1',
      },
      '/v1/setup_intents/seti_1': {
        id: 'seti_1',
        object: 'setup_intent',
        status: 'succeeded',
        payment_method: 'pm_1',
      },
      '/v1/payment_methods/pm_1': { id: 'pm_1', object: 'payment_method', type: 'card' },
    });
    await expect(
      createStripeSetupCheckoutOnce(fixture.stripe, {
        idempotencyKey: 'setup_leg_1',
        customerId: 'cus_1',
        consentId: 'consent_1',
        consentVersion: 1,
        providerLegId: 'leg_1',
        successUrl: 'https://tau.example/return',
        cancelUrl: 'https://tau.example/return',
      }),
    ).resolves.toMatchObject({ id: 'cs_setup', mode: 'setup' });
    await expect(retrieveStripeSetupEvidence(fixture.stripe, 'cs_setup')).resolves.toMatchObject({
      session: { id: 'cs_setup' },
      setupIntent: { id: 'seti_1' },
      paymentMethod: { id: 'pm_1' },
    });
  });

  it('creates and retrieves a bounded exclusive reload tax calculation', async () => {
    const fixture = await createFixture({
      '/v1/tax/calculations': { id: 'taxcalc_1', object: 'tax.calculation', amount_total: 2750 },
      '/v1/tax/calculations/taxcalc_1': { id: 'taxcalc_1', object: 'tax.calculation', amount_total: 2750 },
      '/v1/tax/calculations/taxcalc_1/line_items': {
        object: 'list',
        data: [{ id: 'taxli_1', amount: 2500, amount_tax: 250 }],
        has_more: false,
      },
    });
    await expect(
      createStripeReloadTaxCalculationOnce(fixture.stripe, {
        idempotencyKey: 'tax_leg_1',
        customerId: 'cus_1',
        productId: 'prod_1',
        reference: 'consent_1',
        principalMinor: 2500,
      }),
    ).resolves.toMatchObject({ id: 'taxcalc_1', amount_total: 2750 });
    await expect(
      fetchStripeTaxCalculationEvidence(fixture.stripe, {
        calculationId: 'taxcalc_1',
        maximumLinePages: 2,
      }),
    ).resolves.toMatchObject({ complete: true, lines: [{ amount: 2500, amount_tax: 250 }] });
  });

  it('commits and retrieves one paid Tax Transaction', async () => {
    const transaction = {
      id: 'tax_1',
      object: 'tax.transaction',
      type: 'transaction',
      reference: 'tau:development:purchase:purchase_1',
    };
    const fixture = await createFixture({
      '/v1/tax/transactions/create_from_calculation': transaction,
      '/v1/tax/transactions/tax_1': transaction,
      '/v1/tax/transactions/tax_1/line_items': {
        object: 'list',
        data: [{ id: 'taxli_1', amount: 2500, amount_tax: 250 }],
        has_more: false,
      },
    });
    await expect(
      createStripeTaxTransactionOnce(fixture.stripe, {
        calculationId: 'taxcalc_1',
        reference: transaction.reference,
        postedAt: 1_788_650_100,
        idempotencyKey: 'tax_transaction_leg_1',
      }),
    ).resolves.toMatchObject({ id: 'tax_1', reference: transaction.reference });
    await expect(
      fetchStripeTaxTransactionEvidence(fixture.stripe, { transactionId: 'tax_1', maximumLinePages: 2 }),
    ).resolves.toMatchObject({ complete: true, lines: [{ amount: 2500, amount_tax: 250 }] });
  });

  it('expires only the persisted hosted Session', async () => {
    const fixture = await createFixture({
      '/v1/checkout/sessions/cs_setup/expire': { id: 'cs_setup', object: 'checkout.session', status: 'expired' },
    });
    await expect(
      expireStripeCheckoutSession(fixture.stripe, {
        sessionId: 'cs_setup',
        idempotencyKey: 'expire_setup_1',
      }),
    ).resolves.toMatchObject({ id: 'cs_setup', status: 'expired' });
  });

  it('creates, updates, and retrieves one future subscription schedule', async () => {
    const fixture = await createFixture({
      '/v1/subscription_schedules': { id: 'sub_sched_1', object: 'subscription_schedule', status: 'active' },
      '/v1/subscription_schedules/sub_sched_1': {
        id: 'sub_sched_1',
        object: 'subscription_schedule',
        status: 'active',
      },
    });
    await expect(
      createStripeSubscriptionScheduleOnce(fixture.stripe, {
        subscriptionId: 'sub_1',
        idempotencyKey: 'schedule_create_1',
      }),
    ).resolves.toMatchObject({ id: 'sub_sched_1' });
    await expect(
      updateStripeSubscriptionScheduleOnce(fixture.stripe, {
        scheduleId: 'sub_sched_1',
        subscriptionOfferId: 'offer_1',
        currentStart: 1_788_650_000,
        effectivePeriodStart: 1_791_242_000,
        currentPriceId: 'price_old',
        futurePriceId: 'price_new',
        sourceSchedule: {
          phases: [
            {
              add_invoice_items: [],
              application_fee_percent: null,
              billing_cycle_anchor: 'automatic',
              billing_thresholds: null,
              collection_method: 'charge_automatically',
              currency: 'usd',
              default_payment_method: null,
              default_tax_rates: [],
              description: null,
              discounts: [],
              end_date: 1_791_242_000,
              invoice_settings: null,
              items: [{ price: 'price_old', quantity: 1 }],
              metadata: null,
              on_behalf_of: null,
              proration_behavior: 'none',
              start_date: 1_788_650_000,
              transfer_data: null,
              trial_end: null,
            },
          ],
        } as unknown as Stripe.SubscriptionSchedule,
        idempotencyKey: 'schedule_update_1',
      }),
    ).resolves.toMatchObject({ id: 'sub_sched_1' });
    await expect(retrieveStripeSubscriptionSchedule(fixture.stripe, 'sub_sched_1')).resolves.toMatchObject({
      id: 'sub_sched_1',
      status: 'active',
    });
  });

  it('returns complete evidence only after all invoice pages end', async () => {
    const fixture = await createFixture({
      '/v1/invoices/in_1': { id: 'in_1', object: 'invoice' },
      '/v1/invoices/in_1/lines': { object: 'list', data: [{ id: 'il_1' }], has_more: false },
      '/v1/invoice_payments': { object: 'list', data: [{ id: 'inpay_1' }], has_more: false },
    });
    await expect(
      fetchStripeInvoiceEvidence(fixture.stripe, { invoiceId: 'in_1', maximumLinePages: 2, maximumPaymentPages: 2 }),
    ).resolves.toMatchObject({ complete: true, lines: [{ id: 'il_1' }], payments: [{ id: 'inpay_1' }] });
  });

  it('returns complete Checkout evidence only after the line-item page ends', async () => {
    const fixture = await createFixture({
      '/v1/checkout/sessions/cs_1': { id: 'cs_1', object: 'checkout.session' },
      '/v1/checkout/sessions/cs_1/line_items': { object: 'list', data: [{ id: 'li_1' }], has_more: false },
    });
    await expect(
      fetchStripeCheckoutSource(fixture.stripe, { sessionId: 'cs_1', maximumLinePages: 2 }),
    ).resolves.toMatchObject({ complete: true, session: { id: 'cs_1' }, lines: [{ id: 'li_1' }] });
  });

  it('verifies direct-account event scope, version, allowlist and raw digest', async () => {
    const fixture = await createFixture({});
    const payloadText = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      api_version: stripeApiVersion,
      created: 1,
      livemode: false,
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', object: 'payment_intent' } },
    });
    const payload = new TextEncoder().encode(payloadText);
    const signature = fixture.stripe.webhooks.generateTestHeaderString({
      payload: payloadText,
      secret: 'whsec_fixture',
    });
    expect(
      parseVerifiedStripeEvent(fixture.stripe, {
        rawBody: payload,
        signature,
        secret: 'whsec_fixture',
        livemode: false,
      }),
    ).toMatchObject({ id: 'evt_1', sourceId: 'pi_1', sourceType: 'payment_intent', apiVersion: stripeApiVersion });

    const connectedPayloadText = JSON.stringify({
      id: 'evt_2',
      object: 'event',
      account: 'acct_other',
      api_version: stripeApiVersion,
      created: 1,
      livemode: false,
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_2', object: 'payment_intent' } },
    });
    const connectedPayload = new TextEncoder().encode(connectedPayloadText);
    const connectedSignature = fixture.stripe.webhooks.generateTestHeaderString({
      payload: connectedPayloadText,
      secret: 'whsec_fixture',
    });
    expect(() =>
      parseVerifiedStripeEvent(fixture.stripe, {
        rawBody: connectedPayload,
        signature: connectedSignature,
        secret: 'whsec_fixture',
        livemode: false,
      }),
    ).toThrow('scope mismatch');
  });
});
