import IORedisMock from 'ioredis-mock';
import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import Stripe from 'stripe';
import type { ConfigService } from '@nestjs/config';
import { ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { BillingController } from '#api/billing/billing.controller.js';
import { topupRequestSchema } from '#api/billing/billing.dto.js';
import type { TopupRequestDto } from '#api/billing/billing.dto.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import type { Environment } from '#config/environment.config.js';
import type { AuthUser } from '#auth/auth.type.js';

const verifiedUser = {
  id: 'user_topup',
  email: 'buyer@tau.new',
  name: 'Buyer',
  emailVerified: true,
} as unknown as AuthUser;

type Harness = {
  controller: BillingController;
  stripe: ReturnType<typeof mockDeep<Stripe>>;
  databaseService: ReturnType<typeof mockDeep<DatabaseService>>;
  creditLedgerService: ReturnType<typeof mock<CreditLedgerService>>;
};

const createController = async (
  options: { stripeCustomerId?: string; configured?: boolean } = {},
): Promise<Harness> => {
  const billingService = mock<BillingService>();
  const creditLedgerService = mock<CreditLedgerService>();
  // The fast path credits inline, then reads the settled balance back.
  creditLedgerService.topup.mockResolvedValue(true);
  creditLedgerService.getAccount.mockResolvedValue({
    grantBalanceMicro: 0n,
    topupBalanceMicro: 25_000_000n,
    reservedMicro: 0n,
    monthlyGrantMicro: 0n,
    rolloverCeilingMicro: 0n,
    balanceMicro: 25_000_000n,
  });
  const databaseService = mockDeep<DatabaseService>();
  databaseService.database.query.user.findFirst.mockResolvedValue({
    stripeCustomerId: options.stripeCustomerId ?? null,
  } as never);
  // Drizzle fluent chains are not fabricated by mockDeep — stub update().set().where().
  const updateChain = { set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) };
  databaseService.database.update.mockReturnValue(updateChain as never);

  const redis = new IORedisMock() as unknown as Redis;
  await redis.flushall();
  const redisService = { client: redis } as unknown as RedisService;

  const environment: Record<string, string> = {
    STRIPE_SECRET_KEY: options.configured === false ? '' : 'sk_test_x',
    STRIPE_PRODUCT_ID_CREDIT_PACK: options.configured === false ? '' : 'prod_credit_pack',
    TAU_FRONTEND_URL: 'http://localhost:3000',
  };
  const configService = mock<ConfigService<Environment, true>>();
  configService.get.mockImplementation(((key: string) => environment[key] ?? '') as never);

  const stripe = mockDeep<Stripe>();
  stripe.checkout.sessions.create.mockResolvedValue({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  } as never);
  stripe.customers.create.mockResolvedValue({ id: 'cus_new_1' } as never);
  // No saved card on file by default → the fast path yields to hosted Checkout.
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: {} } as never);
  stripe.paymentMethods.list.mockResolvedValue({ data: [] } as never);
  // Echo the requested amount back as `amount_received` — the controller credits
  // what Stripe actually took, not what the client asked for.
  stripe.paymentIntents.create.mockImplementation((async (parameters: Stripe.PaymentIntentCreateParams) => ({
    id: 'pi_topup_1',
    status: 'succeeded',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
    amount_received: parameters.amount,
  })) as never);

  const controller = new BillingController(
    billingService,
    creditLedgerService,
    databaseService,
    redisService,
    configService,
    stripe,
  );
  return { controller, stripe, databaseService, creditLedgerService };
};

const topupBody = (amountCents: number): TopupRequestDto => ({ amountCents }) as unknown as TopupRequestDto;

describe('topupRequestSchema (S41)', () => {
  it.each([500, 1000, 2500, 5000, 10_000, 50_000])('should accept the %i-cent denomination', (amountCents) => {
    expect(topupRequestSchema.safeParse({ amountCents }).success).toBe(true);
  });

  it.each([
    ['below the $5 floor', 499],
    ['above the $500 ceiling', 50_001],
    ['a non-integer amount', 2500.5],
    ['a negative amount', -500],
    ['zero', 0],
  ])('should reject %s', (_label, amountCents) => {
    expect(topupRequestSchema.safeParse({ amountCents }).success).toBe(false);
  });

  it('should accept a UUID idempotency key and reject anything else (trust boundary)', () => {
    const valid = { amountCents: 2500, idempotencyKey: 'e58ce1f0-98e5-4b53-a4e6-7d1e5b3f2a10' };
    expect(topupRequestSchema.safeParse(valid).success).toBe(true);
    // Non-UUID shapes never reach Stripe's idempotency layer.
    expect(topupRequestSchema.safeParse({ amountCents: 2500, idempotencyKey: 'topup:evil' }).success).toBe(false);
  });
});

