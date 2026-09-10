/* eslint-disable @typescript-eslint/naming-convention -- Stripe fixtures and child environments retain external wire names. */
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingPolicyService } from '#api/billing/billing-policy.service.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type {
  NoChargeEvidence,
  PaidPaymentEvidence,
  PaymentOfferSnapshot,
} from '#api/billing/billing-payment-contract.js';
import { seedBillingFixturePolicy } from '#testing/billing-policy.fixture.js';

if (process.env['BILLING_TEST_DATABASE_URL'] === undefined || process.env['BILLING_TEST_OWNED'] === undefined) {
  throw new Error('Use the isolated billing launcher');
}

const children = new Set<ReturnType<typeof fork>>();
const activeRowReleases = new Set<() => void>();
const childMessages = new WeakMap<ReturnType<typeof fork>, unknown[]>();
const childWaiters = new WeakMap<ReturnType<typeof fork>, Array<(message: unknown) => void>>();
const childDiagnostics = new WeakMap<ReturnType<typeof fork>, string>();
const requests: string[] = [];
const databaseUrl = process.env['BILLING_TEST_DATABASE_URL'];
const adminClient = postgres(databaseUrl, { max: 2, prepare: false });
const runtimeClient = postgres(databaseUrl, { max: 2, prepare: false, connection: { role: 'tau_billing_runtime' } });
const database = drizzle(adminClient, { schema });
const runtimeDatabase = drizzle(runtimeClient, { schema });
const policy = new BillingPolicyService({ database: runtimeDatabase });
const ledger = new CreditLedgerService({ database: runtimeDatabase }, policy);
let customerSearchId = 'cus_process';
let checkoutRecovery: { readonly id: string; readonly purchaseId: string } | undefined;
let createdPayment: { readonly purchaseId: string; readonly legId: string; readonly bindingId: string } | undefined;
let cancelPayment: { readonly purchaseId: string; readonly legId: string; readonly bindingId: string } | undefined;
let sourcePayment:
  | {
      readonly purchaseId: string;
      readonly legId: string;
      readonly bindingId: string;
      readonly paymentIntentId: string;
      readonly chargeId: string;
    }
  | undefined;
