import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type Stripe from 'stripe';
import type { ConfigService } from '@nestjs/config';
import type * as NestCommon from '@nestjs/common';
import { serializeEntitlements } from '@taucad/billing';
import { BillingService } from '#api/billing/billing.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { RedisService } from '#redis/redis.service.js';
import type { Environment } from '#config/environment.config.js';
import type { subscription } from '#database/schema.js';

type SubscriptionRow = typeof subscription.$inferSelect;

const subscriptionRow = (overrides: Partial<SubscriptionRow>): SubscriptionRow => ({
  id: 'sub_1',
  plan: 'pro',
  referenceId: 'user_1',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_stripe_1',
  status: 'active',
  periodStart: new Date('2026-07-01T00:00:00Z'),
  periodEnd: new Date('2026-08-01T00:00:00Z'),
  trialStart: null,
  trialEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  seats: null,
  billingInterval: null,
  stripeScheduleId: null,
  ...overrides,
});

type Harness = {
  service: BillingService;
  databaseService: ReturnType<typeof mockDeep<DatabaseService>>;
  stripe: ReturnType<typeof mockDeep<Stripe>>;
};

const createService = (options: {
  rows: SubscriptionRow[];
  environment?: Partial<Pick<Environment, 'STRIPE_SECRET_KEY' | 'FREE_TIER_AI_ENABLED'>>;
  allowsAiTraining?: boolean;
  overrides?: Record<string, unknown>;
  stripeCustomerId?: string;
  configureStripe?: (stripe: ReturnType<typeof mockDeep<Stripe>>) => void;
}): Harness => {
  const databaseService = mockDeep<DatabaseService>();
  databaseService.database.query.user.findFirst.mockResolvedValue({
    allowsAiTraining: options.allowsAiTraining ?? false,
    stripeCustomerId: options.stripeCustomerId ?? null,
  } as never);
  databaseService.database.query.subscription.findMany.mockResolvedValue(options.rows as never);
  databaseService.database.query.subscriptionExtension.findFirst.mockResolvedValue(
    (options.overrides
      ? { subscriptionId: 'sub_1', overrides: options.overrides, updatedAt: new Date() }
      : undefined) as never,
  );

  const redisService = mockDeep<RedisService>();
  redisService.client.get.mockResolvedValue(null);
  redisService.client.set.mockResolvedValue('OK' as never);
  redisService.client.del.mockResolvedValue(1 as never);

  const environment: Record<string, unknown> = {
    STRIPE_SECRET_KEY: '',
    FREE_TIER_AI_ENABLED: true,
    ...options.environment,
  };
  const configService = mock<ConfigService<Environment, true>>();
  configService.get.mockImplementation(((key: string) => environment[key]) as never);

  const stripe = mockDeep<Stripe>();
  options.configureStripe?.(stripe);
  const service = new BillingService(databaseService, redisService, configService, stripe);
  return { service, databaseService, stripe };
};

