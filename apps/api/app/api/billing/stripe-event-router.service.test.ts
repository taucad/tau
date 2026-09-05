import { describe, expect, it } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type Stripe from 'stripe';
import type { ConfigService } from '@nestjs/config';
import { StripeEventRouter } from '#api/billing/stripe-event-router.service.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { BillingService } from '#api/billing/billing.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import type { RedisService } from '#redis/redis.service.js';
import type { EmailService } from '#email/email.service.js';
import type { Environment } from '#config/environment.config.js';

const proPriceId = 'price_pro_live';

type Harness = {
  router: StripeEventRouter;
  creditLedgerService: ReturnType<typeof mock<CreditLedgerService>>;
  billingService: ReturnType<typeof mock<BillingService>>;
  databaseService: ReturnType<typeof mockDeep<DatabaseService>>;
  metricsService: ReturnType<typeof mockDeep<MetricsService>>;
  redisService: ReturnType<typeof mockDeep<RedisService>>;
  emailService: ReturnType<typeof mock<EmailService>>;
};

const createRouter = (options: { userId?: string; subscriptionRow?: { id: string; plan: string } } = {}): Harness => {
  const databaseService = mockDeep<DatabaseService>();
  databaseService.database.query.user.findFirst.mockResolvedValue(
    (options.userId === undefined ? undefined : { id: options.userId, email: 'dunned@test.invalid' }) as never,
  );
  databaseService.database.query.subscription.findFirst.mockResolvedValue(
    (options.subscriptionRow === undefined
      ? undefined
      : { ...options.subscriptionRow, referenceId: options.userId ?? 'user_1' }) as never,
  );
  databaseService.database.query.subscriptionExtension.findFirst.mockResolvedValue(undefined as never);

  const creditLedgerService = mock<CreditLedgerService>();
  creditLedgerService.grantMonthly.mockResolvedValue(true);
  creditLedgerService.topup.mockResolvedValue(true);
  creditLedgerService.refundTopup.mockResolvedValue(true);
  creditLedgerService.getAccount.mockResolvedValue({
    grantBalanceMicro: 0n,
    topupBalanceMicro: 0n,
    reservedMicro: 0n,
    monthlyGrantMicro: 0n,
    rolloverCeilingMicro: 0n,
    balanceMicro: 0n,
  });

  const billingService = mock<BillingService>();
  billingService.invalidateEntitlements.mockResolvedValue(undefined);

  const configService = mock<ConfigService<Environment, true>>();
  configService.get.mockImplementation(((key: string) =>
    key === 'STRIPE_PRICE_ID_PRO_MONTHLY' ? proPriceId : '') as never);

  const metricsService = mockDeep<MetricsService>();
  const redisService = mockDeep<RedisService>();
  redisService.client.set.mockResolvedValue('OK' as never);
  const emailService = mock<EmailService>();
  const router = new StripeEventRouter(
    databaseService,
    creditLedgerService,
    billingService,
    configService,
    metricsService,
    redisService,
    emailService,
  );
  return { router, creditLedgerService, billingService, databaseService, metricsService, redisService, emailService };
};

const invoicePaidEvent = (overrides: { billingReason: string; priceId?: string; eventId?: string }): Stripe.Event =>
  ({
    id: overrides.eventId ?? 'evt_1',
    type: 'invoice.paid',
    data: {
      object: {
        object: 'invoice',
        customer: 'cus_1',
        billing_reason: overrides.billingReason,
        lines: { data: overrides.priceId === undefined ? [] : [{ price: { id: overrides.priceId } }] },
      },
    },
  }) as unknown as Stripe.Event;

const checkoutCompletedEvent = (overrides: {
  mode: string;
  kind?: string;
  amountTotal?: number;
  tauUserId?: string;
}): Stripe.Event =>
  ({
    id: 'evt_topup_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        object: 'checkout.session',
        id: 'cs_1',
        mode: overrides.mode,
        customer: 'cus_1',
        amount_total: overrides.amountTotal ?? 2500,
        metadata: {
          ...(overrides.kind === undefined ? {} : { kind: overrides.kind }),
          ...(overrides.tauUserId === undefined ? {} : { tauUserId: overrides.tauUserId }),
        },
      },
    },
  }) as unknown as Stripe.Event;

