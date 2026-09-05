import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { AuthUser } from '#auth/auth.type.js';
import { BillingController } from '#api/billing/billing.controller.js';
import type { TopupRequestDto } from '#api/billing/billing.dto.js';
import type { BillingTestApp } from '#testing/create-billing-test-app.js';
import { createBillingTestApp } from '#testing/create-billing-test-app.js';
import { user } from '#database/schema.js';

/**
 * L3 regression for POST /v1/billing/topup: mints a REAL hosted-redirect
 * Checkout session against Stripe test mode. The controller unit test mocks
 * `stripe.checkout.sessions.create`, so a bad create payload passes the mock
 * yet 500s in production — this exercises the live API call so the params are
 * actually validated by Stripe and a real `session.url` is returned.
 *
 * Requires `STRIPE_SECRET_KEY` (test-mode); skips cleanly otherwise. Needs no
 * CLI/webhook/test-clock — minting a session is a pure SDK round-trip.
 */
// oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ProcessEnv is augmented with the POST-validation shape; this reads the raw pre-validation value
const secretKey = (process.env as unknown as Record<string, string | undefined>)['STRIPE_SECRET_KEY'] ?? '';
const enabled = secretKey.includes('_test_');

const testUserId = generatePrefixedId(idPrefix.user);
const testEmail = `l3-topup-${Date.now()}@test.invalid`;

let testApp: BillingTestApp;
let stripeSdk: Stripe;
let productId: string;
let customerId: string;

describe.skipIf(!enabled)('billing top-up session mint (L3, Stripe test mode)', () => {
  beforeAll(async () => {
    if (!enabled) {
      return;
    }
    stripeSdk = new Stripe(secretKey);
    const product = await stripeSdk.products.create({ name: 'Tau Top-up IT Credit Pack' });
    productId = product.id;

    // Inject the freshly-minted product id BEFORE the app compiles (ConfigModule
    // snapshots env at import), so the mint reads a product that exists here.
    testApp = await createBillingTestApp({ env: { STRIPE_PRODUCT_ID_CREDIT_PACK: productId } });

    const customer = await stripeSdk.customers.create({ email: testEmail });
    customerId = customer.id;
    await testApp.databaseService.database.insert(user).values({
      id: testUserId,
      name: 'L3 Top-up User',
      email: testEmail,
      stripeCustomerId: customerId,
    });
  }, 120_000);

  afterAll(async () => {
    if (testApp !== undefined) {
      await testApp.databaseService.database.delete(user).where(eq(user.id, testUserId));
      await testApp.close();
    }
    if (stripeSdk !== undefined) {
      await stripeSdk.products.update(productId, { active: false }).catch(() => undefined);
      await stripeSdk.customers.del(customerId).catch(() => undefined);
    }
  }, 120_000);

  it('should mint a live hosted Checkout redirect URL through the route handler (S41)', async () => {
    if (!enabled) {
      return;
    }
    const controller = testApp.app.get(BillingController);
    // ponytail: call the DI-resolved handler directly rather than staging a
    // Better Auth session — the reported 500 lives in the Stripe call, and this
    // drives it with the real injected client, DB customer, and Redis limiter.
    const authUser = { id: testUserId, email: testEmail, name: 'L3 Top-up User', emailVerified: true } as AuthUser;

    const result = await controller.createTopupSession(
      authUser,
      { amountCents: 500, returnUrl: 'http://localhost:3000/?settings=billing' } as TopupRequestDto,
      '203.0.113.7',
    );

    // This customer has no saved card, so the fast path yields to hosted Checkout.
    if (!('url' in result)) {
      throw new Error(`expected a hosted Checkout URL, got ${JSON.stringify(result)}`);
    }
    expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  }, 60_000);

  it('should charge a saved card in-app without a redirect (Fix B fast path)', async () => {
    if (!enabled) {
      return;
    }
    const controller = testApp.app.get(BillingController);
    const cardUserId = generatePrefixedId(idPrefix.user);
    const cardEmail = `l3-topup-card-${Date.now()}@test.invalid`;
    const cardCustomer = await stripeSdk.customers.create({ email: cardEmail });
    const paymentMethod = await stripeSdk.paymentMethods.attach('pm_card_visa', { customer: cardCustomer.id });
    await stripeSdk.customers.update(cardCustomer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id },
    });
    await testApp.databaseService.database.insert(user).values({
      id: cardUserId,
      name: 'L3 Top-up Card User',
      email: cardEmail,
      stripeCustomerId: cardCustomer.id,
    });

    try {
      const authUser = {
        id: cardUserId,
        email: cardEmail,
        name: 'L3 Top-up Card User',
        emailVerified: true,
      } as AuthUser;
      const result = await controller.createTopupSession(
        authUser,
        { amountCents: 500 } as TopupRequestDto,
        '203.0.113.8',
      );

      // A card is on file → the fast path charges it in-app AND credits inline,
      // no redirect. The user is brand new with no grant, so the settled balance
      // is exactly the top-up: 500 cents × 10,000 µ$/cent.
      expect(result).toStrictEqual({ status: 'succeeded', balanceMicro: '5000000' });
    } finally {
      await testApp.databaseService.database.delete(user).where(eq(user.id, cardUserId));
      await stripeSdk.customers.del(cardCustomer.id).catch(() => undefined);
    }
  }, 60_000);
});
