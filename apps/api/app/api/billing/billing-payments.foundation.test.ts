/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures retain provider field names. */
import { fulfillPaidFixture } from '#testing/billing-payment.fixture.js';
import { BillingCashService } from '#api/billing/billing-cash.service.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { and, eq, inArray, sql } from 'drizzle-orm';
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
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import { BillingService } from '#api/billing/billing.service.js';
import type { Environment } from '#config/environment.config.js';
import type { DatabaseService } from '#database/database.service.js';
import type { PaidPaymentEvidence, PaymentOfferSnapshot } from '#api/billing/billing-payment-contract.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import {
  createBillingStripeClient,
  fetchStripeInvoiceEvidence,
  retrieveStripePaymentEvidence,
  stripeApiVersion,
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
/** The contact fields of the last Customer create, as Stripe received them. */
let latestCustomerContact: { email?: string; name?: string } | undefined;
const latestCustomerAddress = {
  city: 'Wellington',
  country: 'NZ',
  line1: '1 Willis Street',
  line2: null,
  postal_code: '6011',
  state: null,
};
let taxCalculation:
  | {
      readonly id: string;
      readonly customerId: string;
      readonly productId: string;
      readonly reference: string;
      readonly amount: number;
    }
  | undefined;
let taxTransaction:
  | { readonly id: string; readonly calculationId: string; readonly reference: string; readonly postedAt: number }
  | undefined;
let paymentFixture:
  | { purchaseId: string; providerLegId: string; customerBindingId: string; customerId: string }
  | undefined;