const paymentIntentSucceededEvent = (overrides: {
  kind?: string;
  amountReceived?: number;
  tauUserId?: string;
}): Stripe.Event =>
  ({
    id: 'evt_pi_topup_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        object: 'payment_intent',
        id: 'pi_1',
        customer: 'cus_1',
        amount_received: overrides.amountReceived ?? 2500,
        metadata: {
          ...(overrides.kind === undefined ? {} : { kind: overrides.kind }),
          ...(overrides.tauUserId === undefined ? {} : { tauUserId: overrides.tauUserId }),
        },
      },
    },
  }) as unknown as Stripe.Event;

describe('StripeEventRouter invoice.paid', () => {
  it('should grant the pro allotment when the invoice bills the pro price (S2 initial subscribe)', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(invoicePaidEvent({ billingReason: 'subscription_create', priceId: proPriceId }));

    expect(creditLedgerService.grantMonthly).toHaveBeenCalledWith({
      userId: 'user_1',
      monthlyGrantMicro: 20_000_000n,
      rolloverCeilingMicro: 40_000_000n,
      stripeEventId: 'evt_1',
    });
  });

  it('should grant on cycle renewals keyed by the event id (S3/S9 idempotency delegation)', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(
      invoicePaidEvent({ billingReason: 'subscription_cycle', priceId: proPriceId, eventId: 'evt_cycle_9' }),
    );

    expect(creditLedgerService.grantMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ stripeEventId: 'evt_cycle_9' }),
    );
  });

  it('should ignore invoices with non-grant billing reasons', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(invoicePaidEvent({ billingReason: 'manual', priceId: proPriceId }));

    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
  });

  it('should no-op when the customer has no linked Tau user (S10 out-of-order)', async () => {
    const { router, creditLedgerService } = createRouter({});

    await router.dispatch(invoicePaidEvent({ billingReason: 'subscription_cycle', priceId: proPriceId }));

    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
  });

  it('should skip the grant when no plan is resolvable from price or subscription row', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(invoicePaidEvent({ billingReason: 'subscription_cycle', priceId: 'price_unknown' }));

    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
  });
});

describe('StripeEventRouter checkout.session.completed', () => {
  it('should settle a credit-topup at exactly 10,000 µ$ per cent (S42)', async () => {
    const { router, creditLedgerService, billingService } = createRouter({ userId: 'user_1' });

    await router.dispatch(checkoutCompletedEvent({ mode: 'payment', kind: 'credit-topup', amountTotal: 2500 }));

    expect(creditLedgerService.topup).toHaveBeenCalledWith({
      userId: 'user_1',
      amountMicro: 25_000_000n,
      stripeEventId: 'evt_topup_1',
    });
    expect(billingService.invalidateEntitlements).toHaveBeenCalledWith('user_1');
  });

  it('should prefer the tauUserId metadata over customer lookup', async () => {
    const { router, creditLedgerService } = createRouter({});

    await router.dispatch(checkoutCompletedEvent({ mode: 'payment', kind: 'credit-topup', tauUserId: 'user_meta' }));

    expect(creditLedgerService.topup).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_meta' }));
  });

  it('should ignore subscription-mode sessions (plugin-owned)', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(checkoutCompletedEvent({ mode: 'subscription', kind: 'credit-topup' }));

    expect(creditLedgerService.topup).not.toHaveBeenCalled();
  });

  it('should ignore payment sessions without the credit-topup marker', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(checkoutCompletedEvent({ mode: 'payment' }));

    expect(creditLedgerService.topup).not.toHaveBeenCalled();
  });
});

