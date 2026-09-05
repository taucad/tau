import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { BillingTestApp } from '#testing/create-billing-test-app.js';
import { createBillingTestApp } from '#testing/create-billing-test-app.js';
import { creditTransaction, user } from '#database/schema.js';

/**
 * L2 offline-signed webhook suite (plan todos 25, scenarios S58–S61 + S9/S10):
 * real HTTP POSTs through the Fastify raw-body carve-out into the Better Auth
 * stripe plugin's signature verification and the first-party fan-out — signed
 * locally with `stripe.webhooks.generateTestHeaderString`, so it runs on every
 * PR with zero Stripe credentials. Needs DATABASE_URL + REDIS_URL (dev/CI).
 */
// ConfigModule.forRoot snapshots process.env when the test-app module is
// imported, so the env pins MUST run before imports — vi.hoisted does exactly
// that (the createBillingTestApp `env` option alone is too late).
const { webhookSecret, proPriceId } = vi.hoisted(() => {
  const hoistedWebhookSecret = 'whsec_l2_offline_test_secret';
  const hoistedProPriceId = 'price_l2_pro_monthly';
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ProcessEnv is augmented with the POST-validation Environment shape; hoisted test bootstrap writes the raw pre-validation env
  const rawEnv = process.env as unknown as Record<string, string | undefined>;
  rawEnv['STRIPE_WEBHOOK_SECRET'] = hoistedWebhookSecret;
  rawEnv['STRIPE_PRICE_ID_PRO_MONTHLY'] = hoistedProPriceId;
  return { webhookSecret: hoistedWebhookSecret, proPriceId: hoistedProPriceId };
});

// Offline signer only — never performs network calls.
const stripe = new Stripe('sk_test_dummy_signer');

const testUserId = generatePrefixedId(idPrefix.user);
const testCustomerId = `cus_l2_${Date.now()}`;

let testApp: BillingTestApp;

const invoicePaidPayload = (eventId: string): string =>
  JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'invoice.paid',
    api_version: '2026-03-25',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `in_${eventId}`,
        object: 'invoice',
        customer: testCustomerId,
        billing_reason: 'subscription_create',
        lines: { object: 'list', data: [{ id: 'il_1', object: 'line_item', price: { id: proPriceId } }] },
      },
    },
  });

const unknownEventPayload = (eventId: string): string =>
  JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'product.created',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'prod_x', object: 'product' } },
  });

const topupSessionCompletedPayload = (eventId: string, amountCents: number): string =>
  JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_${eventId}`,
        object: 'checkout.session',
        mode: 'payment',
        customer: testCustomerId,
        amount_total: amountCents,
        metadata: { kind: 'credit-topup', tauUserId: testUserId, tauTopupCents: String(amountCents) },
      },
    },
  });

/**
 * The direct-charge counterpart of `topupSessionCompletedPayload`. Field names
 * differ from Checkout: the router reads `amount_received` (not `amount_total`)
 * and indexes `metadata` without optional chaining, so it must be present.
 */
const paymentIntentSucceededPayload = (eventId: string, paymentIntentId: string, amountCents: number): string =>
  JSON.stringify({
    id: eventId,
    object: 'event',
    type: 'payment_intent.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        customer: testCustomerId,
        amount_received: amountCents,
        metadata: { kind: 'credit-topup', tauUserId: testUserId, tauTopupCents: String(amountCents) },
      },
    },
  });

const postWebhook = async (
  payload: string,
  options: { signature?: string } = {},
): Promise<{ status: number; body: string }> => {
  const signature = options.signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const response = await fetch(`${testApp.baseUrl}/v1/auth/stripe/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });
  return { status: response.status, body: await response.text() };
};

const grantRowsForUser = async (): Promise<Array<{ deltaMicro: bigint; stripeEventId: string | undefined }>> => {
  const rows = await testApp.databaseService.database
    .select({ deltaMicro: creditTransaction.deltaMicro, stripeEventId: creditTransaction.stripeEventId })
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, testUserId));
  return rows.map((row) => ({ deltaMicro: row.deltaMicro, stripeEventId: row.stripeEventId ?? undefined }));
};