let holdNextSearch = false;
let releaseSearch: (() => void) | undefined;
let searchArrived: (() => void) | undefined;
let searchResponded: (() => void) | undefined;
// oxlint-disable-next-line complexity -- one local server intentionally models the bounded Stripe endpoints used by this process suite.
const stripeFixture = createServer((request, response) => {
  requests.push(`${request.method ?? ''} ${request.url ?? ''}`);
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && ['/v1/refunds', '/v1/disputes'].includes(url.pathname)) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ object: 'list', data: [], has_more: false, url: url.pathname }));
    return;
  }
  if (url.pathname === '/v1/customers/search' || url.pathname.startsWith('/v1/customers/cus_')) {
    searchArrived?.();
    searchArrived = undefined;
    const responseCustomerId = customerSearchId;
    const customer = { id: responseCustomerId, object: 'customer', livemode: false, metadata: {} };
    const body =
      url.pathname === '/v1/customers/search'
        ? { object: 'search_result', data: [customer], has_more: false }
        : customer;
    const finish = (): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body), () => {
        searchResponded?.();
        searchResponded = undefined;
      });
    };
    if (holdNextSearch) {
      holdNextSearch = false;
      releaseSearch = finish;
    } else {
      finish();
    }
    return;
  }
  if (sourcePayment !== undefined && url.pathname === `/v1/payment_intents/${sourcePayment.paymentIntentId}`) {
    searchArrived?.();
    searchArrived = undefined;
    const currentSourcePayment = sourcePayment;
    const metadata = {
      tau_purchase_id: currentSourcePayment.purchaseId,
      tau_provider_leg_id: currentSourcePayment.legId,
      tau_customer_binding_id: currentSourcePayment.bindingId,
    };
    const finish = (): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: currentSourcePayment.paymentIntentId,
          object: 'payment_intent',
          amount: 500,
          amount_capturable: 0,
          amount_received: 500,
          created: 1_788_650_000,
          currency: 'usd',
          customer: customerSearchId,
          latest_charge: currentSourcePayment.chargeId,
          livemode: false,
          metadata,
          payment_method: 'pm_process',
          status: 'succeeded',
        }),
      );
    };
    if (holdNextSearch) {
      holdNextSearch = false;
      releaseSearch = finish;
    } else {
      finish();
    }
    return;
  }
  if (url.pathname === '/v1/payment_intents' && request.method === 'POST' && createdPayment !== undefined) {
    searchArrived?.();
    searchArrived = undefined;
    const object = {
      id: 'pi_process_created',
      object: 'payment_intent',
      amount: 500,
      amount_capturable: 0,
      amount_received: 500,
      created: 1_788_650_000,
      currency: 'usd',
      customer: customerSearchId,
      latest_charge: 'ch_process_created',
      livemode: false,
      metadata: {
        tau_purchase_id: createdPayment.purchaseId,
        tau_provider_leg_id: createdPayment.legId,
        tau_customer_binding_id: createdPayment.bindingId,
      },
      payment_method: 'pm_old',
      status: 'succeeded',
    };
    const finish = (): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(object), () => {
        searchResponded?.();
        searchResponded = undefined;
      });
    };
    if (holdNextSearch) {
      holdNextSearch = false;
      releaseSearch = finish;
    } else {
      finish();
    }
    return;
  }
  if (url.pathname === '/v1/payment_intents/search' && request.method === 'GET' && createdPayment !== undefined) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        object: 'search_result',
        data: [
          {
            id: 'pi_process_created',
            object: 'payment_intent',
            amount: 500,
            amount_capturable: 0,
            amount_received: 500,
            created: 1_788_650_000,
            currency: 'usd',
            customer: customerSearchId,
            latest_charge: 'ch_process_created',
            livemode: false,
            metadata: {
              tau_purchase_id: createdPayment.purchaseId,
              tau_provider_leg_id: createdPayment.legId,
              tau_customer_binding_id: createdPayment.bindingId,
            },
            payment_method: 'pm_old',
            status: 'succeeded',
          },
        ],
        has_more: false,
        next_page: null,
      }),
    );
    return;
  }
  if (url.pathname === '/v1/payment_intents/pi_process_created' && createdPayment !== undefined) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'pi_process_created',
        object: 'payment_intent',
        amount: 500,
        amount_capturable: 0,
        amount_received: 500,
        created: 1_788_650_000,
        currency: 'usd',
        customer: customerSearchId,
        latest_charge: 'ch_process_created',
        livemode: false,
        metadata: {
          tau_purchase_id: createdPayment.purchaseId,
          tau_provider_leg_id: createdPayment.legId,
          tau_customer_binding_id: createdPayment.bindingId,
        },
        payment_method: 'pm_old',
        status: 'succeeded',
      }),
    );
    return;
  }
  if (url.pathname === '/v1/charges/ch_process_created') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'ch_process_created',
        object: 'charge',
        amount: 500,
        amount_captured: 500,
        amount_refunded: 0,
        created: 1_788_650_001,
        currency: 'usd',
        customer: customerSearchId,
        livemode: false,
        paid: true,
        payment_intent: 'pi_process_created',
        payment_method: 'pm_old',
        payment_method_details: { card: { brand: 'visa', last4: '4242' } },
        refunded: false,
        status: 'succeeded',
      }),
    );
    return;
  }
  if (url.pathname === '/v1/payment_intents/pi_process_cancel/cancel' && request.method === 'POST') {
    searchArrived?.();
    searchArrived = undefined;
    const finish = (): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'pi_process_cancel',
          object: 'payment_intent',
          amount: 500,
          amount_capturable: 0,
          amount_received: 0,
          created: 1_788_650_000,
          currency: 'usd',
          customer: customerSearchId,
          latest_charge: null,
          livemode: false,
          metadata:
            cancelPayment === undefined
              ? {}
              : {
                  tau_purchase_id: cancelPayment.purchaseId,
                  tau_provider_leg_id: cancelPayment.legId,
                  tau_customer_binding_id: cancelPayment.bindingId,
                },
          payment_method: 'pm_old',
          status: 'canceled',
        }),
        () => {
          searchResponded?.();
          searchResponded = undefined;
        },
      );
    };
    if (holdNextSearch) {
      holdNextSearch = false;
      releaseSearch = finish;
    } else {
      finish();
    }
    return;
  }
  if (url.pathname === '/v1/payment_intents/pi_process_cancel') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'pi_process_cancel',
        object: 'payment_intent',
        amount: 500,
        amount_capturable: 0,
        amount_received: 0,
        created: 1_788_650_000,
        currency: 'usd',
        customer: customerSearchId,
        latest_charge: null,
        livemode: false,
        metadata:
          cancelPayment === undefined
            ? {}
            : {
                tau_purchase_id: cancelPayment.purchaseId,
                tau_provider_leg_id: cancelPayment.legId,
                tau_customer_binding_id: cancelPayment.bindingId,
              },
        payment_method: 'pm_old',
        status: 'canceled',
      }),
    );
    return;
  }
  if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'cs_process_created',
        object: 'checkout.session',
        client_reference_id: null,
        customer: customerSearchId,
        livemode: false,
        mode: 'payment',
        payment_intent: null,
        status: 'open',
        url: 'https://checkout.stripe.test/created',
      }),
    );
    return;
  }
  if (url.pathname === '/v1/checkout/sessions' && checkoutRecovery !== undefined) {
    searchArrived?.();
    searchArrived = undefined;
    const finish = (): void => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: checkoutRecovery?.id,
              object: 'checkout.session',
              client_reference_id: checkoutRecovery?.purchaseId,
              customer: customerSearchId,
              livemode: false,
              mode: 'payment',
              payment_intent: null,
              status: 'open',
              url: 'https://checkout.stripe.test/process',
            },
          ],
          has_more: false,
          url: '/v1/checkout/sessions',
        }),
        () => {
          searchResponded?.();
          searchResponded = undefined;
        },
      );
    };
    if (holdNextSearch) {
      holdNextSearch = false;
      releaseSearch = finish;
    } else {
      finish();
    }
    return;
  }
  if (sourcePayment !== undefined && url.pathname === `/v1/charges/${sourcePayment.chargeId}`) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: sourcePayment.chargeId,
        object: 'charge',
        amount: 500,
        amount_captured: 500,
        amount_refunded: 0,
        created: 1_788_650_001,
        currency: 'usd',
        customer: customerSearchId,
        livemode: false,
        paid: true,
        payment_intent: sourcePayment.paymentIntentId,
        payment_method: 'pm_process',
        payment_method_details: { card: { brand: 'visa', last4: '4242' } },
        refunded: false,
        status: 'succeeded',
      }),
    );
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: { message: `Unexpected ${url.pathname}`, type: 'invalid_request_error' } }));
});
let stripeUrl: string;