describe('StripeEventRouter payment_intent.succeeded (Fix B direct charge)', () => {
  it('should settle a credit-topup PaymentIntent at exactly 10,000 µ$ per cent', async () => {
    const { router, creditLedgerService, billingService } = createRouter({ userId: 'user_1' });

    await router.dispatch(paymentIntentSucceededEvent({ kind: 'credit-topup', amountReceived: 2500 }));

    expect(creditLedgerService.topup).toHaveBeenCalledWith({
      userId: 'user_1',
      amountMicro: 25_000_000n,
      // Keyed on the PaymentIntent, not the event — the top-up endpoint credits
      // the same key inline and cannot see an event id at charge time.
      stripeEventId: 'pi:pi_1',
    });
    expect(billingService.invalidateEntitlements).toHaveBeenCalledWith('user_1');
  });

  it('should prefer the tauUserId metadata over customer lookup', async () => {
    const { router, creditLedgerService } = createRouter({});

    await router.dispatch(paymentIntentSucceededEvent({ kind: 'credit-topup', tauUserId: 'user_meta' }));

    expect(creditLedgerService.topup).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_meta' }));
  });

  it('should ignore PaymentIntents without the credit-topup marker — no double-credit for Checkout PIs', async () => {
    const { router, creditLedgerService } = createRouter({ userId: 'user_1' });

    await router.dispatch(paymentIntentSucceededEvent({}));

    expect(creditLedgerService.topup).not.toHaveBeenCalled();
  });
});

describe('StripeEventRouter charge.refunded', () => {
  it('should claw back the refunded amount and refresh entitlements (S45)', async () => {
    const { router, creditLedgerService, billingService } = createRouter({ userId: 'user_1' });
    const event = {
      id: 'evt_refund_1',
      type: 'charge.refunded',
      data: { object: { object: 'charge', id: 'ch_1', customer: 'cus_1', amount_refunded: 500 } },
    } as unknown as Stripe.Event;

    await router.dispatch(event);

    expect(creditLedgerService.refundTopup).toHaveBeenCalledWith({
      userId: 'user_1',
      amountMicro: 5_000_000n,
      stripeEventId: 'evt_refund_1',
      note: 'charge-refunded:ch_1',
    });
    expect(billingService.invalidateEntitlements).toHaveBeenCalledWith('user_1');
  });
});

describe('StripeEventRouter unknown events', () => {
  it('should keep the grace path and send exactly one dunning email per event (B9)', async () => {
    const { router, billingService, emailService, redisService } = createRouter({ userId: 'user_1' });
    const event = {
      id: 'evt_pf_1',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_pf_1', customer: 'cus_1' } },
    } as unknown as Stripe.Event;

    await router.dispatch(event);

    expect(billingService.invalidateEntitlements).toHaveBeenCalledWith('user_1');
    expect(emailService.sendPaymentFailed).toHaveBeenCalledTimes(1);
    // TAU_FRONTEND_URL is '' in this harness — the deep link is root-relative.
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith({
      email: 'dunned@test.invalid',
      billingUrl: '/?settings=billing',
    });

    // Redis NX marker already claimed: the retried delivery must not re-send.
    // oxlint-disable-next-line typescript/no-unsafe-call -- DeepMockProxy collapses ioredis's overloaded `set` member to any
    redisService.client.set.mockResolvedValue(null as never);
    await router.dispatch(event);
    expect(emailService.sendPaymentFailed).toHaveBeenCalledTimes(1);
  });

  it('should never fail the webhook over a dunning email error (B9)', async () => {
    const { router, emailService } = createRouter({ userId: 'user_1' });
    // oxlint-disable-next-line typescript/no-unsafe-call -- vitest-mock-extended collapses the promise-returning member to any here
    emailService.sendPaymentFailed.mockRejectedValue(new Error('resend down'));
    const event = {
      id: 'evt_pf_2',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_pf_2', customer: 'cus_1' } },
    } as unknown as Stripe.Event;

    await expect(router.dispatch(event)).resolves.toBeUndefined();
  });

  it('should no-op on unhandled event types without throwing (S61)', async () => {
    const { router, creditLedgerService, billingService } = createRouter({ userId: 'user_1' });
    const event = { id: 'evt_x', type: 'payment_method.attached', data: { object: {} } } as unknown as Stripe.Event;

    await expect(router.dispatch(event)).resolves.toBeUndefined();
    expect(creditLedgerService.grantMonthly).not.toHaveBeenCalled();
    expect(creditLedgerService.topup).not.toHaveBeenCalled();
    expect(billingService.invalidateEntitlements).not.toHaveBeenCalled();
  });
});