describe('billing webhook signature + settlement (L2, offline-signed)', () => {
  beforeAll(async () => {
    testApp = await createBillingTestApp({
      env: {
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        STRIPE_PRICE_ID_PRO_MONTHLY: proPriceId,
      },
    });
    // Seed the customer linkage the fan-out resolves grants through.
    await testApp.databaseService.database.insert(user).values({
      id: testUserId,
      name: 'L2 Webhook User',
      email: `l2-webhook-${Date.now()}@test.invalid`,
      stripeCustomerId: testCustomerId,
    });
  }, 60_000);

  afterAll(async () => {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup must tolerate a failed beforeAll leaving testApp unassigned
    if (testApp !== undefined) {
      // Cascades credit_transaction/credit_account rows.
      await testApp.databaseService.database.delete(user).where(eq(user.id, testUserId));
      await testApp.close();
    }
  });

  it('should verify a valid signature over the byte-exact raw body and grant exactly once (S58/S2)', async () => {
    const eventId = `evt_l2_valid_${Date.now()}`;

    const response = await postWebhook(invoicePaidPayload(eventId));

    expect(response.status, response.body).toBeGreaterThanOrEqual(200);
    expect(response.status, response.body).toBeLessThan(300);
    const rows = await grantRowsForUser();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deltaMicro: 20_000_000n, stripeEventId: eventId });
  });

  it('should treat a duplicate delivery of the same event as a no-op (S9)', async () => {
    const rowsBefore = await grantRowsForUser();
    const firstEventId = rowsBefore[0]?.stripeEventId;
    if (firstEventId === undefined) {
      throw new Error('expected the S58 grant to precede the duplicate-delivery case');
    }

    const response = await postWebhook(invoicePaidPayload(firstEventId));

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(await grantRowsForUser()).toHaveLength(rowsBefore.length);
  });

  it('should reject a tampered payload with zero side effects (S59)', async () => {
    const eventId = `evt_l2_tampered_${Date.now()}`;
    const payload = invoicePaidPayload(eventId);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const tampered = payload.replace('subscription_create', 'subscription_cycle!');

    const response = await postWebhook(tampered, { signature });

    expect(response.status).toBeGreaterThanOrEqual(400);
    const rows = await grantRowsForUser();
    expect(rows.some((row) => row.stripeEventId === eventId)).toBe(false);
  });

  it('should reject a signature with a stale timestamp (S60 replay defence)', async () => {
    const eventId = `evt_l2_stale_${Date.now()}`;
    const payload = invoicePaidPayload(eventId);
    const staleSignature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });

    const response = await postWebhook(payload, { signature: staleSignature });

    expect(response.status).toBeGreaterThanOrEqual(400);
    const rows = await grantRowsForUser();
    expect(rows.some((row) => row.stripeEventId === eventId)).toBe(false);
  });

  it('should acknowledge unknown event types so Stripe stops retrying (S61)', async () => {
    const response = await postWebhook(unknownEventPayload(`evt_l2_unknown_${Date.now()}`));

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });

  it('should settle a credit-topup checkout exactly once across duplicate deliveries (S42-L2/BA14)', async () => {
    const eventId = `evt_l2_topup_${Date.now()}`;
    const payload = topupSessionCompletedPayload(eventId, 2500);

    const first = await postWebhook(payload);
    const duplicate = await postWebhook(payload);

    expect(first.status, first.body).toBeGreaterThanOrEqual(200);
    expect(first.status, first.body).toBeLessThan(300);
    expect(duplicate.status).toBeGreaterThanOrEqual(200);
    expect(duplicate.status).toBeLessThan(300);
    const rows = await grantRowsForUser();
    const topupRows = rows.filter((row) => row.stripeEventId === eventId);
    expect(topupRows).toHaveLength(1);
    // $25.00 = 2500 cents × 10,000 µ$/cent (S42 conversion).
    expect(topupRows[0]?.deltaMicro).toBe(25_000_000n);
  });

  it('should credit an inline-settled top-up exactly once when its webhook also arrives', async () => {
    // The top-up endpoint credits the moment the saved-card charge succeeds;
    // the webhook then arrives for the same PaymentIntent. Both writers key on
    // `pi:{id}`, so the second must hit the unique index and roll back whole.
    const paymentIntentId = `pi_l2_inline_${Date.now()}`;
    const sharedKey = `pi:${paymentIntentId}`;
    const eventId = `evt_l2_inline_${Date.now()}`;

    await testApp.creditLedgerService.topup({
      userId: testUserId,
      amountMicro: 25_000_000n,
      stripeEventId: sharedKey,
    });
    const webhook = await postWebhook(paymentIntentSucceededPayload(eventId, paymentIntentId, 2500));

    expect(webhook.status, webhook.body).toBeGreaterThanOrEqual(200);
    expect(webhook.status, webhook.body).toBeLessThan(300);
    const rows = await grantRowsForUser();
    const settledRows = rows.filter((row) => row.stripeEventId === sharedKey);
    expect(settledRows).toHaveLength(1);
    expect(settledRows[0]?.deltaMicro).toBe(25_000_000n);
    // Filtering on the shared key alone would pass even if the handler regressed
    // to `event.id` — that regression shows up as an extra row under `evt_…`.
    expect(rows.some((row) => row.stripeEventId === eventId)).toBe(false);
  });

  it('should credit exactly once when the inline credit and its webhook race', async () => {
    // The sequential test above proves the index; this proves the interleaving
    // the ledger's transaction comment promises — whichever writer loses, its
    // balance change rolls back with its journal insert.
    const paymentIntentId = `pi_l2_race_${Date.now()}`;
    const sharedKey = `pi:${paymentIntentId}`;

    const [, webhook] = await Promise.all([
      testApp.creditLedgerService.topup({
        userId: testUserId,
        amountMicro: 25_000_000n,
        stripeEventId: sharedKey,
      }),
      postWebhook(paymentIntentSucceededPayload(`evt_l2_race_${Date.now()}`, paymentIntentId, 2500)),
    ]);

    expect(webhook.status, webhook.body).toBeGreaterThanOrEqual(200);
    expect(webhook.status, webhook.body).toBeLessThan(300);
    const rows = await grantRowsForUser();
    const settledRows = rows.filter((row) => row.stripeEventId === sharedKey);
    expect(settledRows).toHaveLength(1);
    expect(settledRows[0]?.deltaMicro).toBe(25_000_000n);
  });

  it('should not lose a money-in write when two different-key writers race an account into existence', async () => {
    // `FOR UPDATE` on zero rows locks nothing — before `lockAccount`, a new
    // subscriber's first grant racing their first top-up both computed from
    // zero and the conflict-update loser overwrote the winner. Different keys,
    // so the journal's unique index never fires; only the balance is wrong.
    // A handful of fresh users keeps the pre-fix failure probability high.
    const attempt = async (index: number): Promise<void> => {
      const raceUserId = generatePrefixedId(idPrefix.user);
      await testApp.databaseService.database.insert(user).values({
        id: raceUserId,
        name: 'L2 Race User',
        email: `l2-race-${Date.now()}-${index}@test.invalid`,
      });
      try {
        await Promise.all([
          testApp.creditLedgerService.grantMonthly({
            userId: raceUserId,
            monthlyGrantMicro: 20_000_000n,
            rolloverCeilingMicro: 40_000_000n,
            stripeEventId: `evt_l2_race_grant_${Date.now()}_${index}`,
          }),
          testApp.creditLedgerService.topup({
            userId: raceUserId,
            amountMicro: 25_000_000n,
            stripeEventId: `pi:pi_l2_race_first_${Date.now()}_${index}`,
          }),
        ]);

        const account = await testApp.creditLedgerService.getAccount(raceUserId);
        expect(account.balanceMicro).toBe(45_000_000n);
        const rows = await testApp.databaseService.database
          .select({ deltaMicro: creditTransaction.deltaMicro })
          .from(creditTransaction)
          .where(eq(creditTransaction.userId, raceUserId));
        expect(rows).toHaveLength(2);
      } finally {
        await testApp.databaseService.database.delete(user).where(eq(user.id, raceUserId));
      }
    };
    await Promise.all(Array.from({ length: 5 }, async (_, index) => attempt(index)));
  });

  it('should settle a direct-charge top-up from its webhook when the inline credit never ran', async () => {
    // The safety net: the API died between charging and crediting, so the
    // webhook is the only writer and must settle for real.
    const paymentIntentId = `pi_l2_crash_${Date.now()}`;

    const webhook = await postWebhook(
      paymentIntentSucceededPayload(`evt_l2_crash_${Date.now()}`, paymentIntentId, 2500),
    );

    expect(webhook.status, webhook.body).toBeGreaterThanOrEqual(200);
    expect(webhook.status, webhook.body).toBeLessThan(300);
    const rows = await grantRowsForUser();
    const settledRows = rows.filter((row) => row.stripeEventId === `pi:${paymentIntentId}`);
    expect(settledRows).toHaveLength(1);
    expect(settledRows[0]?.deltaMicro).toBe(25_000_000n);
  });

  it('should no-op gracefully on events for unlinked customers (S10 out-of-order)', async () => {
    const eventId = `evt_l2_orphan_${Date.now()}`;
    const payload = invoicePaidPayload(eventId).replace(testCustomerId, 'cus_never_linked');

    const response = await postWebhook(payload);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    const rows = await grantRowsForUser();
    expect(rows.some((row) => row.stripeEventId === eventId)).toBe(false);
  });
});