const waitFor = async (
  child: ReturnType<typeof fork>,
  state: string,
): Promise<{ readonly state: string; readonly detail?: unknown }> => {
  const queued = childMessages.get(child)?.shift();
  const message =
    queued ??
    (await new Promise<unknown>((resolve) => {
      childWaiters.get(child)?.push(resolve);
    }));
  if (message === null || typeof message !== 'object' || !('state' in message) || message.state !== state) {
    throw new Error(`Expected payment child checkpoint ${state}; received ${JSON.stringify(message)}`);
  }
  return { state, ...('detail' in message ? { detail: message.detail } : {}) };
};
const trackChild = (child: ReturnType<typeof fork>): void => {
  childMessages.set(child, []);
  childWaiters.set(child, []);
  childDiagnostics.set(child, '');
  const deliver = (message: unknown): void => {
    const waiter = childWaiters.get(child)?.shift();
    if (waiter === undefined) {
      childMessages.get(child)?.push(message);
    } else {
      waiter(message);
    }
  };
  child.on('message', deliver);
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk: unknown) => {
      childDiagnostics.set(child, `${childDiagnostics.get(child) ?? ''}${String(chunk)}`.slice(-4096));
    });
  }
  child.once('error', (error) => {
    deliver({ state: 'child_error', detail: error.message });
  });
  child.once('exit', (code, signal) => {
    deliver({ state: 'child_exit', detail: { code, signal, output: childDiagnostics.get(child) ?? '' } });
  });
};
const kill = async (child: ReturnType<typeof fork>): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
};