describe('BillingService.getEntitlements', () => {
  it('should project free-tier entitlements when no subscription exists', async () => {
    const { service } = createService({ rows: [] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'free', status: 'none', aiEnabled: true, hasPaymentMethod: false });
    expect(entitlements.paymentMethod).toBeUndefined();
  });

  it('should surface the default saved card on the projection (redesign R1)', async () => {
    const { service } = createService({
      rows: [],
      environment: { STRIPE_SECRET_KEY: 'sk_test_x' },
      stripeCustomerId: 'cus_1',
      configureStripe: (stripe) => {
        stripe.customers.retrieve.mockResolvedValue({
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Stripe API field
          invoice_settings: { default_payment_method: { id: 'pm_1', card: { brand: 'visa', last4: '4242' } } },
        } as never);
      },
    });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements.hasPaymentMethod).toBe(true);
    expect(entitlements.paymentMethod).toStrictEqual({ brand: 'visa', last4: '4242' });
  });

  it('should project pro entitlements for an active subscription (S54)', async () => {
    const { service } = createService({ rows: [subscriptionRow({})] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({
      tier: 'pro',
      status: 'active',
      canUseProKernels: true,
      cancelAtPeriodEnd: false,
    });
    expect(entitlements.currentPeriodEnd).toStrictEqual(new Date('2026-08-01T00:00:00Z'));
  });

  it('should keep pro until period end when cancellation is scheduled (S5)', async () => {
    const { service } = createService({ rows: [subscriptionRow({ cancelAtPeriodEnd: true })] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'pro', status: 'active', cancelAtPeriodEnd: true });
  });

  it('should keep Pro through the 7-day dunning grace while surfacing past_due (S8/B9)', async () => {
    // Renewal failure time ≈ periodEnd: one day ago puts us inside the window.
    const periodEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service } = createService({ rows: [subscriptionRow({ status: 'past_due', periodEnd })] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'pro', status: 'past_due', canUseProKernels: true });
  });

  it('should suspend to free once the dunning grace lapses — credits untouched (S8/B9)', async () => {
    const periodEnd = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { service } = createService({ rows: [subscriptionRow({ status: 'past_due', periodEnd })] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'free', status: 'past_due', canUseProKernels: false });
  });

  it('should treat canceled and incomplete subscriptions as free (S6/S54)', async () => {
    for (const status of ['canceled', 'incomplete', 'incomplete_expired', 'unpaid']) {
      const { service } = createService({ rows: [subscriptionRow({ status })] });
      // oxlint-disable-next-line no-await-in-loop -- table-driven statuses assert sequentially for readable failures
      const entitlements = await service.getEntitlements('user_1');
      expect(entitlements.tier).toBe('free');
    }
  });

  it('should prefer the live subscription over stale history rows', async () => {
    const { service } = createService({
      rows: [
        subscriptionRow({ id: 'sub_old', status: 'canceled', periodEnd: new Date('2026-06-01T00:00:00Z') }),
        subscriptionRow({ id: 'sub_new', status: 'active' }),
      ],
    });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'pro', status: 'active' });
  });

  it('should fail closed on unrecognised plan names', async () => {
    const { service } = createService({ rows: [subscriptionRow({ plan: 'platinum' })] });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements.tier).toBe('free');
  });

  it('should zeroe free-tier AI when the kill switch is off but leaves pro untouched (S55/AD19)', async () => {
    const free = createService({ rows: [], environment: { FREE_TIER_AI_ENABLED: false } });
    const pro = createService({ rows: [subscriptionRow({})], environment: { FREE_TIER_AI_ENABLED: false } });

    await expect(free.service.getEntitlements('user_1')).resolves.toMatchObject({ aiEnabled: false });
    await expect(pro.service.getEntitlements('user_1')).resolves.toMatchObject({ aiEnabled: true });
  });

  it('should merge sanitized enterprise overrides and ignore unknown keys (S12/Q28)', async () => {
    const { service } = createService({
      rows: [subscriptionRow({ plan: 'enterprise' })],
      overrides: {
        geospecConcurrentRuns: 16,
        canUseGeoSpecCiApi: false,
        monthlyGrantMicro: 123, // Grant amounts are router-owned, not entitlement overrides
        tier: 'free', // Never overridable
      },
    });

    const entitlements = await service.getEntitlements('user_1');

    expect(entitlements).toMatchObject({ tier: 'enterprise', geospecConcurrentRuns: 16, canUseGeoSpecCiApi: false });
  });

  it('should force trainingConsent false on paid tiers and mirror the privacy opt-in on free (AD15)', async () => {
    const freeOptedIn = createService({ rows: [], allowsAiTraining: true });
    const proOptedIn = createService({ rows: [subscriptionRow({})], allowsAiTraining: true });

    await expect(freeOptedIn.service.getEntitlements('user_1')).resolves.toMatchObject({ trainingConsent: true });
    await expect(proOptedIn.service.getEntitlements('user_1')).resolves.toMatchObject({ trainingConsent: false });
  });

  it('should serve the cached projection without touching the database (S56)', async () => {
    const databaseService = mockDeep<DatabaseService>();
    const redisService = mockDeep<RedisService>();
    const { service } = createService({ rows: [subscriptionRow({})] });
    const first = await service.getEntitlements('user_1');

    const cachedRedis = mockDeep<RedisService>();
    cachedRedis.client.get.mockResolvedValue(JSON.stringify(serializeEntitlements(first)));
    const configService = mock<ConfigService<Environment, true>>();
    configService.get.mockImplementation(
      ((key: string) => ({ STRIPE_SECRET_KEY: '', FREE_TIER_AI_ENABLED: true })[key]) as never,
    );
    const cachedService = new BillingService(databaseService, cachedRedis, configService, mockDeep<Stripe>());

    const entitlements = await cachedService.getEntitlements('user_1');

    expect(entitlements).toStrictEqual(first);
    expect(databaseService.database.query.subscription.findMany).not.toHaveBeenCalled();
    void redisService;
  });
});

describe('BillingService.invalidateEntitlements', () => {
  it('should drop the cache key', async () => {
    const redisService = mockDeep<RedisService>();
    redisService.client.del.mockResolvedValue(1 as never);
    const configService = mock<ConfigService<Environment, true>>();
    configService.get.mockImplementation((() => '') as never);
    const service = new BillingService(mockDeep<DatabaseService>(), redisService, configService, mockDeep<Stripe>());

    await service.invalidateEntitlements('user_1');

    expect(redisService.client.del).toHaveBeenCalledWith('tau:billing:entitlements:user_1');
  });

  it('should never throw when redis is unavailable', async () => {
    const redisService = mockDeep<RedisService>();
    redisService.client.del.mockRejectedValue(new Error('redis down'));
    const configService = mock<ConfigService<Environment, true>>();
    configService.get.mockImplementation((() => '') as never);
    const service = new BillingService(mockDeep<DatabaseService>(), redisService, configService, mockDeep<Stripe>());

    await expect(service.invalidateEntitlements('user_1')).resolves.toBeUndefined();
  });
});

describe('BillingService.isStripeConfigured', () => {
  it('should reflect whether a secret key is present', () => {
    const withKey = createService({ rows: [], environment: { STRIPE_SECRET_KEY: 'sk_test_x' } });
    const withoutKey = createService({ rows: [] });

    expect(withKey.service.isStripeConfigured()).toBe(true);
    expect(withoutKey.service.isStripeConfigured()).toBe(false);
  });
});

// Silence the projection's advisory-cache warn logs in test output.
vi.mock('@nestjs/common', async (importOriginal) => {
  const actual = await importOriginal<typeof NestCommon>();
  class SilentLogger extends actual.Logger {
    public override warn(): void {
      /* Silenced in tests. */
    }

    public override log(): void {
      /* Silenced in tests. */
    }
  }
  return { ...actual, Logger: SilentLogger };
});
