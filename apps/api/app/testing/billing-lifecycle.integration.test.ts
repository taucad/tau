import { execSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { BillingTestApp } from '#testing/create-billing-test-app.js';
import { createBillingTestApp } from '#testing/create-billing-test-app.js';
import { creditTransaction, subscription, user } from '#database/schema.js';

/**
 * L3 Stripe test-mode lifecycle suite (plan todos 24/26, scenarios S1–S6 + BA13):
 * real Stripe objects driven by the SDK on a Test Clock, with the Stripe CLI's
 * `stripe listen` forwarding the REAL webhook stream into the app under test.
 *
 * Requirements (skipped cleanly otherwise): `STRIPE_SECRET_KEY` (TEST-mode)
 * in the environment + the `stripe` CLI on PATH. Runs serially — Stripe
 * test-mode rate limits and a shared account make parallelism a hazard.
 *
 * Bootstrapping order matters: ConfigModule snapshots process.env at import
 * time, so the webhook signing secret and the Pro price id are minted
 * SYNCHRONOUSLY in vi.hoisted (CLI calls) before any app module loads.
 */
type L3Bootstrap =
  | { enabled: false; reason: string }
  | { enabled: true; secretKey: string; webhookSecret: string; productId: string; priceId: string };

const l3 = vi.hoisted((): L3Bootstrap => {
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ProcessEnv is augmented with the POST-validation Environment shape; hoisted test bootstrap reads the raw pre-validation env
  const rawEnv = process.env as unknown as Record<string, string | undefined>;
  const secretKey = rawEnv['STRIPE_SECRET_KEY'] ?? '';
  if (secretKey === '' || !secretKey.includes('_test_')) {
    return { enabled: false, reason: 'STRIPE_SECRET_KEY (test-mode) not set' };
  }

  const cli = (args: string): string => {
    return execSync(`stripe ${args} --api-key ${secretKey}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };

  try {
    execSync('stripe --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return { enabled: false, reason: 'stripe CLI not on PATH' };
  }

  try {
    // The CLI listen secret is stable per account+device, so it can be read
    // before the forwarding process starts.
    const webhookSecret = cli('listen --print-secret').trim();
    const product = JSON.parse(
      cli('products create --name "Tau L3 Lifecycle Pro" -d "billing-lifecycle test product"'),
    ) as {
      id: string;
    };
    const price = JSON.parse(
      cli(`prices create --unit-amount 2000 --currency usd -d "recurring[interval]"=month --product ${product.id}`),
    ) as { id: string };

    rawEnv['STRIPE_WEBHOOK_SECRET'] = webhookSecret;
    rawEnv['STRIPE_PRICE_ID_PRO_MONTHLY'] = price.id;

    return { enabled: true, secretKey, webhookSecret, productId: product.id, priceId: price.id };
  } catch (error) {
    return { enabled: false, reason: `stripe CLI bootstrap failed: ${String(error)}` };
  }
});

const testUserId = generatePrefixedId(idPrefix.user);

let testApp: BillingTestApp;
let stripeSdk: Stripe;
let listenProcess: ChildProcess | undefined;
let customerId: string;
let testClockId: string;

/** Polls until the probe returns a value, for webhook-settlement waits. */
const awaitSettled = async <T>(probe: () => Promise<T | undefined>, timeoutMs = 60_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- sequential polling is the semantics here
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('awaitSettled timed out');
    }
    // oxlint-disable-next-line no-await-in-loop -- paced retry delay between probes
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
};

const grantRows = async (): Promise<Array<{ deltaMicro: bigint; reason: string }>> => {
  return testApp.databaseService.database
    .select({ deltaMicro: creditTransaction.deltaMicro, reason: creditTransaction.reason })
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, testUserId));
};

const subscriptionRows = async (): Promise<
  Array<{ plan: string; status: string; cancelAtPeriodEnd: boolean | undefined }>
> => {
  const rows = await testApp.databaseService.database
    .select({
      plan: subscription.plan,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.referenceId, testUserId));
  return rows.map((row) => ({
    plan: row.plan,
    status: row.status,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? undefined,
  }));
};

describe.skipIf(!l3.enabled)('billing subscription lifecycle (L3, Stripe test mode + CLI forwarding)', () => {
  beforeAll(async () => {
    if (!l3.enabled) {
      return;
    }
    testApp = await createBillingTestApp();
    stripeSdk = new Stripe(l3.secretKey);

    // Forward the account's event stream into the app under test.
    listenProcess = spawn(
      'stripe',
      [
        'listen',
        '--api-key',
        l3.secretKey,
        '--skip-update',
        '--forward-to',
        `${testApp.baseUrl}/v1/auth/stripe/webhook`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise<void>((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        reject(new Error('stripe listen did not become ready'));
      }, 30_000);
      listenProcess?.stderr?.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        if (new TextDecoder().decode(chunk).includes('Ready!')) {
          clearTimeout(readyTimeout);
          resolve();
        }
      });
      listenProcess?.on('error', reject);
    });

    // Lazy-customer semantics (BA13/S1, blueprint deviation 8): the user row is
    // born WITHOUT a Stripe customer; one is attached at first billing action.
    await testApp.databaseService.database.insert(user).values({
      id: testUserId,
      name: 'L3 Lifecycle User',
      email: `l3-lifecycle-${Date.now()}@test.invalid`,
    });

    const clock = await stripeSdk.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: 'tau-billing-lifecycle',
    });
    testClockId = clock.id;

    const customer = await stripeSdk.customers.create({
      email: `l3-lifecycle-${Date.now()}@test.invalid`,
      test_clock: testClockId,
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });
    customerId = customer.id;
    await testApp.databaseService.database
      .update(user)
      .set({ stripeCustomerId: customerId })
      .where(eq(user.id, testUserId));
  }, 120_000);

  afterAll(async () => {
    listenProcess?.kill('SIGTERM');
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup must tolerate a failed beforeAll leaving testClockId unassigned
    if (l3.enabled && testClockId !== undefined) {
      // Deleting the clock tears down its customers/subscriptions server-side.
      await new Stripe(l3.secretKey).testHelpers.testClocks.del(testClockId).catch(() => undefined);
      await new Stripe(l3.secretKey).products.update(l3.productId, { active: false }).catch(() => undefined);
    }
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- cleanup must tolerate a failed beforeAll leaving testApp unassigned
    if (testApp !== undefined) {
      await testApp.databaseService.database.delete(user).where(eq(user.id, testUserId));
      await testApp.close();
    }
  }, 120_000);

  it('should mirror the subscription and grant the initial allotment exactly once (S1/S2/BA13)', async () => {
    if (!l3.enabled) {
      return;
    }
    await stripeSdk.subscriptions.create({
      customer: customerId,
      items: [{ price: l3.priceId }],
    });

    const mirrored = await awaitSettled(async () => {
      const rows = await subscriptionRows();
      return rows.find((row) => row.status === 'active');
    }, 120_000);
    expect(mirrored.plan).toBe('pro');

    const grants = await awaitSettled(async () => {
      const rows = await grantRows();
      return rows.length > 0 ? rows : undefined;
    }, 120_000);
    // Exactly ONE grant despite subscription.created + invoice.paid both arriving.
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ deltaMicro: 20_000_000n, reason: 'monthly_grant' });
  });

  it('should grant the renewal on a test-clock cycle with the rollover ceiling applied (S3/S4)', async () => {
    if (!l3.enabled) {
      return;
    }
    const clock = await stripeSdk.testHelpers.testClocks.retrieve(testClockId);
    await stripeSdk.testHelpers.testClocks.advance(testClockId, {
      frozen_time: clock.frozen_time + 32 * 24 * 60 * 60,
    });

    const grants = await awaitSettled(async () => {
      const rows = await grantRows();
      return rows.length >= 2 ? rows : undefined;
    }, 240_000);

    expect(grants).toHaveLength(2);
    // Untouched first-month balance rolls into the 2x ceiling: the second
    // grant's delta is the full monthly amount (20 + 20 == 40 == ceiling).
    expect(grants.every((row) => row.deltaMicro === 20_000_000n)).toBe(true);
  }, 300_000);

  it('should mirror cancel-at-period-end and preserve credits on deletion (S5/S6)', async () => {
    if (!l3.enabled) {
      return;
    }
    const subscriptions = await stripeSdk.subscriptions.list({ customer: customerId, status: 'active' });
    const active = subscriptions.data[0];
    if (active === undefined) {
      throw new Error('expected an active subscription from the prior test');
    }

    await stripeSdk.subscriptions.update(active.id, { cancel_at_period_end: true });
    await awaitSettled(async () => {
      const rows = await subscriptionRows();
      return rows.find((row) => row.cancelAtPeriodEnd === true);
    }, 120_000);

    await stripeSdk.subscriptions.cancel(active.id);
    const canceled = await awaitSettled(async () => {
      const rows = await subscriptionRows();
      return rows.find((row) => row.status === 'canceled');
    }, 120_000);
    expect(canceled).toBeDefined();

    // Credits survive cancellation (AD7): both grants remain journaled.
    expect(await grantRows()).toHaveLength(2);
  }, 300_000);

  it('should enter past_due on a failed renewal and keep Pro through the dunning grace (S8/B9)', async () => {
    if (!l3.enabled) {
      return;
    }
    // Fresh subscription (the S5/S6 case canceled the first one) that renews
    // against a card whose charges always fail.
    await stripeSdk.subscriptions.create({ customer: customerId, items: [{ price: l3.priceId }] });
    await awaitSettled(async () => {
      const rows = await subscriptionRows();
      return rows.find((row) => row.status === 'active');
    }, 120_000);

    const failingCard = await stripeSdk.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: customerId });
    await stripeSdk.customers.update(customerId, {
      invoice_settings: { default_payment_method: failingCard.id },
    });

    const clock = await stripeSdk.testHelpers.testClocks.retrieve(testClockId);
    await stripeSdk.testHelpers.testClocks.advance(testClockId, {
      frozen_time: clock.frozen_time + 32 * 24 * 60 * 60,
    });

    await awaitSettled(async () => {
      const rows = await subscriptionRows();
      return rows.find((row) => row.status === 'past_due');
    }, 240_000);

    // Grace window (7 days from the failed periodEnd): tier holds at pro while
    // the status surfaces past_due for the UI banners.
    await testApp.billingService.invalidateEntitlements(testUserId);
    const entitlements = await testApp.billingService.getEntitlements(testUserId);
    expect(entitlements.status).toBe('past_due');
    expect(entitlements.tier).toBe('pro');
  }, 420_000);

  it('should settle a trigger-built credit-topup checkout through the live forward (S42)', async () => {
    if (!l3.enabled) {
      return;
    }
    const rowsBefore = await grantRows();

    // The trigger mints a fixture session on a fixture customer — the router
    // resolves the account through the tauUserId metadata, exactly like a
    // session minted by POST /v1/billing/topup.
    execSync(
      [
        'stripe trigger checkout.session.completed',
        `--api-key ${l3.secretKey}`,
        '--add checkout_session:metadata[kind]=credit-topup',
        `--add checkout_session:metadata[tauUserId]=${testUserId}`,
      ].join(' '),
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const topupRow = await awaitSettled(async () => {
      const rows = await grantRows();
      if (rows.length <= rowsBefore.length) {
        return undefined;
      }
      return rows.find((row) => row.reason === 'topup');
    }, 180_000);
    // The fixture's amount is fixture-owned; the cents×10,000 conversion is
    // pinned by the L2 twin — here we prove the live pathway credits at all.
    expect(topupRow.deltaMicro > 0n).toBe(true);
  }, 240_000);

  it('should claw back an SDK-driven refund from the balance (S45)', async () => {
    if (!l3.enabled) {
      return;
    }
    const rowsBefore = await grantRows();
    const paymentIntent = await stripeSdk.paymentIntents.create({
      amount: 1000,
      currency: 'usd',
      customer: customerId,
      payment_method: 'pm_card_visa',
      confirm: true,
      off_session: true,
    });

    await stripeSdk.refunds.create({ payment_intent: paymentIntent.id });

    const clawback = await awaitSettled(async () => {
      const rows = await grantRows();
      if (rows.length <= rowsBefore.length) {
        return undefined;
      }
      return rows.find((row) => row.deltaMicro < 0n);
    }, 180_000);
    // $10.00 refunded = −10,000,000 µ$ clawed back (S45 exactness).
    expect(clawback.deltaMicro).toBe(-10_000_000n);
  }, 240_000);

  it('should flip hasPaymentMethod once a card lands on file (S47)', async () => {
    if (!l3.enabled) {
      return;
    }
    const cardlessUserId = generatePrefixedId(idPrefix.user);
    const cardlessCustomer = await stripeSdk.customers.create({
      email: `l3-cardless-${Date.now()}@test.invalid`,
    });
    await testApp.databaseService.database.insert(user).values({
      id: cardlessUserId,
      name: 'L3 Cardless User',
      email: `l3-cardless-${Date.now()}@test.invalid`,
      stripeCustomerId: cardlessCustomer.id,
    });

    try {
      const before = await testApp.billingService.getEntitlements(cardlessUserId);
      expect(before.hasPaymentMethod).toBe(false);

      await stripeSdk.paymentMethods.attach('pm_card_visa', { customer: cardlessCustomer.id });
      await testApp.billingService.invalidateEntitlements(cardlessUserId);

      const after = await testApp.billingService.getEntitlements(cardlessUserId);
      expect(after.hasPaymentMethod).toBe(true);
      // The same resolver surfaces the card's brand/last4 for the mini-checkout (R1).
      expect(after.paymentMethod).toMatchObject({ brand: 'visa' });
    } finally {
      await testApp.databaseService.database.delete(user).where(eq(user.id, cardlessUserId));
      await stripeSdk.customers.del(cardlessCustomer.id).catch(() => undefined);
    }
  }, 240_000);
});
