/* eslint-disable @typescript-eslint/naming-convention -- Stripe SDK requests use provider field names. */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Stripe } from 'stripe';
import {
  createBillingStripeClient,
  createStripeReloadTaxCalculationOnce,
  createStripeSetupCheckoutOnce,
  createStripeTaxTransactionOnce,
  dispatchStripeLegOnce,
  expireStripeCheckoutSession,
  fetchStripeCheckoutSource,
  fetchStripeTaxCalculationEvidence,
  fetchStripeTaxTransactionEvidence,
  parseVerifiedStripeEvent,
  retrieveStripePaymentEvidence,
  stripeApiVersion,
} from '#api/billing/billing-stripe.js';

const enabled = process.env['BILLING_STRIPE_ACCEPTANCE'] === 'true';

const required = (key: string, prefix: string): string => {
  const value = process.env[key];
  if (value === undefined || !value.startsWith(prefix)) {
    throw new Error(`${key} must be configured with a ${prefix} test credential`);
  }
  return value;
};

type ForwardedEvent = { readonly body: Uint8Array<ArrayBuffer>; readonly signature: string };

describe.skipIf(!enabled)('billing Stripe test-mode acceptance', () => {
  let createStripe: Stripe;
  let readStripe: Stripe;
  let refundStripe: Stripe;
  let tunnel: ChildProcess | undefined;
  let webhookServer: ReturnType<typeof createServer> | undefined;
  let webhookEndpointId: string | undefined;
  let webhookSecret: string;
  let forwardedEvent: Promise<ForwardedEvent>;
  let resolveForwardedEvent: ((event: ForwardedEvent) => void) | undefined;
  let customerId: string | undefined;
  let subscriptionId: string | undefined;
  const checkoutIds: string[] = [];

  beforeAll(async () => {
    const createKey = required('STRIPE_SECRET_KEY', 'rk_test_');
    const readKey = required('STRIPE_READ_SECRET_KEY', 'rk_test_');
    const refundKey = required('STRIPE_REFUND_SECRET_KEY', 'rk_test_');
    createStripe = createBillingStripeClient({ secretKey: createKey });
    readStripe = createBillingStripeClient({ secretKey: readKey });
    refundStripe = createBillingStripeClient({ secretKey: refundKey });
    forwardedEvent = new Promise((resolve) => {
      resolveForwardedEvent = resolve;
    });
    webhookServer = createServer((request, response) => {
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      request.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
      request.on('end', () => {
        const signature = request.headers['stripe-signature'];
        if (typeof signature === 'string') {
          const bytes = new Uint8Array(Buffer.concat(chunks));
          resolveForwardedEvent?.({ body: bytes, signature });
        }
        response.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      webhookServer?.once('error', reject);
      webhookServer?.listen(0, '127.0.0.1', resolve);
    });
    const { port } = webhookServer.address() as AddressInfo;
    tunnel = spawn('ngrok', ['http', `127.0.0.1:${port}`, '--log=stdout', '--log-format=json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const publicUrl = await new Promise<string>((resolve, reject) => {
      const tunnelReadyTimeout = setTimeout(() => {
        reject(new Error('ngrok tunnel did not become ready'));
      }, 30_000);
      let pending = '';
      tunnel?.stdout?.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        const lines = `${pending}${chunk.toString()}`.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const record: unknown = JSON.parse(line);
            if (
              typeof record === 'object' &&
              record !== null &&
              'msg' in record &&
              record.msg === 'started tunnel' &&
              'url' in record &&
              typeof record.url === 'string'
            ) {
              clearTimeout(tunnelReadyTimeout);
              resolve(record.url);
            }
          } catch {
            // Wait for the complete JSON log line.
          }
        }
      });
      tunnel?.once('error', reject);
      tunnel?.once('exit', (code) => {
        reject(new Error(`ngrok exited before ready (${code})`));
      });
    });
    const endpoint: unknown = JSON.parse(
      execFileSync(
        'stripe',
        [
          'webhook_endpoints',
          'create',
          '--confirm',
          '--enabled-events',
          'payment_intent.succeeded',
          '--url',
          `${publicUrl}/v1/auth/stripe/webhook`,
          '--api-version',
          stripeApiVersion,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
    if (
      typeof endpoint !== 'object' ||
      endpoint === null ||
      !('id' in endpoint) ||
      typeof endpoint.id !== 'string' ||
      !('secret' in endpoint) ||
      typeof endpoint.secret !== 'string' ||
      !endpoint.secret.startsWith('whsec_')
    ) {
      throw new Error('Stripe CLI did not create a signed webhook endpoint');
    }
    webhookEndpointId = endpoint.id;
    webhookSecret = endpoint.secret;
  }, 60_000);

  afterAll(async () => {
    if (webhookEndpointId !== undefined) {
      execFileSync('stripe', ['webhook_endpoints', 'delete', webhookEndpointId, '--confirm'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    }
    tunnel?.kill('SIGTERM');
    if (webhookServer !== undefined) {
      const server = webhookServer;
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
    await Promise.all(
      checkoutIds.map(async (sessionId) => {
        await expireStripeCheckoutSession(createStripe, {
          sessionId,
          idempotencyKey: `tau-acceptance-expire-${sessionId}`,
        }).catch(() => undefined);
      }),
    );
    if (subscriptionId !== undefined) {
      await createStripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
    }
    if (customerId !== undefined) {
      await createStripe.customers.del(customerId).catch(() => undefined);
    }
  }, 60_000);

  it('qualifies restricted roles, tax, Checkout, saved-card settlement, signed forwarding, refund and portal paths', async () => {
    required('STRIPE_ACCOUNT_ID', 'acct_');
    const productId = required('STRIPE_PRODUCT_ID_CREDIT_PACK', 'prod_');
    const priceId = required('STRIPE_PRICE_ID_PRO_MONTHLY', 'price_');
    const suffix = randomUUID();
    const customer = await createStripe.customers.create({
      name: 'Tau Billing Acceptance',
      email: `billing-${suffix}@example.com`,
      address: { line1: '510 Townsend St', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' },
      metadata: { tau_account_id: suffix },
    });
    customerId = customer.id;
    const paymentMethod = await createStripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await createStripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    const calculation = await createStripeReloadTaxCalculationOnce(createStripe, {
      idempotencyKey: `tau-acceptance-tax-${suffix}`,
      customerId: customer.id,
      productId,
      reference: `manual:${suffix}`,
      principalMinor: 500,
    });
    if (calculation.id === null) {
      throw new Error('Stripe Tax Calculation has no identity');
    }
    const calculationId = calculation.id;
    const taxEvidence = await fetchStripeTaxCalculationEvidence(readStripe, {
      calculationId,
      maximumLinePages: 2,
    });
    expect(taxEvidence.complete).toBe(true);
    expect(taxEvidence.calculation.amount_total).toBeGreaterThanOrEqual(500);

    const payment = await dispatchStripeLegOnce(createStripe, {
      kind: 'payment_intent',
      idempotencyKey: `tau-acceptance-payment-${suffix}`,
      onSessionSaveConsent: true,
      request: {
        amount: taxEvidence.calculation.amount_total,
        currency: 'usd',
        customer: customer.id,
        payment_method: paymentMethod.id,
        confirm: true,
        setup_future_usage: 'on_session',
        metadata: { tau_purchase_id: suffix },
      },
    });
    if (payment.kind !== 'payment_intent') {
      throw new Error('Expected a PaymentIntent result');
    }
    const paid = await retrieveStripePaymentEvidence(readStripe, payment.object.id);
    expect(paid.paymentIntent.status).toBe('succeeded');
    expect(paid.latestCharge?.paid).toBe(true);

    const forwarded = await Promise.race([
      forwardedEvent,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Signed Stripe event was not forwarded'));
        }, 60_000);
      }),
    ]);
    const compact = parseVerifiedStripeEvent(createStripe, {
      rawBody: forwarded.body,
      signature: forwarded.signature,
      secret: webhookSecret,
      livemode: false,
    });
    expect(compact).toMatchObject({
      type: 'payment_intent.succeeded',
      sourceId: payment.object.id,
      apiVersion: stripeApiVersion,
    });

    const taxTransaction = await createStripeTaxTransactionOnce(createStripe, {
      calculationId,
      reference: `pi:${payment.object.id}`,
      postedAt: payment.object.created,
      idempotencyKey: `tau-acceptance-tax-transaction-${suffix}`,
    });
    const transactionEvidence = await fetchStripeTaxTransactionEvidence(readStripe, {
      transactionId: taxTransaction.id,
      maximumLinePages: 2,
    });
    expect(transactionEvidence.complete).toBe(true);
    expect(transactionEvidence.transaction.reference).toBe(`pi:${payment.object.id}`);

    const topup = await dispatchStripeLegOnce(createStripe, {
      kind: 'checkout',
      idempotencyKey: `tau-acceptance-topup-${suffix}`,
      checkoutContract: { kind: 'top_up', productId, principalMinor: 500_000 },
      onSessionSaveConsent: true,
      request: {
        mode: 'payment',
        customer: customer.id,
        client_reference_id: suffix,
        success_url: 'http://localhost:3000/settings?billing_return=success',
        cancel_url: 'http://localhost:3000/settings?billing_return=cancel',
        line_items: [
          {
            price_data: { currency: 'usd', product: productId, tax_behavior: 'exclusive', unit_amount: 500_000 },
            quantity: 1,
          },
        ],
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
        metadata: { tau_purchase_id: suffix },
        payment_intent_data: { metadata: { tau_purchase_id: suffix }, setup_future_usage: 'on_session' },
      },
    });
    if (topup.kind !== 'checkout') {
      throw new Error('Expected a top-up Checkout result');
    }
    checkoutIds.push(topup.object.id);
    const topupEvidence = await fetchStripeCheckoutSource(readStripe, {
      sessionId: topup.object.id,
      maximumLinePages: 2,
    });
    expect(topupEvidence.complete).toBe(true);
    expect(topupEvidence.lines[0]?.amount_subtotal).toBe(500_000);

    const subscriptionCheckout = await dispatchStripeLegOnce(createStripe, {
      kind: 'checkout',
      idempotencyKey: `tau-acceptance-subscription-${suffix}`,
      checkoutContract: { kind: 'subscription', priceId },
      request: {
        mode: 'subscription',
        customer: customer.id,
        client_reference_id: suffix,
        success_url: 'http://localhost:3000/settings?billing_return=success',
        cancel_url: 'http://localhost:3000/settings?billing_return=cancel',
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: true },
        billing_address_collection: 'required',
        customer_update: { address: 'auto', name: 'auto' },
        tax_id_collection: { enabled: true },
        metadata: { tau_subscription_id: suffix },
        subscription_data: { metadata: { tau_subscription_id: suffix } },
      },
    });
    if (subscriptionCheckout.kind !== 'checkout') {
      throw new Error('Expected a subscription Checkout result');
    }
    checkoutIds.push(subscriptionCheckout.object.id);

    const setupCheckout = await createStripeSetupCheckoutOnce(createStripe, {
      idempotencyKey: `tau-acceptance-setup-${suffix}`,
      customerId: customer.id,
      consentId: suffix,
      consentVersion: 1,
      providerLegId: randomUUID(),
      successUrl: 'http://localhost:3000/settings?billing_return=success',
      cancelUrl: 'http://localhost:3000/settings?billing_return=cancel',
    });
    checkoutIds.push(setupCheckout.id);

    const subscription = await createStripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      automatic_tax: { enabled: true },
    });
    subscriptionId = subscription.id;
    const portal = await dispatchStripeLegOnce(createStripe, {
      kind: 'portal',
      idempotencyKey: `tau-acceptance-portal-${suffix}`,
      request: { customer: customer.id, return_url: 'http://localhost:3000/settings' },
    });
    expect(portal.kind).toBe('portal');

    await expect(readStripe.customers.create({ metadata: { tau_account_id: suffix } })).rejects.toBeDefined();
    const chargeId = paid.latestCharge?.id;
    if (chargeId === undefined) {
      throw new Error('Paid PaymentIntent has no charge');
    }
    await expect(createStripe.refunds.create({ charge: chargeId, amount: 100 })).rejects.toBeDefined();
    const partial = await refundStripe.refunds.create({ charge: chargeId, amount: 100 });
    const remainder = await refundStripe.refunds.create({
      charge: chargeId,
      amount: taxEvidence.calculation.amount_total - 100,
    });
    expect(partial.status).toBe('succeeded');
    expect(remainder.status).toBe('succeeded');
    const refundedCharge = await readStripe.charges.retrieve(chargeId);
    expect(refundedCharge.refunded).toBe(true);
  }, 300_000);
});