describe('BillingController.createTopupSession', () => {
  it('should mint a hosted-redirect payment session with credit-topup metadata for an existing customer', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    expect(result).toStrictEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        customer: 'cus_existing',
        // No `returnUrl` in the body → sanitiser returns `/`, so the redirect
        // lands on the frontend root with the settlement marker.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        success_url: 'http://localhost:3000/?topup=success',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        cancel_url: 'http://localhost:3000/',
        metadata: { kind: 'credit-topup', tauUserId: 'user_topup', tauTopupCents: '2500' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        payment_intent_data: { setup_future_usage: 'on_session' },
        // Returning customers' saved cards (incl. subscription-saved `limited` ones) are shown.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        saved_payment_method_options: { allow_redisplay_filters: ['always', 'limited', 'unspecified'] },
      }),
    );
    // The embedded `ui_mode` field is gone (hosted is the default surface).
    expect(stripe.checkout.sessions.create.mock.calls[0]?.[0]).not.toHaveProperty('ui_mode');
  });

  it.each([
    ['an off-origin returnUrl', 'https://evil.test/phish', 'http://localhost:3000/?topup=success'],
    [
      'a same-origin project path',
      'http://localhost:3000/projects/abc',
      'http://localhost:3000/projects/abc?topup=success',
    ],
    ['a relative path', '/projects/xyz?tab=chat', 'http://localhost:3000/projects/xyz?tab=chat&topup=success'],
  ])(
    'should build a same-origin success_url from %s (S41 open-redirect guard)',
    async (_label, returnUrl, expectedSuccessUrl) => {
      const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });

      await controller.createTopupSession(
        verifiedUser,
        { amountCents: 500, returnUrl } as unknown as TopupRequestDto,
        '203.0.113.7',
      );

      expect(stripe.checkout.sessions.create.mock.calls[0]?.[0]?.success_url).toBe(expectedSuccessUrl);
    },
  );

  it('should charge the saved card in-app and skip Checkout when one is on file (Fix B fast path)', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // The shared resolver reads the card off the expanded default PM.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    expect(result).toStrictEqual({ status: 'succeeded', balanceMicro: '25000000' });
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500,
        customer: 'cus_existing',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        payment_method: 'pm_saved',
        confirm: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
        error_on_requires_action: true,
        metadata: { kind: 'credit-topup', tauUserId: 'user_topup', tauTopupCents: '2500' },
      }),
      // No idempotency key in the body → no request options forwarded.
      undefined,
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('should credit the ledger inline under the shared pi: key using the amount Stripe took', async () => {
    const { controller, stripe, creditLedgerService } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);

    // Deliberately *not* the requested 2500: the credit must follow Stripe's
    // `amount_received`, so a controller crediting `body.amountCents` fails here.
    stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_topup_1',
      status: 'succeeded',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      amount_received: 2400,
    } as never);

    await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // The key must match `handlePaymentIntentSucceeded` exactly — that shared
    // key is what stops the webhook double-crediting the same top-up.
    expect(creditLedgerService.topup).toHaveBeenCalledWith({
      userId: 'user_topup',
      amountMicro: 24_000_000n,
      stripeEventId: 'pi:pi_topup_1',
    });
  });

  it('should not journal a credit when the charged payment intent received nothing', async () => {
    const { controller, stripe, creditLedgerService } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    stripe.paymentIntents.create.mockResolvedValue({
      id: 'pi_topup_zero',
      status: 'succeeded',
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      amount_received: 0,
    } as never);

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // A zero-delta row would claim the shared `pi:` key and leave the webhook
    // with nothing left to settle, so the guard must skip the write entirely.
    expect(creditLedgerService.topup).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ status: 'succeeded' });
  });

  it('should still report success when the inline credit throws, since the card was already charged', async () => {
    const { controller, stripe, creditLedgerService } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    creditLedgerService.topup.mockRejectedValue(new Error('ledger unavailable'));

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // No balance to report, but never an error — the buyer's money is gone and
    // the webhook will settle it. Failing here would invite a second payment.
    expect(result).toStrictEqual({ status: 'succeeded' });
    expect(creditLedgerService.topup).toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('should surface an ambiguous charge failure instead of offering a second payment path', async () => {
    const { controller, stripe, creditLedgerService } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    // The response was lost — the charge may have succeeded on Stripe's side.
    stripe.paymentIntents.create.mockRejectedValue(new Stripe.errors.StripeConnectionError({ message: 'timeout' }));

    await expect(controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7')).rejects.toThrow(
      'TOPUP_CHARGE_UNCONFIRMED',
    );

    // Minting a Checkout session here is the double-charge: the buyer would
    // complete it on top of a charge that may already have gone through.
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(creditLedgerService.topup).not.toHaveBeenCalled();
  });

  it('should still fall back to Checkout on a definite decline', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    stripe.paymentIntents.create.mockRejectedValue(
      new Stripe.errors.StripeCardError({ message: 'card declined', type: 'card_error' }),
    );

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // Stripe processed and refused — no charge happened, Checkout is safe.
    expect(result).toStrictEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  });

  it('should forward a user-scoped idempotency key to the charge, and none without one', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    const key = 'e58ce1f0-98e5-4b53-a4e6-7d1e5b3f2a10';

    await controller.createTopupSession(
      verifiedUser,
      { amountCents: 2500, idempotencyKey: key } as unknown as TopupRequestDto,
      '203.0.113.7',
    );
    await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // Scoped per user so one buyer's key can never collide with another's.
    expect(stripe.paymentIntents.create.mock.calls[0]?.[1]).toStrictEqual({
      idempotencyKey: `topup:user_topup:${key}`,
    });
    expect(stripe.paymentIntents.create.mock.calls[1]?.[1]).toBeUndefined();
  });

  it('should still report success when only the balance read-back throws', async () => {
    const { controller, stripe, creditLedgerService } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    creditLedgerService.getAccount.mockRejectedValue(new Error('replica lagging'));

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    // The credit committed — only the read-back failed, so the client degrades
    // to "will update shortly" rather than losing a durable top-up to a 500.
    expect(creditLedgerService.topup).toHaveBeenCalled();
    expect(result).toStrictEqual({ status: 'succeeded' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('should fall back to Checkout with the saved card unused when the charge needs authentication (Fix B)', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // The shared resolver reads the card off the expanded default PM.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    stripe.paymentIntents.create.mockRejectedValue(
      new Stripe.errors.StripeCardError({ message: 'authentication required', type: 'card_error' }),
    );

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    expect('url' in result).toBe(true);
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it('should fall back to Checkout when the direct charge does not reach succeeded (Fix B)', async () => {
    const { controller, stripe } = await createController({ stripeCustomerId: 'cus_existing' });
    stripe.customers.retrieve.mockResolvedValue({
      // The shared resolver reads the card off the expanded default PM.
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
      invoice_settings: { default_payment_method: { id: 'pm_saved', card: { brand: 'visa', last4: '4242' } } },
    } as never);
    stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_x', status: 'requires_payment_method' } as never);

    const result = await controller.createTopupSession(verifiedUser, topupBody(2500), '203.0.113.7');

    expect('url' in result).toBe(true);
  });

  it('should create the Stripe customer lazily at first top-up (S1 deviation 8)', async () => {
    const { controller, stripe, databaseService } = await createController();

    await controller.createTopupSession(verifiedUser, topupBody(500), '203.0.113.7');

    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'buyer@tau.new', metadata: { userId: 'user_topup' } }),
    );
    expect(databaseService.database.update).toHaveBeenCalled();
  });

  it('should reject unverified emails before any Stripe call (S44/Q38)', async () => {
    const { controller, stripe } = await createController();
    const unverified = { ...verifiedUser, emailVerified: false } as unknown as AuthUser;

    await expect(controller.createTopupSession(unverified, topupBody(500), '203.0.113.7')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('should fail closed when Stripe env is not configured', async () => {
    const { controller } = await createController({ configured: false });

    await expect(controller.createTopupSession(verifiedUser, topupBody(500), '203.0.113.7')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('should 429 the 11th session for one user inside the hour window (S43)', async () => {
    const { controller } = await createController({ stripeCustomerId: 'cus_existing' });
    for (let call = 0; call < 10; call += 1) {
      // oxlint-disable-next-line no-await-in-loop -- slots consume sequentially by design
      await controller.createTopupSession(verifiedUser, topupBody(500), `198.51.100.${call}`);
    }

    const eleventh = controller.createTopupSession(verifiedUser, topupBody(500), '198.51.100.99');

    await expect(eleventh).rejects.toBeInstanceOf(HttpException);
    await expect(eleventh.catch((error: unknown) => (error as HttpException).getStatus())).resolves.toBe(429);
  });

  it('should 429 the 21st session from one IP across users (S43)', async () => {
    const { controller } = await createController({ stripeCustomerId: 'cus_existing' });
    for (let call = 0; call < 20; call += 1) {
      const caller = { ...verifiedUser, id: `user_ip_${call}` } as unknown as AuthUser;
      // oxlint-disable-next-line no-await-in-loop -- slots consume sequentially by design
      await controller.createTopupSession(caller, topupBody(500), '198.51.100.200');
    }
    const overflowCaller = { ...verifiedUser, id: 'user_ip_final' } as unknown as AuthUser;

    await expect(
      controller.createTopupSession(overflowCaller, topupBody(500), '198.51.100.200'),
    ).rejects.toBeInstanceOf(HttpException);
  });
});