const startRecovery = async () => {
  const childEnvironment = Object.fromEntries(
    [
      ['PATH', process.env['PATH']],
      ['HOME', process.env['HOME']],
      ['TMPDIR', process.env['TMPDIR']],
      ['BILLING_TEST_DATABASE_URL', databaseUrl],
      ['BILLING_TEST_OWNED', process.env['BILLING_TEST_OWNED']],
      ['TSX_TSCONFIG_PATH', resolve(import.meta.dirname, '../../../tsconfig.spec.json')],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const child = fork(resolve(import.meta.dirname, '../../testing/billing-payments-process-worker.ts'), [], {
    execArgv: ['--import', 'tsx'],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child env deliberately excludes parsed API application variables.
    env: childEnvironment as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  trackChild(child);
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.send({ operation: 'recover', stripeUrl, limit: 100 });
  await waitFor(child, 'ready');
  return child;
};
const startAction = async (operation: 'confirm' | 'recover-action', userId: string, actionId: string) => {
  const childEnvironment = Object.fromEntries(
    [
      ['PATH', process.env['PATH']],
      ['HOME', process.env['HOME']],
      ['TMPDIR', process.env['TMPDIR']],
      ['BILLING_TEST_DATABASE_URL', databaseUrl],
      ['BILLING_TEST_OWNED', process.env['BILLING_TEST_OWNED']],
      ['TSX_TSCONFIG_PATH', resolve(import.meta.dirname, '../../../tsconfig.spec.json')],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const child = fork(resolve(import.meta.dirname, '../../testing/billing-payments-process-worker.ts'), [], {
    execArgv: ['--import', 'tsx'],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child env deliberately excludes parsed API application variables.
    env: childEnvironment as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  trackChild(child);
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.send({ operation, stripeUrl, userId, actionId });
  await waitFor(child, 'ready');
  return child;
};

const holdLegRow = async (legId: string) => {
  let unlock: (() => void) | undefined;
  let locked: (() => void) | undefined;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const transaction = adminClient.begin(async (tx) => {
    await tx`select id from billing.billing_provider_leg where id = ${legId} for update`;
    locked?.();
    await released;
  });
  await acquired;
  const release = (): void => {
    unlock?.();
    activeRowReleases.delete(release);
  };
  activeRowReleases.add(release);
  return { release, transaction };
};
const holdPurchaseRow = async (purchaseId: string) => {
  let unlock: (() => void) | undefined;
  let locked: (() => void) | undefined;
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const transaction = adminClient.begin(async (tx) => {
    await tx`select id from billing.billing_purchase where id = ${purchaseId} for update`;
    locked?.();
    await released;
  });
  await acquired;
  const release = (): void => {
    unlock?.();
    activeRowReleases.delete(release);
  };
  activeRowReleases.add(release);
  return { release, transaction };
};
const waitForLegLease = async (legId: string): Promise<void> => {
  /* oxlint-disable no-await-in-loop -- polling observes an externally committed child-process lease. */
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [leg] = await database
      .select()
      .from(schema.billingProviderLeg)
      .where(eq(schema.billingProviderLeg.id, legId));
    if (leg !== undefined && leg.nextAttemptAt.getTime() > Date.now()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  /* oxlint-enable no-await-in-loop */
  throw new Error('Timed out waiting for provider-leg claim');
};

const seedOwnerBinding = async () => {
  const suffix = randomUUID();
  const userId = `process-${suffix}`;
  await database
    .insert(schema.user)
    .values({ id: userId, name: 'Process recovery', email: `${suffix}@test.invalid`, emailVerified: true });
  const accountId = await ledger.ensureAccountBinding({ environment: 'development', authUserId: userId });
  const bindingId = randomUUID();
  customerSearchId = `cus_${suffix.replaceAll('-', '')}`;
  await database
    .insert(schema.billingStripeCustomer)
    .values({ id: bindingId, accountId, environment: 'development', stripeAccountId: 'acct_fixture', livemode: false });
  return { accountId, bindingId, userId, customerId: customerSearchId };
};

const seedCustomerLeg = async (state: 'dispatched' | 'known' = 'dispatched') => {
  const base = await seedOwnerBinding();
  const legId = randomUUID();
  await database.insert(schema.billingProviderLeg).values({
    id: legId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    kind: 'customer',
    requestId: `customer:${base.bindingId}`,
    requestHash: 'a'.repeat(64),
    request: { metadata: { tau_account_id: base.accountId, tau_customer_binding_id: base.bindingId } },
    idempotencyKey: `tau:${legId}`,
    state,
    providerObjectId: state === 'known' ? customerSearchId : null,
    dispatchStartedAt: new Date(),
    nextAttemptAt: new Date(0),
  });
  return { ...base, legId };
};

const expireLeg = async (legId: string): Promise<void> => {
  await database
    .update(schema.billingProviderLeg)
    .set({ nextAttemptAt: sql`transaction_timestamp() - interval '1 second'` })
    .where(eq(schema.billingProviderLeg.id, legId));
};

const seedPaidUnfulfilled = async () => {
  const base = await seedOwnerBinding();
  await database
    .update(schema.billingStripeCustomer)
    .set({ stripeCustomerId: base.customerId })
    .where(eq(schema.billingStripeCustomer.id, base.bindingId));
  const purchaseId = randomUUID();
  const legId = randomUUID();
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'process-policy',
    offerId: 'top-up',
    environment: 'development',
    accountId: base.accountId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '50000',
    creditAtoms: '5000000',
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_topup',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: null,
  };
  const evidence: PaidPaymentEvidence = {
    version: 'stripe-paid-v1',
    stripeAccountId: 'acct_fixture',
    livemode: false,
    customerId: customerSearchId,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    paymentIntentIds: ['pi_process_paid'],
    chargeIds: ['ch_process_paid'],
    invoiceId: null,
    subscriptionId: null,
    subscriptionItemId: null,
    sourceDigest: 'b'.repeat(64),
    paidAt: new Date().toISOString(),
    paymentMethod: null,
  };
  await database.insert(schema.billingPurchase).values({
    id: purchaseId,
    accountId: base.accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: offer,
    creditAtoms: 5_000_000n,
    state: 'paid_unfulfilled',
    customerBindingId: base.bindingId,
    requestId: randomUUID(),
    requestHash: 'c'.repeat(64),
    purpose: 'manual_checkout',
    stripeAccountId: 'acct_fixture',
    livemode: false,
    paidAt: new Date(evidence.paidAt),
    paidEvidence: evidence,
    paymentIntentId: 'pi_process_paid',
    chargeId: 'ch_process_paid',
  });
  await database.insert(schema.billingProviderLeg).values({
    id: legId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'checkout_payment',
    requestId: randomUUID(),
    requestHash: 'd'.repeat(64),
    request: {
      mode: 'payment',
      customer: customerSearchId,
      client_reference_id: purchaseId,
      success_url: 'http://127.0.0.1:3000/settings',
      cancel_url: 'http://127.0.0.1:3000/settings',
      line_items: [{ price_data: { currency: 'usd', product: 'prod_topup', unit_amount: 500 }, quantity: 1 }],
    },
    idempotencyKey: `tau:${legId}`,
    state: 'known',
    providerObjectId: 'cs_process_paid',
    dispatchStartedAt: new Date(),
    nextAttemptAt: new Date(0),
  });
  sourcePayment = {
    purchaseId,
    legId,
    bindingId: base.bindingId,
    paymentIntentId: 'pi_process_paid',
    chargeId: 'ch_process_paid',
  };
  return { ...base, purchaseId, legId };
};

const seedSucceededWithoutEvent = async () => {
  const base = await seedOwnerBinding();
  await database
    .update(schema.billingStripeCustomer)
    .set({ stripeCustomerId: base.customerId })
    .where(eq(schema.billingStripeCustomer.id, base.bindingId));
  const purchaseId = randomUUID();
  const legId = randomUUID();
  const paymentIntentId = `pi_${randomUUID().replaceAll('-', '')}`;
  const chargeId = `ch_${randomUUID().replaceAll('-', '')}`;
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'process-policy',
    offerId: 'top-up',
    environment: 'development',
    accountId: base.accountId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '50000',
    creditAtoms: '5000000',
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_topup',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: { id: 'pm_process', brand: 'visa', last4: '4242' },
  };
  await database.insert(schema.billingPurchase).values({
    id: purchaseId,
    accountId: base.accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: offer,
    creditAtoms: 5_000_000n,
    state: 'pending',
    customerBindingId: base.bindingId,
    requestId: randomUUID(),
    requestHash: 'e'.repeat(64),
    purpose: 'manual_saved_card',
    stripeAccountId: 'acct_fixture',
    livemode: false,
  });
  await database.insert(schema.billingProviderLeg).values({
    id: legId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'payment_intent',
    requestId: randomUUID(),
    requestHash: 'f'.repeat(64),
    request: {
      amount: 500,
      currency: 'usd',
      customer: base.customerId,
      payment_method: 'pm_process',
      confirm: true,
      metadata: { tau_purchase_id: purchaseId, tau_provider_leg_id: legId, tau_customer_binding_id: base.bindingId },
    },
    idempotencyKey: `tau:${legId}`,
    state: 'known',
    providerObjectId: paymentIntentId,
    dispatchStartedAt: new Date(),
    nextAttemptAt: new Date(0),
  });
  sourcePayment = { purchaseId, legId, bindingId: base.bindingId, paymentIntentId, chargeId };
  return { ...base, purchaseId, legId, paymentIntentId, chargeId };
};

const seedPersistedReplacement = async () => {
  const base = await seedOwnerBinding();
  await database
    .update(schema.billingStripeCustomer)
    .set({ stripeCustomerId: base.customerId })
    .where(eq(schema.billingStripeCustomer.id, base.bindingId));
  const purchaseId = randomUUID();
  const originalId = randomUUID();
  const replacementId = randomUUID();
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'process-policy',
    offerId: 'top-up',
    environment: 'development',
    accountId: base.accountId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '50000',
    creditAtoms: '5000000',
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_topup',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: { id: 'pm_old', brand: 'visa', last4: '4242' },
  };
  await database.insert(schema.billingPurchase).values({
    id: purchaseId,
    accountId: base.accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: offer,
    creditAtoms: 5_000_000n,
    state: 'creating',
    customerBindingId: base.bindingId,
    requestId: randomUUID(),
    requestHash: '1'.repeat(64),
    purpose: 'manual_saved_card',
    returnPath: '/settings/billing',
    stripeAccountId: 'acct_fixture',
    livemode: false,
  });
  const noChargeEvidence: NoChargeEvidence = {
    version: 'stripe-no-charge-v1',
    status: 'canceled',
    paymentIntentId: 'pi_old',
    customerId: customerSearchId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    amountReceived: '0',
    amountCapturable: '0',
    chargeId: null,
    amountCaptured: '0',
    sourceDigest: '2'.repeat(64),
    observedAt: new Date().toISOString(),
  };
  await database.insert(schema.billingProviderLeg).values({
    id: originalId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'payment_intent',
    requestId: randomUUID(),
    requestHash: '3'.repeat(64),
    request: { amount: 500, currency: 'usd', customer: customerSearchId, payment_method: 'pm_old', confirm: true },
    idempotencyKey: `tau:${originalId}`,
    state: 'no_charge',
    providerObjectId: 'pi_old',
    dispatchStartedAt: new Date(),
    cancellationRequestedAt: new Date(),
    cancellationConfirmedAt: new Date(),
    noChargeEvidence,
  });
  const request = {
    mode: 'payment',
    customer: customerSearchId,
    client_reference_id: purchaseId,
    success_url: 'http://127.0.0.1:3000/settings',
    cancel_url: 'http://127.0.0.1:3000/settings',
    line_items: [{ price_data: { currency: 'usd', product: 'prod_topup', unit_amount: 500 }, quantity: 1 }],
    metadata: {
      tau_purchase_id: purchaseId,
      tau_provider_leg_id: replacementId,
      tau_customer_binding_id: base.bindingId,
    },
    payment_intent_data: {
      metadata: {
        tau_purchase_id: purchaseId,
        tau_provider_leg_id: replacementId,
        tau_customer_binding_id: base.bindingId,
      },
    },
  };
  await database.insert(schema.billingProviderLeg).values({
    id: replacementId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'checkout_payment',
    requestId: randomUUID(),
    requestHash: '4'.repeat(64),
    request,
    idempotencyKey: `tau:${replacementId}`,
    state: 'dispatched',
    dispatchStartedAt: new Date(),
    nextAttemptAt: new Date(0),
  });
  checkoutRecovery = { id: 'cs_process_replacement', purchaseId };
  return { purchaseId, replacementId };
};

const seedAttentionManual = async () => {
  const base = await seedOwnerBinding();
  await database
    .update(schema.billingStripeCustomer)
    .set({ stripeCustomerId: base.customerId })
    .where(eq(schema.billingStripeCustomer.id, base.bindingId));
  const purchaseId = randomUUID();
  const legId = randomUUID();
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'process-policy',
    offerId: 'top-up',
    environment: 'development',
    accountId: base.accountId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '50000',
    creditAtoms: '5000000',
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_topup',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: { id: 'pm_old', brand: 'visa', last4: '4242' },
  };
  await database.insert(schema.billingPurchase).values({
    id: purchaseId,
    accountId: base.accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: offer,
    creditAtoms: 5_000_000n,
    state: 'attention',
    customerBindingId: base.bindingId,
    requestId: randomUUID(),
    requestHash: '5'.repeat(64),
    purpose: 'manual_saved_card',
    returnPath: '/settings/billing',
    stripeAccountId: 'acct_fixture',
    livemode: false,
  });
  await database.insert(schema.billingProviderLeg).values({
    id: legId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'payment_intent',
    requestId: randomUUID(),
    requestHash: '6'.repeat(64),
    request: {
      amount: 500,
      currency: 'usd',
      customer: customerSearchId,
      payment_method: 'pm_old',
      confirm: true,
      metadata: { tau_purchase_id: purchaseId, tau_provider_leg_id: legId, tau_customer_binding_id: base.bindingId },
    },
    idempotencyKey: `tau:${legId}`,
    state: 'attention',
    providerObjectId: 'pi_process_cancel',
    dispatchStartedAt: new Date(),
    errorCode: 'authentication_required',
    nextAttemptAt: new Date(Date.now() + 3_600_000),
  });
  cancelPayment = { purchaseId, legId, bindingId: base.bindingId };
  return { ...base, purchaseId, legId };
};

const seedPreparedManual = async () => {
  const base = await seedOwnerBinding();
  await database
    .update(schema.billingStripeCustomer)
    .set({ stripeCustomerId: base.customerId })
    .where(eq(schema.billingStripeCustomer.id, base.bindingId));
  const purchaseId = randomUUID();
  const legId = randomUUID();
  const offer: PaymentOfferSnapshot = {
    version: 'payment-offer-v1',
    policyId: 'process-policy',
    offerId: 'top-up',
    environment: 'development',
    accountId: base.accountId,
    stripeAccountId: 'acct_fixture',
    livemode: false,
    currency: 'usd',
    principalMinor: '500',
    taxMinor: '0',
    grossMinor: '500',
    maximumGrossMinor: '50000',
    creditAtoms: '5000000',
    ceilingCreditAtoms: null,
    stripePriceId: null,
    stripeProductId: 'prod_topup',
    quantity: 1,
    term: 'one_time',
    taxBasis: 'synthetic_local_zero_tax',
    paymentMethod: { id: 'pm_old', brand: 'visa', last4: '4242' },
  };
  await database.insert(schema.billingPurchase).values({
    id: purchaseId,
    accountId: base.accountId,
    sourceIdentity: `purchase:${purchaseId}`,
    offerSnapshot: offer,
    creditAtoms: 5_000_000n,
    state: 'prepared',
    customerBindingId: base.bindingId,
    requestId: randomUUID(),
    requestHash: '8'.repeat(64),
    purpose: 'manual_saved_card',
    returnPath: '/settings/billing',
    stripeAccountId: 'acct_fixture',
    livemode: false,
  });
  await database.insert(schema.billingProviderLeg).values({
    id: legId,
    accountId: base.accountId,
    environment: 'development',
    customerBindingId: base.bindingId,
    purchaseId,
    kind: 'payment_intent',
    requestId: randomUUID(),
    requestHash: '9'.repeat(64),
    request: {
      amount: 500,
      currency: 'usd',
      customer: base.customerId,
      payment_method: 'pm_old',
      confirm: true,
      metadata: { tau_purchase_id: purchaseId, tau_provider_leg_id: legId, tau_customer_binding_id: base.bindingId },
    },
    idempotencyKey: `tau:${legId}`,
    state: 'prepared',
    nextAttemptAt: new Date(0),
  });
  createdPayment = { purchaseId, legId, bindingId: base.bindingId };
  return { ...base, purchaseId, legId };
};

beforeAll(async () => {
  stripeFixture.listen(0, '127.0.0.1');
  await once(stripeFixture, 'listening');
  const address = stripeFixture.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Stripe process fixture address unavailable');
  }
  stripeUrl = `http://127.0.0.1:${address.port}/`;
  await seedBillingFixturePolicy({
    database,
    activationId: `process-${randomUUID()}`,
    policy: {
      schemaVersion: 1,
      environment: 'development',
      policyVersion: `process-${randomUUID()}`,
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

afterEach(() => {
  releaseSearch?.();
  releaseSearch = undefined;
  holdNextSearch = false;
  for (const release of activeRowReleases) {
    release();
  }
});

afterAll(async () => {
  await Promise.all([...children].map(async (child) => kill(child)));
  await Promise.all([adminClient.end(), runtimeClient.end()]);
  await new Promise<void>((resolve, reject) => {
    stripeFixture.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
});

describe('billing payment process recovery foundation', () => {
  it('recovers one accepted PaymentIntent POST after its response is lost before local identity persistence', async () => {
    const fixture = await seedPreparedManual();
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const responded = new Promise<void>((resolve) => {
      searchResponded = resolve;
    });
    const interrupted = await startAction('confirm', fixture.userId, fixture.purchaseId);
    await arrived;
    const rowLock = await holdLegRow(fixture.legId);
    releaseSearch?.();
    releaseSearch = undefined;
    await responded;
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    await expireLeg(fixture.legId);
    const recovered = await startRecovery();
    const recovery = await waitFor(recovered, 'complete');
    const [leg] = await database
      .select()
      .from(schema.billingProviderLeg)
      .where(eq(schema.billingProviderLeg.id, fixture.legId));
    const [purchase] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, fixture.purchaseId));
    expect({
      recovery: recovery.detail,
      leg: { state: leg?.state, providerObjectId: leg?.providerObjectId, errorCode: leg?.errorCode },
    }).toMatchObject({ leg: { state: 'known', providerObjectId: 'pi_process_created', errorCode: null } });
    expect(purchase).toMatchObject({ state: 'pending', paidAt: null, paidEvidence: null, receiptId: null });
    expect(requests.filter((item) => item === 'POST /v1/payment_intents')).toHaveLength(1);
    createdPayment = undefined;
  });

  it('recovers an accepted create by durable correlation without another provider POST', async () => {
    const fixture = await seedCustomerLeg();
    const beforePosts = requests.filter((item) => item.startsWith('POST ')).length;
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const responded = new Promise<void>((resolve) => {
      searchResponded = resolve;
    });
    const interrupted = await startRecovery();
    await arrived;
    const rowLock = await holdLegRow(fixture.legId);
    releaseSearch?.();
    releaseSearch = undefined;
    await responded;
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    await expireLeg(fixture.legId);
    const child = await startRecovery();
    await waitFor(child, 'complete');
    const [binding] = await database
      .select()
      .from(schema.billingStripeCustomer)
      .where(eq(schema.billingStripeCustomer.id, fixture.bindingId));
    expect(binding?.stripeCustomerId).toBe(customerSearchId);
    expect(requests.filter((item) => item.startsWith('POST '))).toHaveLength(beforePosts);
  });

  it('resumes a known leg before its local Customer linkage without a create POST', async () => {
    const fixture = await seedCustomerLeg('known');
    const beforePosts = requests.filter((item) => item.startsWith('POST ')).length;
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const responded = new Promise<void>((resolve) => {
      searchResponded = resolve;
    });
    const interrupted = await startRecovery();
    await arrived;
    const rowLock = await holdLegRow(fixture.legId);
    releaseSearch?.();
    releaseSearch = undefined;
    await responded;
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    await expireLeg(fixture.legId);
    const child = await startRecovery();
    await waitFor(child, 'complete');
    const [binding] = await database
      .select()
      .from(schema.billingStripeCustomer)
      .where(eq(schema.billingStripeCustomer.id, fixture.bindingId));
    expect(binding?.stripeCustomerId).toBe(customerSearchId);
    expect(requests.filter((item) => item.startsWith('POST '))).toHaveLength(beforePosts);
  });

  it('fences a suspended stale process after a second process reclaims its expired provider lease', async () => {
    const fixture = await seedCustomerLeg();
    customerSearchId = 'cus_stale_response';
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const stale = await startRecovery();
    await arrived;
    await expireLeg(fixture.legId);
    customerSearchId = 'cus_current_response';
    const current = await startRecovery();
    await waitFor(current, 'complete');
    releaseSearch?.();
    releaseSearch = undefined;
    await waitFor(stale, 'complete');
    const [binding] = await database
      .select()
      .from(schema.billingStripeCustomer)
      .where(eq(schema.billingStripeCustomer.id, fixture.bindingId));
    expect(binding?.stripeCustomerId).toBe('cus_current_response');
    const [leg] = await database
      .select()
      .from(schema.billingProviderLeg)
      .where(eq(schema.billingProviderLeg.id, fixture.legId));
    expect(leg?.state).toBe('known');
    customerSearchId = 'cus_process';
  });

  it('fulfills paid-unfulfilled after restart with authoritative cash reads, no new POST and only one receipt', async () => {
    const fixture = await seedPaidUnfulfilled();
    const before = requests.length;
    const rowLock = await holdPurchaseRow(fixture.purchaseId);
    const interrupted = await startRecovery();
    await waitForLegLease(fixture.legId);
    await expect
      .poll(async () => {
        const rows = await database.execute(sql`select id from billing.billing_stripe_source
          where environment = 'development' and stripe_account_id = 'acct_fixture' and livemode = false
            and source_type = 'cash_charge' and source_id = 'ch_process_paid'
            and state = 'processing' and lease_until > clock_timestamp()`);
        return rows.length;
      })
      .toBe(1);
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    await expireLeg(fixture.legId);
    const first = await startRecovery();
    await waitFor(first, 'complete');
    const [stillPending] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, fixture.purchaseId));
    expect(stillPending?.state).toBe('paid_unfulfilled');
    // The killed process owned both leases; a replacement must wait for both to expire.
    await database.execute(sql`update billing.billing_stripe_source
      set lease_until = clock_timestamp() - interval '1 second'
      where environment = 'development' and stripe_account_id = 'acct_fixture' and livemode = false
        and source_type = 'cash_charge' and source_id = 'ch_process_paid' and state = 'processing'`);
    await expireLeg(fixture.legId);
    const second = await startRecovery();
    await waitFor(second, 'complete');
    const [purchase] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, fixture.purchaseId));
    expect(purchase?.state).toBe('fulfilled');
    const receipts = await database.execute(
      sql`select count(*)::int as count from billing.credit_transaction where purchase_id = ${fixture.purchaseId}`,
    );
    expect(receipts[0]?.['count']).toBe(1);
    expect(requests.slice(before).length).toBeGreaterThan(0);
    expect(requests.slice(before).every((request) => request.startsWith('GET '))).toBe(true);
    sourcePayment = undefined;
  });

  it('does not invent paid acceptance from a succeeded provider object without a claimed event', async () => {
    const fixture = await seedSucceededWithoutEvent();
    const child = await startRecovery();
    await waitFor(child, 'complete');
    const [purchase] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, fixture.purchaseId));
    expect(purchase).toMatchObject({ state: 'pending', paidAt: null, paidEvidence: null, receiptId: null });
    const receipts = await database.execute(
      sql`select count(*)::int as count from billing.credit_transaction where purchase_id = ${fixture.purchaseId}`,
    );
    expect(receipts[0]?.['count']).toBe(0);
    sourcePayment = undefined;
  });

  it('fences a stale source and inbox claimant from monetary mutation after N+1 recovery', async () => {
    const fixture = await seedSucceededWithoutEvent();
    const sourceId = randomUUID();
    const inboxId = randomUUID();
    await database.insert(schema.billingStripeSource).values({
      id: sourceId,
      environment: 'development',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      sourceType: 'payment_intent',
      sourceId: fixture.paymentIntentId,
      nextAttemptAt: new Date(0),
    });
    await database.insert(schema.stripeEventInbox).values({
      id: inboxId,
      eventId: `evt_${inboxId}`,
      environment: 'development',
      stripeAccountId: 'acct_fixture',
      livemode: false,
      apiVersion: '2026-07-29.dahlia',
      eventType: 'payment_intent.succeeded',
      sourceType: 'payment_intent',
      sourceId: fixture.paymentIntentId,
      eventCreatedAt: new Date('2026-09-06T00:00:00.000Z'),
      payloadDigest: '7'.repeat(64),
      evidence: {},
      nextAttemptAt: new Date(0),
    });
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const stale = await startRecovery();
    await arrived;
    await database
      .update(schema.billingStripeSource)
      .set({
        leaseUntil: sql`transaction_timestamp() - interval '1 second'`,
        nextAttemptAt: sql`transaction_timestamp() - interval '1 second'`,
      })
      .where(eq(schema.billingStripeSource.id, sourceId));
    await database
      .update(schema.stripeEventInbox)
      .set({
        leaseUntil: sql`transaction_timestamp() - interval '1 second'`,
        nextAttemptAt: sql`transaction_timestamp() - interval '1 second'`,
      })
      .where(eq(schema.stripeEventInbox.id, inboxId));
    const current = await startRecovery();
    await waitFor(current, 'complete');
    releaseSearch?.();
    releaseSearch = undefined;
    await waitFor(stale, 'complete');
    const [source] = await database
      .select()
      .from(schema.billingStripeSource)
      .where(eq(schema.billingStripeSource.id, sourceId));
    const [inbox] = await database
      .select()
      .from(schema.stripeEventInbox)
      .where(eq(schema.stripeEventInbox.id, inboxId));
    const [purchase] = await database
      .select()
      .from(schema.billingPurchase)
      .where(eq(schema.billingPurchase.id, fixture.purchaseId));
    expect(source).toMatchObject({ generation: 2n, state: 'done', errorCode: null });
    expect(inbox).toMatchObject({ claimGeneration: 2n, state: 'done', errorCode: null });
    expect(purchase).toMatchObject({
      state: 'fulfilled',
      paymentIntentId: fixture.paymentIntentId,
      chargeId: fixture.chargeId,
    });
    expect(purchase?.paidAt).toEqual(new Date('2026-09-06T00:00:00.000Z'));
    const receipts = await database.execute(
      sql`select count(*)::int as count from billing.credit_transaction where purchase_id = ${fixture.purchaseId}`,
    );
    expect(receipts[0]?.['count']).toBe(1);
    sourcePayment = undefined;
  });

  it('recovers a durable hosted replacement after a process boundary without canceling or posting twice', async () => {
    const fixture = await seedPersistedReplacement();
    const beforePosts = requests.filter((item) => item.startsWith('POST ')).length;
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const responded = new Promise<void>((resolve) => {
      searchResponded = resolve;
    });
    const interrupted = await startRecovery();
    await arrived;
    const rowLock = await holdLegRow(fixture.replacementId);
    releaseSearch?.();
    releaseSearch = undefined;
    await responded;
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    await expireLeg(fixture.replacementId);
    const child = await startRecovery();
    const recovery = await waitFor(child, 'complete');
    const [leg] = await database
      .select()
      .from(schema.billingProviderLeg)
      .where(eq(schema.billingProviderLeg.id, fixture.replacementId));
    expect({
      recovery: recovery.detail,
      leg: {
        state: leg?.state,
        providerObjectId: leg?.providerObjectId,
        redirectUrl: leg?.redirectUrl,
        errorCode: leg?.errorCode,
      },
    }).toMatchObject({
      leg: {
        state: 'known',
        providerObjectId: 'cs_process_replacement',
        redirectUrl: 'https://checkout.stripe.test/process',
        errorCode: null,
      },
    });
    expect(requests.filter((item) => item.startsWith('POST '))).toHaveLength(beforePosts);
    checkoutRecovery = undefined;
  });

  it('recovers after cancellation succeeds before no-charge persistence and creates one hosted replacement', async () => {
    const fixture = await seedAttentionManual();
    holdNextSearch = true;
    const arrived = new Promise<void>((resolve) => {
      searchArrived = resolve;
    });
    const responded = new Promise<void>((resolve) => {
      searchResponded = resolve;
    });
    const interrupted = await startAction('recover-action', fixture.userId, fixture.purchaseId);
    await arrived;
    const rowLock = await holdLegRow(fixture.legId);
    releaseSearch?.();
    releaseSearch = undefined;
    await responded;
    await kill(interrupted);
    rowLock.release();
    await rowLock.transaction;
    const recovered = await startAction('recover-action', fixture.userId, fixture.purchaseId);
    const recovery = await waitFor(recovered, 'complete');
    const legs = await database
      .select()
      .from(schema.billingProviderLeg)
      .where(eq(schema.billingProviderLeg.purchaseId, fixture.purchaseId));
    const original = legs.find((leg) => leg.id === fixture.legId);
    expect({
      recovery: recovery.detail,
      original: { state: original?.state, errorCode: original?.errorCode },
    }).toMatchObject({ original: { state: 'no_charge', errorCode: null } });
    expect(original?.cancellationConfirmedAt).toBeInstanceOf(Date);
    expect(original?.noChargeEvidence).not.toBeNull();
    expect(legs.filter((leg) => leg.kind === 'checkout_payment')).toHaveLength(1);
    expect(
      requests.filter((item) => item.startsWith('POST /v1/payment_intents/pi_process_cancel/cancel')),
    ).toHaveLength(1);
    expect(requests.filter((item) => item.startsWith('POST /v1/checkout/sessions'))).toHaveLength(1);
    cancelPayment = undefined;
  });
});