let paymentStatus: 'requires_action' | 'succeeded' | 'requires_payment_method' | 'canceled' = 'succeeded';
let paymentCancelPosts = 0;
let failNextTaxTransaction = false;
/** Hosted Checkout Sessions the fixture created, keyed by id. */
const checkoutSessions = new Map<string, Record<string, unknown>>();
let checkoutExpirePosts = 0;
let paymentCreatePosts = 0;
let rejectPaymentCreate = false;
let taxTransactionPosts = 0;
let paymentIntentFixtureId = 'pi_foundation_paid';
let paymentChargeFixtureId = 'ch_foundation_paid';
let ambiguousCustomerSearch = false;
/** Milliseconds Stripe takes to answer a Customer create, so concurrent first purchases overlap it. */
let customerCreateLatency = 0;
/** Stripe refuses Customer searches with a 429, as it refuses part of a burst of them. */
let customerSearchRateLimited = false;
// Hosted Checkout saves a card without setting the customer's invoice default.
let customerInvoiceDefaultCard = true;
const foundationCard = {
  id: 'pm_foundation',
  object: 'payment_method',
  type: 'card',
  card: { brand: 'visa', last4: '4242' },
};
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
  const sessionReply = (body: unknown): void => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      const form = new URLSearchParams(chunks.join(''));
      const id = `cs_foundation_${randomUUID().replaceAll('-', '')}`;
      const session = {
        id,
        object: 'checkout.session',
        client_reference_id: form.get('client_reference_id'),
        customer: form.get('customer'),
        expires_at: 2_000_000_000,
        livemode: false,
        metadata: {},
        mode: form.get('mode'),
        payment_intent: null,
        payment_status: 'unpaid',
        status: 'open',
        subscription: null,
        url: `http://127.0.0.1:3000/checkout/${id}`,
      };
      checkoutSessions.set(id, session);
      sessionReply(session);
    });
    return;
  }
  const expiring = /^\/v1\/checkout\/sessions\/(?<id>cs_foundation_\w+)\/expire$/u.exec(url.pathname)?.groups?.['id'];
  if (request.method === 'POST' && expiring !== undefined && checkoutSessions.has(expiring)) {
    request.resume();
    checkoutExpirePosts += 1;
    const session = checkoutSessions.get(expiring) ?? {};
    session['status'] = 'expired';
    // Expiring a Session cancels the PaymentIntent a declined attempt left on it.
    if (session['payment_intent'] === paymentIntentFixtureId && paymentStatus !== 'succeeded') {
      paymentStatus = 'canceled';
    }
    sessionReply(session);
    return;
  }
  const sessionId = /^\/v1\/checkout\/sessions\/(?<id>cs_foundation_\w+)$/u.exec(url.pathname)?.groups?.['id'];
  if (request.method === 'GET' && sessionId !== undefined && checkoutSessions.has(sessionId)) {
    sessionReply(checkoutSessions.get(sessionId));
    return;
  }
  const lineItems = /^\/v1\/checkout\/sessions\/(?<id>cs_foundation_\w+)\/line_items$/u.exec(url.pathname)?.groups;
  const lineSession = checkoutSessions.get(lineItems?.['id'] ?? '');
  if (request.method === 'GET' && lineSession !== undefined) {
    sessionReply({
      object: 'list',
      data: [
        {
          id: 'li_foundation',
          object: 'item',
          amount_subtotal: lineSession['amount_subtotal'],
          amount_total: lineSession['amount_total'],
          currency: 'usd',
          price: { id: 'price_topup', object: 'price', product: 'prod_topup' },
          quantity: 1,
        },
      ],
      has_more: false,
      url: url.pathname,
    });
    return;
  }
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
      latestCustomerContact = { email: form.get('email') ?? undefined, name: form.get('name') ?? undefined };
      const customer = JSON.stringify({
        id: latestCustomerId,
        object: 'customer',
        address: latestCustomerAddress,
        livemode: false,
        metadata: latestCustomerMetadata,
      });
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(customer);
      }, customerCreateLatency);
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/customers/search' && customerSearchRateLimited) {
    response.writeHead(429, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: { type: 'invalid_request_error', code: 'rate_limit', message: 'Request rate limit exceeded.' },
      }),
    );
    return;
  }
  if (url.pathname === '/v1/tax/calculations' && request.method === 'POST') {
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      const form = new URLSearchParams(chunks.join(''));
      taxCalculation = {
        id: `taxcalc_${randomUUID().replaceAll('-', '')}`,
        customerId: form.get('customer') ?? '',
        productId: form.get('line_items[0][product]') ?? '',
        reference: form.get('line_items[0][reference]') ?? '',
        amount: Number(form.get('line_items[0][amount]')),
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(taxCalculationObject()));
    });
    return;
  }
  const calculationId = /^\/v1\/tax\/calculations\/(?<id>[\w-]+)(?:\/line_items)?$/u.exec(url.pathname)?.groups?.['id'];
  if (calculationId !== undefined && taxCalculation?.id === calculationId) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        url.pathname.endsWith('/line_items')
          ? { object: 'list', data: [taxCalculationLine()], has_more: false, url: url.pathname }
          : taxCalculationObject(),
      ),
    );
    return;
  }
  if (url.pathname === '/v1/tax/transactions/create_from_calculation' && request.method === 'POST') {
    taxTransactionPosts += 1;
    if (failNextTaxTransaction) {
      failNextTaxTransaction = false;
      request.resume();
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { type: 'api_error', message: 'fixture outage' } }));
      return;
    }
    const chunks: string[] = [];
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => chunks.push(chunk));
    request.on('end', () => {
      const form = new URLSearchParams(chunks.join(''));
      taxTransaction = {
        id: `tax_${randomUUID().replaceAll('-', '')}`,
        calculationId: form.get('calculation') ?? '',
        reference: form.get('reference') ?? '',
        postedAt: Number(form.get('posted_at')),
      };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(taxTransactionObject()));
    });
    return;
  }
  const transactionId = /^\/v1\/tax\/transactions\/(?<id>[\w-]+)(?:\/line_items)?$/u.exec(url.pathname)?.groups?.['id'];
  if (transactionId !== undefined && taxTransaction?.id === transactionId) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        url.pathname.endsWith('/line_items')
          ? { object: 'list', data: [taxTransactionLine()], has_more: false, url: url.pathname }
          : taxTransactionObject(),
      ),
    );
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
          // A declined attempt detaches its method and records the decline.
          payment_method: paymentStatus === 'requires_payment_method' ? null : 'pm_foundation',
          last_payment_error:
            paymentStatus === 'requires_payment_method'
              ? { type: 'card_error', code: 'card_declined', payment_method: { id: 'pm_foundation' } }
              : null,
          status: paymentStatus,
        };
  if (request.method === 'GET' && url.pathname === '/v1/payment_intents/search') {
    // Search is eventually consistent; a create that just landed is not yet visible.
    sessionReply({ object: 'search_result', data: [], has_more: false, url: url.pathname });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/payment_intents') {
    paymentCreatePosts += 1;
  }
  if (request.method === 'POST' && url.pathname === '/v1/payment_intents' && rejectPaymentCreate) {
    request.resume();
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such PaymentMethod' },
      }),
    );
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/v1/payment_intents' &&
    paymentIntent !== undefined &&
    paymentStatus === 'requires_payment_method'
  ) {
    request.resume();
    response.writeHead(402, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: { type: 'card_error', code: 'card_declined', message: 'Declined', payment_intent: paymentIntent },
      }),
    );
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/payment_intents/${paymentIntentFixtureId}/cancel` &&
    paymentIntent !== undefined
  ) {
    request.resume();
    paymentCancelPosts += 1;
    paymentStatus = 'canceled';
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ...paymentIntent, status: 'canceled' }));
    return;
  }
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
          customer_address: latestCustomerAddress,
          livemode: false,
          parent: { type: 'subscription_details', subscription_details: { subscription: invoice.subscriptionId } },
          status: invoice.paid ? 'paid' : 'open',
          subtotal: 2000,
          total: 2000,
          automatic_tax: { status: 'complete' },
          total_taxes: [{ amount: 0 }],
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
            address: latestCustomerAddress,
            deleted: false,
            livemode: false,
            metadata: latestCustomerMetadata,
            invoice_settings: {
              default_payment_method: customerInvoiceDefaultCard
                ? { ...foundationCard, customer: latestCustomerId }
                : null,
            },
          }
        : url.pathname === '/v1/payment_methods'
          ? {
              object: 'list',
              data: [{ ...foundationCard, customer: latestCustomerId }],
              has_more: false,
              url: '/v1/payment_methods',
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
                                error: {
                                  message: `Missing fixture for ${url.pathname}`,
                                  type: 'invalid_request_error',
                                },
                              };
  const responseBody = body ?? {
    error: { message: `Incomplete fixture for ${url.pathname}`, type: 'invalid_request_error' },
  };
  response.writeHead('error' in responseBody ? 404 : 200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(responseBody));
});

function taxCalculationObject() {
  const value = taxCalculation!;
  return {
    id: value.id,
    object: 'tax.calculation',
    amount_total: value.amount,
    currency: 'usd',
    customer: value.customerId,
    customer_details: { address: latestCustomerAddress, address_source: 'billing' },
    expires_at: 2_000_000_000,
    livemode: false,
    tax_amount_exclusive: 0,
    tax_amount_inclusive: 0,
  };
}

function taxCalculationLine() {
  const value = taxCalculation!;
  return {
    id: `taxli_${value.id}`,
    object: 'tax.calculation_line_item',
    amount: value.amount,
    amount_tax: 0,
    livemode: false,
    product: value.productId,
    quantity: 1,
    reference: value.reference,
    tax_behavior: 'exclusive',
  };
}

function taxTransactionObject() {
  const value = taxTransaction!;
  return {
    id: value.id,
    object: 'tax.transaction',
    currency: 'usd',
    customer: taxCalculation?.customerId,
    customer_details: { address: latestCustomerAddress, address_source: 'billing', tax_ids: [] },
    livemode: false,
    posted_at: value.postedAt,
    reference: value.reference,
    type: 'transaction',
  };
}

function taxTransactionLine() {
  const value = taxCalculation!;
  return {
    id: `taxli_${taxTransaction?.id ?? 'missing'}`,
    object: 'tax.transaction_line_item',
    amount: value.amount,
    amount_tax: 0,
    livemode: false,
    tax_behavior: 'exclusive',
    tax_code: 'txcd_10103000',
    type: 'transaction',
  };
}

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
          maximumPrincipalMinor: '500000',
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
    // Stripe addresses receipts, invoices and the portal to the owner; the leg keeps the same request for a replay.
    const contact = { email: `${userId}@test.invalid`, name: 'Payment Foundation' };
    expect(latestCustomerContact).toStrictEqual(contact);
    const [customerLeg] = await database
      .select()
      .from(billingProviderLeg)
      .where(and(eq(billingProviderLeg.customerBindingId, binding!.id), eq(billingProviderLeg.kind, 'customer')));
    expect(customerLeg?.request).toMatchObject({
      ...contact,
      metadata: { tau_account_id: owner!.accountId, tau_customer_binding_id: binding!.id },
    });
    const purchases = await database
      .select()
      .from(billingPurchase)
      .where(and(eq(billingPurchase.accountId, owner!.accountId), eq(billingPurchase.requestId, requestId)));
    expect(purchases).toHaveLength(1);
    expect(requests.filter((request) => request === 'POST /v1/customers')).toHaveLength(1);
  });

  // Staging, 2026-10-09: 50 concurrent first top-ups answered one 200, 47 409s and two 500s.
  it('should answer concurrent first top-ups with one prepared action and typed conflicts only', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Concurrent Top-ups', email: `${userId}@test.invalid`, emailVerified: true });
    const posts = requests.filter((request) => request === 'POST /v1/customers').length;
    const searches = requests.filter((request) => request === 'GET /v1/customers/search').length;
    // Stripe takes a moment to create the Customer, and refuses the burst of searches waiting requests would send.
    customerCreateLatency = 250;
    customerSearchRateLimited = true;
    const settled = await Promise.allSettled(
      Array.from({ length: 50 }, async () =>
        payments.prepareTopup(userId, {
          requestId: randomUUID(),
          returnPath: '/settings/billing',
          amountMinor: '537',
          method: 'checkout',
        }),
      ),
    ).finally(() => {
      customerCreateLatency = 0;
      customerSearchRateLimited = false;
    });
    const answers = settled.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value.state;
      }
      const reason: unknown = result.reason;
      if (!(reason instanceof ConflictException)) {
        return reason;
      }
      const body = reason.getResponse();
      return typeof body === 'object' && 'code' in body ? body.code : body;
    });
    expect(answers.filter((answer) => answer === 'prepared')).toHaveLength(1);
    // Requests that arrive while the Customer create is in flight are refused before any search.
    expect(answers).toContain('customer_creation_outcome_unknown');
    expect(
      answers.filter(
        (answer) =>
          answer !== 'prepared' &&
          answer !== 'action_already_pending' &&
          answer !== 'customer_creation_outcome_unknown',
      ),
    ).toEqual([]);
    const [owner] = await database
      .select()
      .from(billingOwnerBinding)
      .where(and(eq(billingOwnerBinding.authUserId, userId), eq(billingOwnerBinding.environment, 'development')));
    const purchases = await database
      .select()
      .from(billingPurchase)
      .where(eq(billingPurchase.accountId, owner?.accountId ?? ''));
    expect(purchases.map((purchase) => purchase.state)).toEqual(['prepared']);
    expect(requests.filter((request) => request === 'POST /v1/customers')).toHaveLength(posts + 1);
    // A request that finds the Customer still being created answers without asking Stripe for it.
    expect(requests.filter((request) => request === 'GET /v1/customers/search')).toHaveLength(searches);
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
    // A source type with no fulfilment action is reclaimed under a new generation and finished, not re-queued.
    expect(source).toMatchObject({ generation: 8n, state: 'done', errorCode: null });
    expect(inbox).toMatchObject({ claimGeneration: 5n, state: 'done' });
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

  it('routes refund-family sources to charge reconciliation and retries an unreadable refund', async () => {
    const chargeSource = randomUUID();
    const refundSource = randomUUID();
    const due = {
      environment: 'development',
      stripeAccountId,
      livemode: false,
      state: 'pending',
      nextAttemptAt: sql`transaction_timestamp() - interval '1 second'`,
    } as const;
    await database.insert(billingStripeSource).values([
      // A charge with no fulfilled cause: its purchase's own qualification applies any refund later.
      { id: chargeSource, sourceType: 'charge', sourceId: `ch_unowned_${chargeSource}`, ...due },
      // The fixture cannot read this refund, so the source must stay queued rather than finish unapplied.
      { id: refundSource, sourceType: 'refund', sourceId: `re_unreadable_${refundSource}`, ...due },
    ]);
    const result = await payments.recoverPayments({ environment: 'development', limit: 100 });
    expect(result.processed).toContain(chargeSource);
    expect(result.failed).toContain(refundSource);
    const rows = await database
      .select()
      .from(billingStripeSource)
      .where(inArray(billingStripeSource.id, [chargeSource, refundSource]));
    expect(rows.find((row) => row.id === chargeSource)).toMatchObject({ state: 'done' });
    expect(rows.find((row) => row.id === refundSource)).toMatchObject({ state: 'pending' });
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

  it('charges a Checkout-saved card that is not the invoice default', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Checkout Saved Card', email: `${userId}@test.invalid`, emailVerified: true });
    customerInvoiceDefaultCard = false;
    try {
      const prepared = await payments.prepareTopup(userId, {
        requestId: randomUUID(),
        returnPath: '/settings/billing',
        amountMinor: '537',
        method: 'saved_card',
      });
      expect(prepared.frozen?.paymentMethod).toMatchObject({ brand: 'visa', last4: '4242' });
    } finally {
      customerInvoiceDefaultCard = true;
    }
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

  it('fails a declined saved-card top-up once, cancels its PaymentIntent, and lets the customer buy again', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Declined Card', email: `${userId}@test.invalid`, emailVerified: true });
    const prepared = await payments.prepareTopup(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'saved_card',
    });
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
    if (leg === undefined || binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
      throw new Error('Decline fixture is incomplete');
    }
    paymentFixture = {
      purchaseId: prepared.actionId,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: binding.stripeCustomerId,
    };
    paymentIntentFixtureId = `pi_declined_${randomUUID().replaceAll('-', '')}`;
    paymentStatus = 'requires_payment_method';
    paymentCancelPosts = 0;
    try {
      await expect(payments.confirmAction(userId, prepared.actionId)).resolves.toMatchObject({ state: 'failed' });
      expect(paymentCancelPosts).toBe(1);
      const [closed] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, leg.id));
      expect(closed).toMatchObject({
        state: 'no_charge',
        providerObjectId: paymentIntentFixtureId,
        noChargeEvidence: { status: 'canceled', amountReceived: '0' },
      });
      // The failed attempt no longer holds the account's single active purchase.
      await expect(
        payments.prepareTopup(userId, {
          requestId: randomUUID(),
          returnPath: '/settings/billing',
          amountMinor: '537',
          method: 'saved_card',
        }),
      ).resolves.toMatchObject({ state: 'prepared' });
    } finally {
      paymentStatus = 'succeeded';
      paymentIntentFixtureId = 'pi_foundation_paid';
    }
  });

  it('commits the Tax Transaction when a paid top-up is recovered after failing before tax', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Tax Recovery', email: `${userId}@test.invalid`, emailVerified: true });
    const prepared = await payments.prepareTopup(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'saved_card',
    });
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
    if (leg === undefined || binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
      throw new Error('Tax recovery fixture is incomplete');
    }
    const suffix = randomUUID().replaceAll('-', '');
    paymentFixture = {
      purchaseId: prepared.actionId,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: binding.stripeCustomerId,
    };
    paymentIntentFixtureId = `pi_tax_${suffix}`;
    paymentChargeFixtureId = `ch_tax_${suffix}`;
    paymentStatus = 'succeeded';
    try {
      await payments.confirmAction(userId, prepared.actionId);
      // Only this source is due, so each bounded pass works on it alone.
      await database
        .update(billingStripeSource)
        .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(eq(billingStripeSource.stripeAccountId, stripeAccountId));
      await database
        .update(billingProviderLeg)
        .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(eq(billingProviderLeg.environment, 'development'));
      const sourceId = randomUUID();
      await database.insert(billingStripeSource).values({
        id: sourceId,
        environment: 'development',
        stripeAccountId,
        livemode: false,
        sourceType: 'payment_intent',
        sourceId: paymentIntentFixtureId,
      });
      await database.insert(stripeEventInbox).values({
        id: randomUUID(),
        eventId: `evt_${suffix}`,
        environment: 'development',
        stripeAccountId,
        livemode: false,
        apiVersion: '2026-07-29.dahlia',
        eventType: 'payment_intent.succeeded',
        sourceType: 'payment_intent',
        sourceId: paymentIntentFixtureId,
        eventCreatedAt: new Date('2026-09-06T00:02:00.000Z'),
        payloadDigest: 'd'.repeat(64),
        evidence: {},
      });
      const posts = taxTransactionPosts;
      failNextTaxTransaction = true;
      const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(recovery.failed).toContain(sourceId);
      const [retained] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, prepared.actionId));
      expect(retained?.state).toBe('paid_unfulfilled');
      await database
        .update(billingStripeSource)
        .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
        .where(eq(billingStripeSource.id, sourceId));
      await database
        .update(stripeEventInbox)
        .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
        .where(eq(stripeEventInbox.sourceId, paymentIntentFixtureId));
      await payments.recoverPayments({ environment: 'development', limit: 1 });
      const [fulfilled] = await database
        .select()
        .from(billingPurchase)
        .where(eq(billingPurchase.id, prepared.actionId));
      expect(fulfilled?.state).toBe('fulfilled');
      expect(taxTransactionPosts).toBe(posts + 2);
      // The retry recorded the committed Tax Transaction, never a permanent incomplete-source gap.
      const gaps = await database
        .select()
        .from(schema.billingFinancialCase)
        .where(
          and(
            eq(schema.billingFinancialCase.kind, 'tax_incomplete_source'),
            eq(schema.billingFinancialCase.sourceId, paymentChargeFixtureId),
          ),
        );
      expect(gaps).toEqual([]);
    } finally {
      paymentIntentFixtureId = 'pi_foundation_paid';
      paymentChargeFixtureId = 'ch_foundation_paid';
    }
  });

  it('lets a customer cancel an abandoned Pro Checkout and subscribe again', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Abandoned Pro', email: `${userId}@test.invalid`, emailVerified: true });
    const request = () => ({ requestId: randomUUID(), returnPath: '/settings/billing' });
    const first = await payments.prepareSubscription(userId, request());
    expect(first).toMatchObject({ state: 'redirect_required' });
    await expect(payments.prepareSubscription(userId, request())).rejects.toMatchObject({
      response: { code: 'action_already_pending' },
    });
    const posts = checkoutExpirePosts;
    await expect(payments.cancelAction(userId, first.actionId)).resolves.toMatchObject({
      state: 'canceled',
      redirectUrl: null,
    });
    expect(checkoutExpirePosts).toBe(posts + 1);
    const [closed] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.subscriptionId, first.actionId));
    expect(closed).toMatchObject({
      state: 'expired',
      terminalEvidence: { version: 'stripe-subscription-checkout-expired-v1' },
    });
    // Cancelling again is a replay, not a second Stripe write.
    await expect(payments.cancelAction(userId, first.actionId)).resolves.toMatchObject({ state: 'canceled' });
    expect(checkoutExpirePosts).toBe(posts + 1);
    const second = await payments.prepareSubscription(userId, request());
    expect(second).toMatchObject({ state: 'redirect_required' });
    expect(second.actionId).not.toBe(first.actionId);
  });

  it('fails a hosted top-up whose Checkout expired and lets the customer buy again', async () => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Expired Checkout', email: `${userId}@test.invalid`, emailVerified: true });
    const topup = (): { requestId: string; returnPath: string; amountMinor: string; method: 'checkout' } => ({
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '1000',
      method: 'checkout',
    });
    const prepared = await payments.prepareTopup(userId, topup());
    await expect(payments.confirmAction(userId, prepared.actionId)).resolves.toMatchObject({
      state: 'redirect_required',
    });
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    const session = checkoutSessions.get(leg?.providerObjectId ?? '');
    if (leg === undefined || session === undefined) {
      throw new Error('Checkout fixture is incomplete');
    }
    // Stripe expired the Session after 24 hours; its `checkout.session.expired` event is the source.
    session['status'] = 'expired';
    await database
      .update(billingStripeSource)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingStripeSource.stripeAccountId, stripeAccountId));
    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingProviderLeg.environment, 'development'));
    const sourceId = randomUUID();
    await database.insert(billingStripeSource).values({
      id: sourceId,
      environment: 'development',
      stripeAccountId,
      livemode: false,
      sourceType: 'checkout.session',
      sourceId: String(session['id']),
    });
    const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [sourceRow] = await database.select().from(billingStripeSource).where(eq(billingStripeSource.id, sourceId));
    expect(recovery.processed, JSON.stringify({ recovery, error: sourceRow?.errorCode })).toContain(sourceId);
    await expect(payments.getAction(userId, prepared.actionId)).resolves.toMatchObject({
      state: 'failed',
      redirectUrl: null,
    });
    const [closed] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, leg.id));
    expect(closed).toMatchObject({
      state: 'expired',
      terminalEvidence: { version: 'stripe-payment-checkout-expired-v1', amountReceived: '0' },
    });
    await expect(payments.listActions(userId, 'manual_topup')).resolves.toEqual([]);
    await expect(payments.prepareTopup(userId, topup())).resolves.toMatchObject({ state: 'prepared' });
  });

  it.each([
    // A replay returns the original PaymentIntent, here awaiting authentication.
    ['replays a lost saved-card create once under its key', false, { leg: 'attention', purchase: 'attention' }],
    ['fails a saved-card create Stripe rejected outright', true, { leg: 'no_charge', purchase: 'failed' }],
  ])('%s', async (_name, rejected, expected) => {
    const userId = randomUUID();
    await database
      .insert(user)
      .values({ id: userId, name: 'Lost Dispatch', email: `${userId}@test.invalid`, emailVerified: true });
    const prepared = await payments.prepareTopup(userId, {
      requestId: randomUUID(),
      returnPath: '/settings/billing',
      amountMinor: '537',
      method: 'saved_card',
    });
    const [leg] = await database
      .select()
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
    const [binding] = await database
      .select()
      .from(billingStripeCustomer)
      .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
    if (leg === undefined || binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
      throw new Error('Lost dispatch fixture is incomplete');
    }
    paymentFixture = {
      purchaseId: prepared.actionId,
      providerLegId: leg.id,
      customerBindingId: leg.customerBindingId,
      customerId: binding.stripeCustomerId,
    };
    paymentIntentFixtureId = `pi_lost_${randomUUID().replaceAll('-', '')}`;
    paymentStatus = 'requires_action';
    // The process died after claiming the dispatch and before Stripe's answer was stored.
    await database.update(billingPurchase).set({ state: 'creating' }).where(eq(billingPurchase.id, prepared.actionId));
    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingProviderLeg.environment, 'development'));
    await database
      .update(billingStripeSource)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingStripeSource.stripeAccountId, stripeAccountId));
    await database
      .update(billingProviderLeg)
      .set({ state: 'dispatched', dispatchStartedAt: new Date(), nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(billingProviderLeg.id, leg.id));
    rejectPaymentCreate = rejected;
    const posts = paymentCreatePosts;
    try {
      const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(recovery.processed).toContain(leg.id);
      expect(paymentCreatePosts).toBe(posts + 1);
      const [recoveredLeg] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, leg.id));
      const [purchase] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, prepared.actionId));
      expect({ leg: recoveredLeg?.state, purchase: purchase?.state }).toEqual(expected);
      if (rejected) {
        expect(recoveredLeg?.terminalEvidence).toMatchObject({ version: 'stripe-request-rejected-v1' });
      } else {
        expect(recoveredLeg?.providerObjectId).toBe(paymentIntentFixtureId);
      }
    } finally {
      rejectPaymentCreate = false;
      paymentStatus = 'succeeded';
      paymentIntentFixtureId = 'pi_foundation_paid';
    }
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
    // This recovery assertion owns the only due item; prior foundation rows must not win its bounded claim.
    await database
      .update(billingStripeSource)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingStripeSource.stripeAccountId, stripeAccountId));
    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
      .where(eq(billingProviderLeg.environment, 'development'));
    await database
      .update(billingProviderLeg)
      .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
      .where(eq(billingProviderLeg.id, leg.id));
    const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
    const [recoveredLeg] = await database
      .select({ state: billingProviderLeg.state, errorCode: billingProviderLeg.errorCode })
      .from(billingProviderLeg)
      .where(eq(billingProviderLeg.id, leg.id));
    expect(recovery, JSON.stringify({ recoveredLeg, requests: requests.slice(-20) })).toMatchObject({
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

  describe('hosted Checkout without its webhook', () => {
    afterEach(() => {
      paymentIntentFixtureId = 'pi_foundation_paid';
      paymentChargeFixtureId = 'ch_foundation_paid';
      paymentStatus = 'succeeded';
      invoiceFixture = undefined;
    });

    /** A dispatched hosted top-up whose Stripe Session is still open. */
    const openHostedTopup = async (name: string) => {
      const userId = randomUUID();
      await database.insert(user).values({ id: userId, name, email: `${userId}@test.invalid`, emailVerified: true });
      const prepared = await payments.prepareTopup(userId, {
        requestId: randomUUID(),
        returnPath: '/settings/billing',
        amountMinor: '537',
        method: 'checkout',
      });
      await expect(payments.confirmAction(userId, prepared.actionId)).resolves.toMatchObject({
        state: 'redirect_required',
      });
      const [leg] = await database
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
      const [binding] = await database
        .select()
        .from(billingStripeCustomer)
        .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
      const session = checkoutSessions.get(leg?.providerObjectId ?? '');
      if (
        leg === undefined ||
        session === undefined ||
        binding?.stripeCustomerId === null ||
        binding?.stripeCustomerId === undefined
      ) {
        throw new Error('Hosted top-up fixture is incomplete');
      }
      return { userId, actionId: prepared.actionId, leg, customerId: binding.stripeCustomerId, session };
    };

    /**
     * Stripe completes the Session and settles its charge; the webhook endpoint never receives the events. A Session
     * whose earlier attempt was declined completes on that attempt's PaymentIntent.
     */
    const payHostedTopup = (topup: Awaited<ReturnType<typeof openHostedTopup>>, paymentIntentId?: string): void => {
      const suffix = randomUUID().replaceAll('-', '');
      paymentIntentFixtureId = paymentIntentId ?? `pi_hosted_${suffix}`;
      paymentChargeFixtureId = `ch_hosted_${suffix}`;
      paymentStatus = 'succeeded';
      paymentFixture = {
        purchaseId: topup.actionId,
        providerLegId: topup.leg.id,
        customerBindingId: topup.leg.customerBindingId,
        customerId: topup.customerId,
      };
      Object.assign(topup.session, {
        status: 'complete',
        payment_status: 'paid',
        payment_intent: paymentIntentFixtureId,
        url: null,
        currency: 'usd',
        amount_subtotal: 537,
        amount_total: 537,
        total_details: { amount_tax: 0 },
        automatic_tax: { status: 'complete' },
        customer_details: { address: latestCustomerAddress },
        metadata: {
          tau_purchase_id: topup.actionId,
          tau_customer_binding_id: topup.leg.customerBindingId,
          tau_provider_leg_id: topup.leg.id,
        },
      });
    };

    /** Leaves one provider leg due, so a bounded pass works on it alone. */
    const onlyDue = async (legId: string): Promise<void> => {
      await database
        .update(billingStripeSource)
        .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(eq(billingStripeSource.stripeAccountId, stripeAccountId));
      await database
        .update(billingProviderLeg)
        .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(eq(billingProviderLeg.environment, 'development'));
      await database
        .update(billingProviderLeg)
        .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
        .where(eq(billingProviderLeg.id, legId));
    };

    /** The error code the sweep left on a leg, for a failing assertion's message. */
    const legError = async (legId: string): Promise<string | undefined> => {
      const [row] = await database
        .select({ errorCode: billingProviderLeg.errorCode })
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.id, legId));
      return row?.errorCode ?? undefined;
    };

    /** Delivers one signed event the way Stripe's endpoint would, once it is re-enabled. */
    const deliverLater = async (type: string, object: { readonly id: string; readonly object: string }) => {
      const body = JSON.stringify({
        id: `evt_${randomUUID().replaceAll('-', '')}`,
        object: 'event',
        api_version: stripeApiVersion,
        type,
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: { object },
      });
      await payments.receiveWebhook(
        new TextEncoder().encode(body),
        fixtureStripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_fixture_1234567890' }),
      );
    };

    it('should fulfil a paid hosted top-up once from the provider-leg sweep', async () => {
      const topup = await openHostedTopup('Hosted Sweep');
      payHostedTopup(topup);
      await onlyDue(topup.leg.id);
      const recovery = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(
        recovery,
        JSON.stringify({ errorCode: await legError(topup.leg.id), requests: requests.slice(-20) }),
      ).toEqual({
        processed: [topup.leg.id],
        pending: [],
        failed: [],
      });
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
        receipt: { grantedCreditAtoms: '5370000' },
      });
      const [purchase] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, topup.actionId));
      // Stripe's settled charge dates the acceptance, not the pass that read it.
      expect(purchase?.paidAt).toEqual(new Date(1_788_650_001_000));

      // A later real delivery of the success event finds the purchase already fulfilled.
      await deliverLater('payment_intent.succeeded', { id: paymentIntentFixtureId, object: 'payment_intent' });
      const replay = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(replay).toMatchObject({ processed: [expect.any(String)], pending: [], failed: [] });
      const [delivered] = await database
        .select()
        .from(billingStripeSource)
        .where(
          and(
            eq(billingStripeSource.sourceType, 'payment_intent'),
            eq(billingStripeSource.sourceId, paymentIntentFixtureId),
          ),
        );
      expect(delivered).toMatchObject({ state: 'done', errorCode: null });
      const grants = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.purchaseId, topup.actionId));
      expect(grants).toHaveLength(1);
    });

    it('should fulfil a paid hosted top-up once when its customer returns and recovers it', async () => {
      const topup = await openHostedTopup('Hosted Recover');
      payHostedTopup(topup);
      const first = await payments.recoverAction(topup.userId, topup.actionId);
      expect(first, JSON.stringify(requests.slice(-20))).toMatchObject({
        state: 'fulfilled',
        receipt: { grantedCreditAtoms: '5370000' },
      });
      // A terminal action is answered from the database: no Stripe read, no new lease.
      const stripeRequests = requests.length;
      const second = await payments.recoverAction(topup.userId, topup.actionId);
      expect(second).toMatchObject({ state: 'fulfilled', receipt: first.receipt });
      expect(requests.length).toBe(stripeRequests);
      // A later real delivery of the success event finds the recovered purchase already fulfilled.
      await onlyDue(topup.leg.id);
      await deliverLater('payment_intent.succeeded', { id: paymentIntentFixtureId, object: 'payment_intent' });
      await expect(payments.recoverPayments({ environment: 'development', limit: 1 })).resolves.toMatchObject({
        processed: [expect.any(String)],
        pending: [],
        failed: [],
      });
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
        receipt: first.receipt,
      });
      const grants = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.purchaseId, topup.actionId));
      expect(grants).toHaveLength(1);
    });

    it('should keep an open hosted Checkout resumable when its customer recovers it', async () => {
      const topup = await openHostedTopup('Hosted Open');
      await expect(payments.recoverAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'redirect_required',
        redirectUrl: topup.session['url'],
      });
    });

    /** A second hosted top-up request for the same customer. */
    const anotherTopup = async (userId: string) =>
      payments.prepareTopup(userId, {
        requestId: randomUUID(),
        returnPath: '/settings/billing',
        amountMinor: '537',
        method: 'checkout',
      });

    it('should close an expired hosted top-up from the provider-leg sweep and let its customer buy again', async () => {
      const topup = await openHostedTopup('Hosted Expired Sweep');
      // Stripe expired the Session after 24 hours; its `checkout.session.expired` event never arrives.
      Object.assign(topup.session, { status: 'expired', url: null });
      await expect(anotherTopup(topup.userId)).rejects.toMatchObject({ response: { code: 'action_already_pending' } });
      await onlyDue(topup.leg.id);
      const swept = await payments.recoverPayments({ environment: 'development', limit: 1 });
      const diagnostic = JSON.stringify({ errorCode: await legError(topup.leg.id), requests: requests.slice(-20) });
      expect(swept, diagnostic).toEqual({ processed: [topup.leg.id], pending: [], failed: [] });
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'failed',
        redirectUrl: null,
      });
      const [closed] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, topup.leg.id));
      expect(closed).toMatchObject({
        state: 'expired',
        terminalEvidence: { version: 'stripe-payment-checkout-expired-v1', amountReceived: '0' },
        nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
      });
      // The closed leg is never due again, so a later pass reads nothing from Stripe.
      const stripeRequests = requests.length;
      await expect(payments.recoverPayments({ environment: 'development', limit: 1 })).resolves.toEqual({
        processed: [],
        pending: [],
        failed: [],
      });
      expect(requests.length).toBe(stripeRequests);
      await expect(anotherTopup(topup.userId)).resolves.toMatchObject({ state: 'prepared' });
    });

    it('should cancel an expired hosted top-up when its customer recovers it', async () => {
      const topup = await openHostedTopup('Hosted Expired Recover');
      Object.assign(topup.session, { status: 'expired', url: null });
      await expect(payments.recoverAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'canceled',
        redirectUrl: null,
      });
      const [closed] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, topup.leg.id));
      expect(closed).toMatchObject({
        state: 'expired',
        terminalEvidence: { version: 'stripe-payment-checkout-expired-v1', amountReceived: '0' },
      });
      await expect(anotherTopup(topup.userId)).resolves.toMatchObject({ state: 'prepared' });
    });

    /** The issuer declines the card the customer entered: Stripe keeps the Session open on a waiting PaymentIntent. */
    const declineHostedTopup = (topup: Awaited<ReturnType<typeof openHostedTopup>>): string => {
      paymentIntentFixtureId = `pi_hosted_declined_${randomUUID().replaceAll('-', '')}`;
      paymentStatus = 'requires_payment_method';
      paymentFixture = {
        purchaseId: topup.actionId,
        providerLegId: topup.leg.id,
        customerBindingId: topup.leg.customerBindingId,
        customerId: topup.customerId,
      };
      topup.session['payment_intent'] = paymentIntentFixtureId;
      return paymentIntentFixtureId;
    };

    /** Delivers the decline's own event and settles it alone, as the webhook worker would. */
    const deliverDecline = async (topup: Awaited<ReturnType<typeof openHostedTopup>>, paymentIntentId: string) => {
      await onlyDue(topup.leg.id);
      await deliverLater('payment_intent.payment_failed', { id: paymentIntentId, object: 'payment_intent' });
      const pass = await payments.recoverPayments({ environment: 'development', limit: 1 });
      // The open Session still decides the payment, so the PaymentIntent's source waits rather than settling it.
      expect(pass, JSON.stringify({ errorCode: await legError(topup.leg.id), requests: requests.slice(-20) })).toEqual({
        processed: [],
        pending: [expect.any(String)],
        failed: [],
      });
    };

    /** The PaymentIntent's queued source, read back after the pass that settled it. */
    const paymentIntentSource = async (paymentIntentId: string) => {
      const [source] = await database
        .select()
        .from(billingStripeSource)
        .where(
          and(eq(billingStripeSource.sourceType, 'payment_intent'), eq(billingStripeSource.sourceId, paymentIntentId)),
        );
      return source;
    };

    it('should keep a hosted top-up resumable at its Checkout link after a declined card', async () => {
      const topup = await openHostedTopup('Hosted Declined');
      const paymentIntentId = declineHostedTopup(topup);
      await deliverDecline(topup, paymentIntentId);
      // The provider-leg sweep re-reads the open Session and leaves the purchase where its customer can pay.
      await onlyDue(topup.leg.id);
      const swept = await payments.recoverPayments({ environment: 'development', limit: 1 });
      const diagnostic = JSON.stringify({ errorCode: await legError(topup.leg.id), requests: requests.slice(-20) });
      expect(swept, diagnostic).toEqual({ processed: [topup.leg.id], pending: [], failed: [] });
      const resumable = { state: 'redirect_required', redirectUrl: topup.session['url'], attention: null };
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject(resumable);
      await expect(payments.recoverAction(topup.userId, topup.actionId)).resolves.toMatchObject(resumable);
      const [purchase] = await database.select().from(billingPurchase).where(eq(billingPurchase.id, topup.actionId));
      expect(purchase?.state).toBe('pending');
      const [leg] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, topup.leg.id));
      expect(leg).toMatchObject({ state: 'known', errorCode: null });

      // Its customer can still walk away: cancelling expires the Session, which cancels its PaymentIntent.
      await expect(payments.cancelAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'canceled',
        redirectUrl: null,
      });
      // The cancellation's own event finds the purchase closed and settles the waiting source.
      await onlyDue(topup.leg.id);
      await deliverLater('payment_intent.canceled', { id: paymentIntentId, object: 'payment_intent' });
      await expect(payments.recoverPayments({ environment: 'development', limit: 1 })).resolves.toEqual({
        processed: [expect.any(String)],
        pending: [],
        failed: [],
      });
      await expect(paymentIntentSource(paymentIntentId)).resolves.toMatchObject({ state: 'done', errorCode: null });
      await expect(anotherTopup(topup.userId)).resolves.toMatchObject({ state: 'prepared' });
    });

    it('should fulfil a hosted top-up its customer pays in the same Checkout after a declined card', async () => {
      const topup = await openHostedTopup('Hosted Declined Then Paid');
      const paymentIntentId = declineHostedTopup(topup);
      await deliverDecline(topup, paymentIntentId);
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'redirect_required',
      });
      // A second card succeeds on the same PaymentIntent and Stripe completes the Session.
      payHostedTopup(topup, paymentIntentId);
      await deliverLater('payment_intent.succeeded', { id: paymentIntentId, object: 'payment_intent' });
      await deliverLater('checkout.session.completed', {
        id: topup.leg.providerObjectId ?? '',
        object: 'checkout.session',
      });
      const settled = await payments.recoverPayments({ environment: 'development', limit: 4 });
      expect(settled, JSON.stringify(requests.slice(-20))).toEqual({
        processed: [expect.any(String), expect.any(String)],
        pending: [],
        failed: [],
      });
      await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
        receipt: { grantedCreditAtoms: '5370000' },
      });
      await expect(paymentIntentSource(paymentIntentId)).resolves.toMatchObject({ state: 'done', errorCode: null });
      const grants = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.purchaseId, topup.actionId));
      expect(grants).toHaveLength(1);
    });

    it.each([
      ['payment_intent.canceled', 'checkout.session.expired'],
      ['checkout.session.expired', 'payment_intent.canceled'],
    ] as const)(
      'should fail a declined hosted top-up when its Checkout expires, %s first, and let its account close',
      async (first, second) => {
        const topup = await openHostedTopup(`Hosted Declined Expired ${first}`);
        const paymentIntentId = declineHostedTopup(topup);
        await deliverDecline(topup, paymentIntentId);
        const closure = new BillingAccountClosureService(
          { database: runtimeDatabase },
          { recoverAndCancel: async () => ({ status: 'not_created' }) },
          'development',
        );
        await expect(closure.prepare({ authUserId: topup.userId, requestId: randomUUID() })).rejects.toMatchObject({
          response: { code: 'payment_action_pending' },
        });
        // Stripe expires the abandoned Session after 24 hours and cancels its PaymentIntent.
        Object.assign(topup.session, { status: 'expired', url: null });
        paymentStatus = 'canceled';
        const objects = {
          'payment_intent.canceled': { id: paymentIntentId, object: 'payment_intent' },
          'checkout.session.expired': { id: topup.leg.providerObjectId ?? '', object: 'checkout.session' },
        };
        /** Delivers one of the two events and settles it in a pass of its own. */
        const settle = async (type: typeof first) => {
          await deliverLater(type, objects[type]);
          const pass = await payments.recoverPayments({ environment: 'development', limit: 1 });
          const diagnostic = JSON.stringify({
            type,
            errorCode: await legError(topup.leg.id),
            requests: requests.slice(-20),
          });
          expect(pass, diagnostic).toEqual({ processed: [expect.any(String)], pending: [], failed: [] });
        };
        await settle(first);
        await settle(second);
        await expect(payments.getAction(topup.userId, topup.actionId)).resolves.toMatchObject({
          state: 'failed',
          redirectUrl: null,
        });
        const [closed] = await database
          .select()
          .from(billingProviderLeg)
          .where(eq(billingProviderLeg.id, topup.leg.id));
        expect(closed).toMatchObject({
          state: 'expired',
          terminalEvidence: { version: 'stripe-payment-checkout-expired-v1', paymentIntentId, amountReceived: '0' },
        });
        await expect(paymentIntentSource(paymentIntentId)).resolves.toMatchObject({ state: 'done', errorCode: null });
        await expect(closure.prepare({ authUserId: topup.userId, requestId: randomUUID() })).resolves.toMatchObject({
          state: 'ready_for_auth_deletion',
        });
      },
    );

    // A payment_intent leg carries no Checkout session, so the charge-time fallback never applies to it: this
    // pins that a settled saved-card charge still waits for its event. The extra conjunct on the fallback (a
    // Checkout leg whose request names a payment method) is forward defence that no fixture can build today.
    it('should keep a saved-card charge waiting for its event although its charge has settled', async () => {
      const userId = randomUUID();
      await database
        .insert(user)
        .values({ id: userId, name: 'Saved Card Waits', email: `${userId}@test.invalid`, emailVerified: true });
      const prepared = await payments.prepareTopup(userId, {
        requestId: randomUUID(),
        returnPath: '/settings/billing',
        amountMinor: '537',
        method: 'saved_card',
      });
      const [leg] = await database
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.purchaseId, prepared.actionId));
      const [binding] = await database
        .select()
        .from(billingStripeCustomer)
        .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
      if (leg === undefined || binding?.stripeCustomerId === null || binding?.stripeCustomerId === undefined) {
        throw new Error('Saved-card fixture is incomplete');
      }
      const suffix = randomUUID().replaceAll('-', '');
      paymentFixture = {
        purchaseId: prepared.actionId,
        providerLegId: leg.id,
        customerBindingId: leg.customerBindingId,
        customerId: binding.stripeCustomerId,
      };
      paymentIntentFixtureId = `pi_saved_${suffix}`;
      paymentChargeFixtureId = `ch_saved_${suffix}`;
      await payments.confirmAction(userId, prepared.actionId);
      // Stripe has settled the charge, but a saved-card leg takes no charge-time acceptance: only the event does.
      await onlyDue(leg.id);
      const swept = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(swept.failed, (await legError(leg.id)) ?? '').toEqual([]);
      const waiting = await payments.getAction(userId, prepared.actionId);
      expect(waiting.state).toMatch(/^(?:processing|funds_received)$/u);
      await deliverLater('payment_intent.succeeded', { id: paymentIntentFixtureId, object: 'payment_intent' });
      const delivered = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(delivered.failed, JSON.stringify(requests.slice(-20))).toEqual([]);
      await expect(payments.getAction(userId, prepared.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
        receipt: { grantedCreditAtoms: '5370000' },
      });
    });

    /** A dispatched hosted Pro Checkout, still open. */
    const openHostedPro = async (name: string) => {
      const userId = randomUUID();
      await database.insert(user).values({ id: userId, name, email: `${userId}@test.invalid`, emailVerified: true });
      const action = await payments.prepareSubscription(userId, {
        requestId: randomUUID(),
        returnPath: '/settings/billing',
      });
      const [leg] = await database
        .select()
        .from(billingProviderLeg)
        .where(eq(billingProviderLeg.subscriptionId, action.actionId));
      const [binding] = await database
        .select()
        .from(billingStripeCustomer)
        .where(eq(billingStripeCustomer.id, leg?.customerBindingId ?? ''));
      const session = checkoutSessions.get(leg?.providerObjectId ?? '');
      if (
        leg === undefined ||
        session === undefined ||
        binding?.stripeCustomerId === null ||
        binding?.stripeCustomerId === undefined
      ) {
        throw new Error('Hosted Pro fixture is incomplete');
      }
      return { userId, action, leg, customerId: binding.stripeCustomerId, session };
    };

    /** Stripe completes the Pro Session with its subscription and paid first invoice; no event is delivered. */
    const payHostedPro = (pro: Awaited<ReturnType<typeof openHostedPro>>) => {
      const suffix = randomUUID().replaceAll('-', '');
      const remoteSubscriptionId = `sub_hosted_${suffix}`;
      const invoiceId = `in_hosted_${suffix}`;
      invoiceFixture = {
        invoiceId,
        subscriptionId: remoteSubscriptionId,
        customerId: pro.customerId,
        paid: true,
        // The fixture's invoice payment settles inside this period, which runs past today.
        periodStart: 1_788_600_000,
        periodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };
      Object.assign(pro.session, {
        status: 'complete',
        payment_status: 'paid',
        subscription: remoteSubscriptionId,
        invoice: invoiceId,
        url: null,
      });
      return { remoteSubscriptionId, invoiceId };
    };

    it('should queue the first invoice on recover when checkout.session.completed linked Pro without it', async () => {
      const pro = await openHostedPro('Hosted Pro Linked');
      const { remoteSubscriptionId, invoiceId } = payHostedPro(pro);
      // Only the delivered session event is due: the leg sweep must not be the one that queues the invoice.
      await onlyDue(pro.leg.id);
      await database
        .update(billingProviderLeg)
        .set({ nextAttemptAt: new Date('9999-12-31T00:00:00Z') })
        .where(eq(billingProviderLeg.id, pro.leg.id));
      await deliverLater('checkout.session.completed', {
        id: pro.leg.providerObjectId ?? '',
        object: 'checkout.session',
      });
      const linkedBySession = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(linkedBySession, JSON.stringify(requests.slice(-20))).toMatchObject({ failed: [] });
      const [linked] = await database.select().from(subscription).where(eq(subscription.id, pro.action.actionId));
      expect(linked?.stripeSubscriptionId).toBe(remoteSubscriptionId);
      const [queued] = await database
        .select()
        .from(billingStripeSource)
        .where(and(eq(billingStripeSource.sourceType, 'invoice'), eq(billingStripeSource.sourceId, invoiceId)));
      expect(queued).toBeUndefined();
      // The customer returns: recover queues the invoice the session event never did and settles it inline.
      const recovered = await payments.recoverAction(pro.userId, pro.action.actionId);
      expect(recovered, JSON.stringify(requests.slice(-20))).toMatchObject({
        state: 'fulfilled',
        receipt: { grantedCreditAtoms: '20000000' },
      });
      const [settled] = await database
        .select()
        .from(billingStripeSource)
        .where(and(eq(billingStripeSource.sourceType, 'invoice'), eq(billingStripeSource.sourceId, invoiceId)));
      // Inserted at 0, queued to 1 by markStripeSourcePending, claimed inline to 2; the claim's finish never resets it.
      expect(settled).toMatchObject({ state: 'done', generation: 2n });
      // A second recover answers the terminal action without touching the settled source.
      const stripeRequests = requests.length;
      await expect(payments.recoverAction(pro.userId, pro.action.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
      });
      expect(requests.length).toBe(stripeRequests);
      const [unchanged] = await database
        .select()
        .from(billingStripeSource)
        .where(and(eq(billingStripeSource.sourceType, 'invoice'), eq(billingStripeSource.sourceId, invoiceId)));
      expect(unchanged).toMatchObject({ state: 'done', generation: 2n });
    });

    it('should grant Pro from a paid subscription Checkout through the sweep and keep it idempotent', async () => {
      const pro = await openHostedPro('Hosted Pro');
      const { remoteSubscriptionId, invoiceId } = payHostedPro(pro);
      const { userId, action, leg } = pro;
      await onlyDue(leg.id);
      // The sweep links the Stripe subscription and queues its first invoice, as `invoice.paid` would.
      const swept = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(swept, JSON.stringify({ errorCode: await legError(leg.id), requests: requests.slice(-20) })).toEqual({
        processed: [leg.id],
        pending: [],
        failed: [],
      });
      const [linked] = await database.select().from(subscription).where(eq(subscription.id, action.actionId));
      expect(linked?.stripeSubscriptionId).toBe(remoteSubscriptionId);
      const granted = await payments.recoverPayments({ environment: 'development', limit: 1 });
      expect(granted, JSON.stringify(requests.slice(-20))).toMatchObject({
        processed: [expect.any(String)],
        pending: [],
        failed: [],
      });
      const databaseService = mock<DatabaseService>();
      // Assigned rather than passed to `mock`, which would wrap the live client in proxies.
      Object.assign(databaseService, { database });
      const billing = new BillingService(
        databaseService,
        new ConfigService<Environment, true>({
          BILLING_ENVIRONMENT: 'development',
          STRIPE_ACCOUNT_ID: stripeAccountId,
          STRIPE_LIVEMODE: false,
        }),
        mockDeep<Stripe>(),
      );
      await expect(billing.getEntitlements(userId)).resolves.toMatchObject({ tier: 'pro' });
      const fulfilled = await payments.getAction(userId, action.actionId);
      expect(fulfilled).toMatchObject({ state: 'fulfilled', receipt: { grantedCreditAtoms: '20000000' } });

      // Recovering again and a later real `invoice.paid` delivery both re-read the same paid period.
      await expect(payments.recoverAction(userId, action.actionId)).resolves.toMatchObject({
        state: 'fulfilled',
        receipt: fulfilled.receipt,
      });
      await deliverLater('invoice.paid', { id: invoiceId, object: 'invoice' });
      expect(await payments.recoverPayments({ environment: 'development', limit: 1 })).toMatchObject({
        processed: [expect.any(String)],
        pending: [],
        failed: [],
      });
      const [period] = await database.select().from(billingPeriod).where(eq(billingPeriod.invoiceId, invoiceId));
      const grants = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.periodId, period?.id ?? ''));
      expect(grants).toHaveLength(1);
      await expect(billing.getEntitlements(userId)).resolves.toMatchObject({ tier: 'pro' });
    });

    it('should end an expired Pro Checkout from the provider-leg sweep so its customer can subscribe again', async () => {
      const pro = await openHostedPro('Hosted Pro Expired');
      // Stripe expired the Session after 24 hours; its `checkout.session.expired` event never arrives.
      Object.assign(pro.session, { status: 'expired', url: null });
      const request = () => ({ requestId: randomUUID(), returnPath: '/settings/billing' });
      await expect(payments.prepareSubscription(pro.userId, request())).rejects.toMatchObject({
        response: { code: 'action_already_pending' },
      });
      await onlyDue(pro.leg.id);
      const swept = await payments.recoverPayments({ environment: 'development', limit: 1 });
      const diagnostic = JSON.stringify({ errorCode: await legError(pro.leg.id), requests: requests.slice(-20) });
      expect(swept, diagnostic).toEqual({ processed: [pro.leg.id], pending: [], failed: [] });
      const [ended] = await database.select().from(subscription).where(eq(subscription.id, pro.action.actionId));
      expect(ended).toMatchObject({ slotState: 'ended', status: 'incomplete_expired', stripeSubscriptionId: null });
      const [closed] = await database.select().from(billingProviderLeg).where(eq(billingProviderLeg.id, pro.leg.id));
      expect(closed).toMatchObject({
        state: 'expired',
        terminalEvidence: { version: 'stripe-subscription-checkout-expired-v1' },
        nextAttemptAt: new Date('9999-12-31T00:00:00Z'),
      });
      const again = await payments.prepareSubscription(pro.userId, request());
      expect(again).toMatchObject({ state: 'redirect_required' });
      expect(again.actionId).not.toBe(pro.action.actionId);
    });
  });
});
