/* eslint-disable @typescript-eslint/naming-convention -- Loopback fixtures preserve exact Stripe field names. */
import { paymentOfferSnapshotSchema } from '#api/billing/billing-payment-contract.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '#database/schema.js';
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { recoverAndCancelStripeClosure } from '#api/billing/billing-account-closure-stripe.js';
import { createBillingStripeClient } from '#api/billing/billing-stripe.js';
import { seedPaidPurchase } from '#testing/billing-payment.fixture.js';

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
