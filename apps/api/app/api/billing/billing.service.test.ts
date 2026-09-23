/* eslint-disable @typescript-eslint/naming-convention -- Configuration keys mirror the environment contract. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import type Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { BillingService } from '#api/billing/billing.service.js';
import type { DatabaseService } from '#database/database.service.js';
import type { Environment } from '#config/environment.config.js';
import type { subscription, user, billingOwnerBinding, billingStripeCustomer } from '#database/schema.js';
import { resolveDefaultCard } from '#api/billing/resolve-default-card.js';

vi.mock('#api/billing/resolve-default-card.js', () => ({ resolveDefaultCard: vi.fn() }));
const now = new Date('2026-09-06T12:00:00Z');
type SubscriptionRow = typeof subscription.$inferSelect;

const row = (fields: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  ...mock<SubscriptionRow>(),
  id: 'sub_local',
  accountId: 'account-a',
  environment: 'development',
  customerBindingId: 'customer-a',
  plan: 'pro',
  status: 'active',
  paidThrough: new Date('2026-10-01T00:00:00Z'),
  failedRenewalInvoiceId: null,
  graceEndsAt: null,
  cancelAtPeriodEnd: false,
  offerSnapshot: mock<NonNullable<SubscriptionRow['offerSnapshot']>>(),
  ...fields,
});

const createService = (rows: SubscriptionRow[], bound = true) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const database = mockDeep<DatabaseService>();
  database.database.query.user.findFirst.mockResolvedValue(mock<typeof user.$inferSelect>({ allowsAiTraining: true }));
  database.database.query.billingOwnerBinding.findFirst.mockResolvedValue(
    bound
      ? mock<typeof billingOwnerBinding.$inferSelect>({
          id: 'binding-a',
          accountId: 'account-a',
          authUserId: 'user-a',
          environment: 'development',
          revokedAt: null,
        })
      : undefined,
  );
  database.database.query.subscription.findMany.mockResolvedValue(rows);
  database.database.query.billingStripeCustomer.findFirst.mockResolvedValue(
    mock<typeof billingStripeCustomer.$inferSelect>({ stripeCustomerId: 'cus_owned' }),
  );
  const config = new ConfigService<Environment, true>({
    BILLING_ENVIRONMENT: 'development',
    STRIPE_READ_SECRET_KEY: 'rk_test_fixture',
    STRIPE_ACCOUNT_ID: 'acct_fixture',
    STRIPE_LIVEMODE: false,
  });
  const service = new BillingService(database, config, mockDeep<Stripe>());
  vi.mocked(resolveDefaultCard).mockResolvedValue(undefined);
  return { database, service };
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('owned paid access deadlines', () => {
  it('grants nothing to an unbound user or to an active label without an earned deadline', async () => {
    const unbound = createService([row()], false);
    expect(await unbound.service.getEntitlements('user-a')).toMatchObject({ tier: 'free' });
    expect(unbound.database.database.query.subscription.findMany).not.toHaveBeenCalled();
    expect(vi.mocked(resolveDefaultCard)).not.toHaveBeenCalled();
    const expired = createService([row({ paidThrough: new Date('2026-08-01T00:00:00Z') })]);
    expect(await expired.service.getEntitlements('user-a')).toMatchObject({ tier: 'free' });
  });

  it('retains earned access after cancellation and despite an unavailable saved card', async () => {
    const { service } = createService([row({ status: 'canceled', cancelAtPeriodEnd: true })]);
    expect(await service.getEntitlements('user-a')).toMatchObject({
      tier: 'pro',
      status: 'canceled',
      hasPaymentMethod: false,
      paidThrough: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('uses fixed grace once the paid-through deadline has passed', async () => {
    const expired = createService([
      row({
        status: 'past_due',
        paidThrough: new Date('2026-08-01T00:00:00Z'),
        failedRenewalInvoiceId: 'in_failed',
        graceEndsAt: new Date('2026-08-08T00:00:00Z'),
      }),
    ]);
    expect(await expired.service.getEntitlements('user-a')).toMatchObject({ tier: 'free', status: 'past_due' });
    const current = createService([
      row({
        status: 'past_due',
        paidThrough: new Date('2026-09-01T00:00:00Z'),
        failedRenewalInvoiceId: 'in_current',
        graceEndsAt: new Date('2026-09-08T00:00:00Z'),
      }),
    ]);
    expect(await current.service.getEntitlements('user-a')).toMatchObject({ tier: 'pro', status: 'past_due' });
  });

  it('reads fresh financial state on every projection without Redis authority', async () => {
    const { service, database } = createService([row()]);
    const paid = await service.getEntitlements('user-a');
    expect(paid.tier).toBe('pro');
    database.database.query.subscription.findMany.mockResolvedValue([row({ paidThrough: null })]);
    const expired = await service.getEntitlements('user-a');
    expect(expired.tier).toBe('free');
    expect(database.database.query.subscription.findMany).toHaveBeenCalledTimes(2);
  });

  it('uses only the stable Customer for advisory card display', async () => {
    const { service } = createService([row()]);
    vi.mocked(resolveDefaultCard).mockResolvedValue({ id: 'pm_owned', brand: 'visa', last4: '4242' });
    expect(await service.getEntitlements('user-a')).toMatchObject({
      tier: 'pro',
      hasPaymentMethod: true,
      paymentMethod: { brand: 'visa', last4: '4242' },
      trainingConsent: false,
    });
    expect(vi.mocked(resolveDefaultCard)).toHaveBeenCalledWith(expect.anything(), 'cus_owned');
  });

  it('retains free privacy preference and refuses unknown plan names', async () => {
    const { service } = createService([row({ plan: 'unknown' })]);
    expect(await service.getEntitlements('user-a')).toMatchObject({
      tier: 'free',
      trainingConsent: true,
    });
  });
});
